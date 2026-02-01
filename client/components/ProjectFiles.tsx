import React from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import type { CodeBlock } from "@/types/chat";

interface ProjectFilesProps {
  files: CodeBlock[];
  onFileSelect: (index: number) => void;
  selectedIndex: number;
}

const fileIcons: Record<string, string> = {
  typescript: "file-text",
  javascript: "file-text",
  tsx: "file-text",
  jsx: "file-text",
  html: "code",
  css: "hash",
  json: "file",
  python: "file-text",
  sql: "database",
  bash: "terminal",
  markdown: "file-text",
};

const languageColors: Record<string, string> = {
  typescript: "#3178C6",
  javascript: "#F7DF1E",
  tsx: "#3178C6",
  jsx: "#61DAFB",
  html: "#E34F26",
  css: "#1572B6",
  json: "#000000",
  python: "#3776AB",
  sql: "#CC2927",
  bash: "#4EAA25",
  markdown: "#083FA1",
};

export function ProjectFiles({ files, onFileSelect, selectedIndex }: ProjectFilesProps) {
  const { theme } = useTheme();

  if (files.length === 0) return null;

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundSecondary }]}>
      <View style={styles.header}>
        <Feather name="folder" size={16} color={theme.link} />
        <ThemedText style={[styles.headerText, { color: theme.text }]}>
          Project Files
        </ThemedText>
        <View style={[styles.badge, { backgroundColor: theme.link + "20" }]}>
          <ThemedText style={[styles.badgeText, { color: theme.link }]}>
            {files.length}
          </ThemedText>
        </View>
      </View>

      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.fileList}
      >
        {files.map((file, index) => {
          const iconName = fileIcons[file.language.toLowerCase()] || "file";
          const langColor = languageColors[file.language.toLowerCase()] || theme.link;
          const isSelected = index === selectedIndex;

          return (
            <Pressable
              key={index}
              onPress={() => onFileSelect(index)}
              style={[
                styles.fileItem,
                {
                  backgroundColor: isSelected
                    ? theme.link + "15"
                    : theme.backgroundDefault,
                  borderColor: isSelected ? theme.link : theme.border,
                },
              ]}
            >
              <View style={styles.fileIcon}>
                <Feather
                  name={iconName as any}
                  size={14}
                  color={langColor}
                />
              </View>
              <View style={styles.fileInfo}>
                <ThemedText style={styles.fileName} numberOfLines={1}>
                  {file.filename || `file.${getExtension(file.language)}`}
                </ThemedText>
                <ThemedText style={[styles.fileLanguage, { color: theme.textTertiary }]}>
                  {file.language.toUpperCase()}
                </ThemedText>
              </View>
              <View style={[styles.linesBadge, { backgroundColor: theme.backgroundSecondary }]}>
                <ThemedText style={[styles.linesText, { color: theme.textTertiary }]}>
                  {file.code.split("\n").length}L
                </ThemedText>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
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
    markdown: "md",
  };
  return extensions[language.toLowerCase()] || "txt";
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  headerText: {
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  fileList: {
    gap: Spacing.sm,
  },
  fileItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    minWidth: 160,
    gap: Spacing.sm,
  },
  fileIcon: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 13,
    fontWeight: "500",
  },
  fileLanguage: {
    fontSize: 10,
    marginTop: 1,
  },
  linesBadge: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  linesText: {
    fontSize: 10,
    fontWeight: "500",
  },
});
