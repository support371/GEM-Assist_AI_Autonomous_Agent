import React, { useState, useEffect, useRef, useCallback } from "react";
import { View, FlatList, StyleSheet, Platform, Modal, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useRoute, useNavigation, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { MessageBubble } from "@/components/MessageBubble";
import { ChatInput } from "@/components/ChatInput";
import { EmptyState } from "@/components/EmptyState";
import { LoadingDots } from "@/components/LoadingDots";
import { AgentStatus } from "@/components/AgentStatus";
import { CodePreview } from "@/components/CodePreview";
import { QuickPrompts } from "@/components/QuickPrompts";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";
import type { Message, StreamEvent, CodeBlock } from "@/types/chat";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

type ChatScreenRouteProp = RouteProp<RootStackParamList, "Chat">;
type ChatScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, "Chat">;

function extractCodeBlocks(content: string): CodeBlock[] {
  const codeBlockRegex = /```(\w+)?\n?([\s\S]*?)```/g;
  const blocks: CodeBlock[] = [];
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const language = match[1] || "code";
    const code = match[2].trim();
    if (code.length > 0) {
      blocks.push({ language, code });
    }
  }

  return blocks;
}

export default function ChatScreen() {
  const route = useRoute<ChatScreenRouteProp>();
  const navigation = useNavigation<ChatScreenNavigationProp>();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const flatListRef = useRef<FlatList>(null);

  const { conversationId } = route.params;

  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [agentStatus, setAgentStatus] = useState<StreamEvent["status"]>();
  const [agentStep, setAgentStep] = useState<string>();
  const [showCodePreview, setShowCodePreview] = useState(false);
  const [codeBlocks, setCodeBlocks] = useState<CodeBlock[]>([]);

  useEffect(() => {
    fetchConversation();
  }, [conversationId]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        codeBlocks.length > 0 ? (
          <Pressable
            onPress={() => {
              if (Platform.OS !== "web") {
                Haptics.selectionAsync();
              }
              setShowCodePreview(true);
            }}
            style={styles.headerButton}
          >
            <Feather name="code" size={20} color={theme.link} />
          </Pressable>
        ) : null
      ),
    });
  }, [codeBlocks, theme.link]);

  const fetchConversation = async () => {
    try {
      const baseUrl = getApiUrl();
      const response = await fetch(`${baseUrl}api/conversations/${conversationId}`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
        navigation.setOptions({ headerTitle: data.title });
        
        const allContent = (data.messages || [])
          .filter((m: Message) => m.role === "assistant")
          .map((m: Message) => m.content)
          .join("\n");
        setCodeBlocks(extractCodeBlocks(allContent));
      }
    } catch (error) {
      console.error("Error fetching conversation:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = useCallback(async (content: string) => {
    const userMessage: Message = {
      id: Date.now(),
      conversationId,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsStreaming(true);
    setStreamingContent("");
    setAgentStatus(undefined);
    setAgentStep(undefined);

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    try {
      const baseUrl = getApiUrl();
      const response = await fetch(`${baseUrl}api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader available");

      const decoder = new TextDecoder();
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event: StreamEvent = JSON.parse(line.slice(6));
              
              if (event.status && event.status !== "complete") {
                setAgentStatus(event.status);
                setAgentStep(event.step);
              }
              
              if (event.content) {
                fullContent += event.content;
                setStreamingContent(fullContent);
              }
              
              if (event.titleUpdate) {
                navigation.setOptions({ headerTitle: event.titleUpdate });
              }
              
              if (event.done) {
                const assistantMessage: Message = {
                  id: Date.now() + 1,
                  conversationId,
                  role: "assistant",
                  content: fullContent,
                  createdAt: new Date().toISOString(),
                };
                setMessages((prev) => [...prev, assistantMessage]);
                setStreamingContent("");
                setAgentStatus("complete");
                
                const newBlocks = extractCodeBlocks(fullContent);
                if (newBlocks.length > 0) {
                  setCodeBlocks((prev) => [...prev, ...newBlocks]);
                  if (Platform.OS !== "web") {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  }
                }
              }
            } catch (e) {
            }
          }
        }
      }
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setIsStreaming(false);
      setTimeout(() => {
        setAgentStatus(undefined);
        setAgentStep(undefined);
      }, 2000);
    }
  }, [conversationId, navigation]);

  const renderMessage = useCallback(
    ({ item }: { item: Message }) => (
      <MessageBubble message={item} />
    ),
    []
  );

  const renderStreamingMessage = () => {
    if (!isStreaming || !streamingContent) return null;

    return (
      <MessageBubble
        message={{
          id: -1,
          conversationId,
          role: "assistant",
          content: streamingContent,
          createdAt: new Date().toISOString(),
        }}
        isStreaming
      />
    );
  };

  const renderThinking = () => {
    if (!isStreaming || streamingContent) return null;

    return (
      <View style={[styles.thinkingContainer, { paddingHorizontal: Spacing.lg }]}>
        <View
          style={[
            styles.thinkingBubble,
            { backgroundColor: theme.backgroundSecondary },
          ]}
        >
          <View
            style={[styles.thinkingAvatar, { backgroundColor: theme.link }]}
          >
            <Feather name="cpu" size={14} color="#FFFFFF" />
          </View>
          <LoadingDots />
        </View>
      </View>
    );
  };

  const renderEmptyContent = () => {
    if (isLoading) return null;
    
    return (
      <View style={styles.emptyContainer}>
        <EmptyState type="conversation" />
        <QuickPrompts onSelect={handleSend} />
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      {agentStatus && agentStatus !== "complete" ? (
        <View style={{ paddingTop: headerHeight + Spacing.sm }}>
          <AgentStatus status={agentStatus} step={agentStep} />
        </View>
      ) : null}

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingTop: agentStatus && agentStatus !== "complete" 
              ? Spacing.lg 
              : headerHeight + Spacing.lg,
            paddingBottom: Spacing.lg,
          },
        ]}
        ListEmptyComponent={renderEmptyContent}
        ListFooterComponent={
          <>
            {renderStreamingMessage()}
            {renderThinking()}
          </>
        }
        onContentSizeChange={() => {
          if (messages.length > 0 || isStreaming) {
            flatListRef.current?.scrollToEnd({ animated: true });
          }
        }}
        showsVerticalScrollIndicator={false}
      />
      
      <View style={{ paddingBottom: insets.bottom }}>
        <ChatInput
          onSend={handleSend}
          disabled={isStreaming}
          placeholder={
            isStreaming
              ? "Agent is working..."
              : "Describe what you want to build..."
          }
        />
      </View>

      <Modal
        visible={showCodePreview}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCodePreview(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.backgroundRoot }]}>
          <View style={[styles.modalHeader, { paddingTop: insets.top + Spacing.md }]}>
            <ThemedText type="h4">Generated Code</ThemedText>
            <Pressable onPress={() => setShowCodePreview(false)}>
              <Feather name="x" size={24} color={theme.text} />
            </Pressable>
          </View>
          <CodePreview
            codeBlocks={codeBlocks}
            onClose={() => setShowCodePreview(false)}
          />
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    paddingTop: Spacing["3xl"],
  },
  thinkingContainer: {
    marginBottom: Spacing.lg,
  },
  thinkingBubble: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    alignSelf: "flex-start",
    borderTopLeftRadius: BorderRadius.xs,
  },
  thinkingAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.sm,
  },
  headerButton: {
    padding: Spacing.sm,
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
});
