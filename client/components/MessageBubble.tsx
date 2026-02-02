import React, { useState, useCallback } from "react";
import { View, StyleSheet, Pressable, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { SyntaxHighlighter } from "@/components/SyntaxHighlighter";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Fonts } from "@/constants/theme";
import type { Message } from "@/types/chat";

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
}

export function MessageBubble({ message, isStreaming = false }: MessageBubbleProps) {
  const { theme, isDark } = useTheme();
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const isUser = message.role === "user";

  const handleCopyCode = useCallback(async (code: string, index: number) => {
    await Clipboard.setStringAsync(code);
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  }, []);

  const handleCopyAll = useCallback(async () => {
    await Clipboard.setStringAsync(message.content);
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [message.content]);

  const renderContent = () => {
    const content = message.content;
    const codeBlockRegex = /```(\w+)?\n?([\s\S]*?)```/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;
    let codeIndex = 0;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        const textBefore = content.slice(lastIndex, match.index).trim();
        if (textBefore) {
          parts.push(
            <MarkdownRenderer
              key={`text-${lastIndex}`}
              content={textBefore}
              isUser={isUser}
            />
          );
        }
      }

      const language = match[1] || "code";
      const code = match[2].trim();
      const currentIndex = codeIndex;
      codeIndex++;

      parts.push(
        <View
          key={`code-${match.index}`}
          style={[styles.codeBlock, { backgroundColor: theme.codeBackground }]}
        >
          <View style={[styles.codeHeader, { borderBottomColor: theme.border }]}>
            <View style={styles.codeHeaderLeft}>
              <View style={[styles.languageBadge, { backgroundColor: theme.link + "30" }]}>
                <ThemedText style={[styles.codeLanguage, { color: theme.link }]}>
                  {language.toUpperCase()}
                </ThemedText>
              </View>
            </View>
            <Pressable 
              onPress={() => handleCopyCode(code, currentIndex)} 
              style={styles.copyButton}
              hitSlop={8}
            >
              <Feather
                name={copiedIndex === currentIndex ? "check" : "copy"}
                size={14}
                color={copiedIndex === currentIndex ? theme.success : theme.textTertiary}
              />
              <ThemedText style={[styles.copyText, { color: theme.textTertiary }]}>
                {copiedIndex === currentIndex ? "Copied" : "Copy"}
              </ThemedText>
            </Pressable>
          </View>
          <SyntaxHighlighter code={code} language={language} />
        </View>
      );

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < content.length) {
      const remainingText = content.slice(lastIndex).trim();
      if (remainingText) {
        parts.push(
          <MarkdownRenderer
            key={`text-${lastIndex}`}
            content={remainingText}
            isUser={isUser}
          />
        );
      }
    }

    if (parts.length === 0) {
      parts.push(
        <MarkdownRenderer
          key="full"
          content={content}
          isUser={isUser}
        />
      );
    }

    return parts;
  };

  return (
    <View
      style={[
        styles.container,
        isUser ? styles.userContainer : styles.assistantContainer,
      ]}
    >
      {!isUser ? (
        <View
          style={[
            styles.avatar,
            { backgroundColor: theme.link },
          ]}
        >
          <Feather name="cpu" size={16} color="#FFFFFF" />
        </View>
      ) : null}
      <View
        style={[
          styles.bubble,
          isUser
            ? [styles.userBubble, { backgroundColor: theme.link }]
            : [styles.assistantBubble, { backgroundColor: theme.backgroundSecondary }],
        ]}
      >
        {renderContent()}
        {isStreaming ? (
          <View style={styles.cursorContainer}>
            <View style={[styles.cursor, { backgroundColor: theme.link }]} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  userContainer: {
    justifyContent: "flex-end",
  },
  assistantContainer: {
    justifyContent: "flex-start",
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.sm,
    marginTop: 2,
  },
  bubble: {
    maxWidth: "85%",
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  userBubble: {
    borderBottomRightRadius: BorderRadius.xs,
  },
  assistantBubble: {
    borderTopLeftRadius: BorderRadius.xs,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  codeBlock: {
    borderRadius: BorderRadius.sm,
    marginVertical: Spacing.sm,
    overflow: "hidden",
  },
  codeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  codeHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  languageBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  codeLanguage: {
    fontSize: 10,
    fontWeight: "600",
  },
  copyButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.xs,
    gap: 4,
  },
  copyText: {
    fontSize: 11,
  },
  codeText: {
    fontSize: 13,
    lineHeight: 20,
    padding: Spacing.md,
  },
  cursorContainer: {
    marginTop: Spacing.xs,
  },
  cursor: {
    width: 8,
    height: 16,
    borderRadius: 2,
    opacity: 0.7,
  },
});
