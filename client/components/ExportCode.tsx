import React, { useState, useCallback } from "react";
import { View, StyleSheet, Pressable, Platform, Alert } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import type { CodeBlock } from "@/types/chat";

interface ExportCodeProps {
  codeBlocks: CodeBlock[];
  onClose?: () => void;
}

type ExportOption = {
  id: string;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  description: string;
};

const exportOptions: ExportOption[] = [
  {
    id: "clipboard",
    label: "Copy All",
    icon: "copy",
    description: "Copy all code to clipboard",
  },
  {
    id: "share",
    label: "Share",
    icon: "share-2",
    description: "Share as a text file",
  },
  {
    id: "download",
    label: "Download",
    icon: "download",
    description: "Save to device",
  },
];

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

export function ExportCode({ codeBlocks, onClose }: ExportCodeProps) {
  const { theme } = useTheme();
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  const getAllCode = useCallback(() => {
    return codeBlocks
      .map((block) => {
        const filename = block.filename || `code.${getExtension(block.language)}`;
        return `// ===== ${filename} =====\n// Language: ${block.language}\n\n${block.code}\n`;
      })
      .join("\n\n");
  }, [codeBlocks]);

  const handleExport = useCallback(async (optionId: string) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    const allCode = getAllCode();

    try {
      switch (optionId) {
        case "clipboard":
          await Clipboard.setStringAsync(allCode);
          setExportStatus("Copied to clipboard!");
          break;

        case "share":
          if (Platform.OS === "web") {
            await Clipboard.setStringAsync(allCode);
            setExportStatus("Copied to clipboard (sharing not available on web)");
          } else {
            const fileUri = FileSystem.cacheDirectory + "exported_code.txt";
            await FileSystem.writeAsStringAsync(fileUri, allCode);
            
            const canShare = await Sharing.isAvailableAsync();
            if (canShare) {
              await Sharing.shareAsync(fileUri, {
                mimeType: "text/plain",
                dialogTitle: "Share Code",
              });
              setExportStatus("Shared successfully!");
            } else {
              await Clipboard.setStringAsync(allCode);
              setExportStatus("Copied to clipboard (sharing not available)");
            }
          }
          break;

        case "download":
          if (Platform.OS === "web") {
            const blob = new Blob([allCode], { type: "text/plain" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "exported_code.txt";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            setExportStatus("Download started!");
          } else {
            const fileUri = FileSystem.documentDirectory + "exported_code.txt";
            await FileSystem.writeAsStringAsync(fileUri, allCode);
            setExportStatus("Saved to documents!");
          }
          break;
      }

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error("Export error:", error);
      setExportStatus("Export failed. Please try again.");
    }

    setTimeout(() => setExportStatus(null), 3000);
  }, [getAllCode]);

  if (codeBlocks.length === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: theme.backgroundSecondary }]}>
        <Feather name="file-text" size={32} color={theme.textTertiary} />
        <ThemedText style={[styles.emptyText, { color: theme.textSecondary }]}>
          No code to export
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="h4">Export Code</ThemedText>
        <ThemedText style={[styles.fileCount, { color: theme.textSecondary }]}>
          {codeBlocks.length} file{codeBlocks.length !== 1 ? "s" : ""}
        </ThemedText>
      </View>

      <View style={styles.options}>
        {exportOptions.map((option) => (
          <Pressable
            key={option.id}
            onPress={() => handleExport(option.id)}
            style={[
              styles.optionButton,
              { backgroundColor: theme.backgroundSecondary, borderColor: theme.border },
            ]}
          >
            <View style={[styles.optionIcon, { backgroundColor: theme.link + "20" }]}>
              <Feather name={option.icon} size={20} color={theme.link} />
            </View>
            <View style={styles.optionContent}>
              <ThemedText style={styles.optionLabel}>{option.label}</ThemedText>
              <ThemedText style={[styles.optionDescription, { color: theme.textSecondary }]}>
                {option.description}
              </ThemedText>
            </View>
            <Feather name="chevron-right" size={20} color={theme.textTertiary} />
          </Pressable>
        ))}
      </View>

      {exportStatus ? (
        <View style={[styles.statusContainer, { backgroundColor: theme.success + "20" }]}>
          <Feather name="check-circle" size={16} color={theme.success} />
          <ThemedText style={[styles.statusText, { color: theme.success }]}>
            {exportStatus}
          </ThemedText>
        </View>
      ) : null}

      <View style={styles.previewSection}>
        <ThemedText style={[styles.previewTitle, { color: theme.textSecondary }]}>
          Files to export:
        </ThemedText>
        {codeBlocks.map((block, index) => (
          <View
            key={index}
            style={[styles.fileItem, { backgroundColor: theme.backgroundSecondary }]}
          >
            <Feather name="file-text" size={14} color={theme.link} />
            <ThemedText style={styles.fileName} numberOfLines={1}>
              {block.filename || `${block.language}.${getExtension(block.language)}`}
            </ThemedText>
            <ThemedText style={[styles.fileSize, { color: theme.textTertiary }]}>
              {block.code.split("\n").length} lines
            </ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.lg,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  fileCount: {
    fontSize: 14,
  },
  options: {
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  optionButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    gap: Spacing.md,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  optionContent: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  optionDescription: {
    fontSize: 12,
  },
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  statusText: {
    fontSize: 14,
    fontWeight: "500",
  },
  previewSection: {
    gap: Spacing.sm,
  },
  previewTitle: {
    fontSize: 12,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: Spacing.xs,
  },
  fileItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    gap: Spacing.sm,
  },
  fileName: {
    flex: 1,
    fontSize: 13,
  },
  fileSize: {
    fontSize: 11,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing["3xl"],
    borderRadius: BorderRadius.lg,
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: 14,
  },
});
