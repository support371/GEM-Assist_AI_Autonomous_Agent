import React, { useState, useCallback } from "react";
import { View, StyleSheet, Pressable, ScrollView, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Fonts } from "@/constants/theme";
import type { CodeBlock } from "@/types/chat";

interface CodePreviewProps {
  codeBlocks: CodeBlock[];
  onClose: () => void;
}

export function CodePreview({ codeBlocks, onClose }: CodePreviewProps) {
  const { theme } = useTheme();
  const [activeIndex, setActiveIndex] = useState(0);
  const [copied, setCopied] = useState(false);

  const activeBlock = codeBlocks[activeIndex];

  const handleCopy = useCallback(async () => {
    if (!activeBlock) return;
    await Clipboard.setStringAsync(activeBlock.code);
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [activeBlock]);

  if (codeBlocks.length === 0) return null;

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundDefault }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <View style={styles.tabs}>
          {codeBlocks.map((block, index) => (
            <Pressable
              key={index}
              onPress={() => setActiveIndex(index)}
              style={[
                styles.tab,
                {
                  backgroundColor:
                    index === activeIndex ? theme.backgroundSecondary : "transparent",
                  borderColor: index === activeIndex ? theme.link : "transparent",
                },
              ]}
            >
              <Feather
                name="file-text"
                size={14}
                color={index === activeIndex ? theme.link : theme.textTertiary}
              />
              <ThemedText
                style={[
                  styles.tabText,
                  { color: index === activeIndex ? theme.link : theme.textSecondary },
                ]}
                numberOfLines={1}
              >
                {block.filename || `${block.language}.${getExtension(block.language)}`}
              </ThemedText>
            </Pressable>
          ))}
        </View>
        <View style={styles.actions}>
          <Pressable onPress={handleCopy} style={styles.actionButton}>
            <Feather
              name={copied ? "check" : "copy"}
              size={18}
              color={copied ? theme.success : theme.textSecondary}
            />
          </Pressable>
          <Pressable onPress={onClose} style={styles.actionButton}>
            <Feather name="x" size={18} color={theme.textSecondary} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={styles.codeContainer}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          <ThemedText
            style={[
              styles.code,
              { color: theme.codeText, fontFamily: Fonts?.mono || "monospace" },
            ]}
          >
            {activeBlock?.code || ""}
          </ThemedText>
        </ScrollView>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: theme.backgroundSecondary }]}>
        <View style={styles.footerInfo}>
          <ThemedText style={[styles.languageBadge, { backgroundColor: theme.link + "20", color: theme.link }]}>
            {activeBlock?.language?.toUpperCase() || "CODE"}
          </ThemedText>
          <ThemedText style={[styles.lineCount, { color: theme.textTertiary }]}>
            {activeBlock?.code?.split("\n").length || 0} lines
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

function getExtension(language: string): string {
  const extensions: Record<string, string> = {
    typescript: "ts",
    javascript: "js",
    tsx: "tsx",
    jsx: "jsx",
    python: "py",
    html: "html",
    css: "css",
    json: "json",
    bash: "sh",
    sql: "sql",
    rust: "rs",
    go: "go",
  };
  return extensions[language.toLowerCase()] || "txt";
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  tabs: {
    flexDirection: "row",
    flex: 1,
    gap: Spacing.xs,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    maxWidth: 150,
  },
  tabText: {
    fontSize: 12,
    marginLeft: Spacing.xs,
    fontWeight: "500",
  },
  actions: {
    flexDirection: "row",
    gap: Spacing.xs,
  },
  actionButton: {
    padding: Spacing.sm,
  },
  codeContainer: {
    flex: 1,
    padding: Spacing.md,
  },
  code: {
    fontSize: 13,
    lineHeight: 20,
  },
  footer: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  footerInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  languageBadge: {
    fontSize: 10,
    fontWeight: "600",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  lineCount: {
    fontSize: 11,
  },
});
