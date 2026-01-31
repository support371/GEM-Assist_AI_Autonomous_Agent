import React, { useState, useCallback } from "react";
import { View, StyleSheet, Pressable, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Fonts } from "@/constants/theme";
import type { Message } from "@/types/chat";

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
}

export function MessageBubble({ message, isStreaming = false }: MessageBubbleProps) {
  const { theme, isDark } = useTheme();
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";

  const handleCopy = useCallback(async () => {
    await Clipboard.setStringAsync(message.content);
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [message.content]);

  const renderContent = () => {
    const content = message.content;
    const codeBlockRegex = /```(\w+)?\n?([\s\S]*?)```/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        const textBefore = content.slice(lastIndex, match.index);
        parts.push(
          <ThemedText key={`text-${lastIndex}`} style={styles.messageText}>
            {textBefore.trim()}
          </ThemedText>
        );
      }

      const language = match[1] || "code";
      const code = match[2].trim();

      parts.push(
        <View
          key={`code-${match.index}`}
          style={[styles.codeBlock, { backgroundColor: theme.codeBackground }]}
        >
          <View style={[styles.codeHeader, { borderBottomColor: theme.border }]}>
            <ThemedText style={[styles.codeLanguage, { color: theme.textTertiary }]}>
              {language}
            </ThemedText>
            <Pressable onPress={handleCopy} style={styles.copyButton}>
              <Feather
                name={copied ? "check" : "copy"}
                size={14}
                color={copied ? theme.success : theme.textTertiary}
              />
            </Pressable>
          </View>
          <ThemedText
            style={[
              styles.codeText,
              { color: theme.codeText, fontFamily: Fonts?.mono || "monospace" },
            ]}
          >
            {code}
          </ThemedText>
        </View>
      );

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < content.length) {
      const remainingText = content.slice(lastIndex).trim();
      if (remainingText) {
        parts.push(
          <ThemedText key={`text-${lastIndex}`} style={styles.messageText}>
            {remainingText}
          </ThemedText>
        );
      }
    }

    if (parts.length === 0) {
      parts.push(
        <ThemedText key="full" style={styles.messageText}>
          {content}
        </ThemedText>
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
            { backgroundColor: isDark ? theme.link : theme.link },
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
    paddingVertical: Spacing.xs,
    borderBottomWidth: 1,
  },
  codeLanguage: {
    fontSize: 12,
    fontWeight: "500",
    textTransform: "uppercase",
  },
  copyButton: {
    padding: Spacing.xs,
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
