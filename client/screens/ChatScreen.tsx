import React, { useState, useEffect, useRef, useCallback } from "react";
import { View, FlatList, StyleSheet, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useRoute, useNavigation, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { MessageBubble } from "@/components/MessageBubble";
import { ChatInput } from "@/components/ChatInput";
import { EmptyState } from "@/components/EmptyState";
import { LoadingDots } from "@/components/LoadingDots";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";
import type { Message, StreamEvent, Conversation } from "@/types/chat";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

type ChatScreenRouteProp = RouteProp<RootStackParamList, "Chat">;
type ChatScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, "Chat">;

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

  useEffect(() => {
    fetchConversation();
  }, [conversationId]);

  const fetchConversation = async () => {
    try {
      const baseUrl = getApiUrl();
      const response = await fetch(`${baseUrl}api/conversations/${conversationId}`);
      if (response.ok) {
        const data: Conversation & { messages: Message[] } = await response.json();
        setMessages(data.messages || []);
        navigation.setOptions({ headerTitle: data.title });
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
            <ThemedText style={{ color: "#FFFFFF", fontSize: 12 }}>AI</ThemedText>
          </View>
          <LoadingDots />
        </View>
      </View>
    );
  };

  const displayMessages = messages;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      <FlatList
        ref={flatListRef}
        data={displayMessages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingTop: headerHeight + Spacing.lg,
            paddingBottom: Spacing.lg,
          },
        ]}
        ListEmptyComponent={
          !isLoading ? (
            <EmptyState type="conversation" />
          ) : null
        }
        ListFooterComponent={
          <>
            {renderStreamingMessage()}
            {renderThinking()}
          </>
        }
        onContentSizeChange={() => {
          if (displayMessages.length > 0 || isStreaming) {
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
              ? "Generating..."
              : "Describe what you want to build..."
          }
        />
      </View>
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
});
