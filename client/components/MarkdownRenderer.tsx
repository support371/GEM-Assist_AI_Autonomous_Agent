import React, { useMemo } from "react";
import { View, StyleSheet, Pressable, Linking, Platform } from "react-native";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Fonts } from "@/constants/theme";

interface MarkdownRendererProps {
  content: string;
  isUser?: boolean;
}

interface TextSegment {
  type: "text" | "bold" | "italic" | "code" | "link" | "heading" | "listItem" | "blockquote";
  content: string;
  url?: string;
  level?: number;
}

function parseInlineMarkdown(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      segments.push({ type: "link", content: linkMatch[1], url: linkMatch[2] });
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
    if (boldMatch) {
      segments.push({ type: "bold", content: boldMatch[1] });
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    const italicMatch = remaining.match(/^\*([^*]+)\*/);
    if (italicMatch) {
      segments.push({ type: "italic", content: italicMatch[1] });
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      segments.push({ type: "code", content: codeMatch[1] });
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    const nextSpecialIndex = remaining.search(/\[|\*|`/);
    if (nextSpecialIndex === -1) {
      segments.push({ type: "text", content: remaining });
      break;
    } else if (nextSpecialIndex === 0) {
      segments.push({ type: "text", content: remaining[0] });
      remaining = remaining.slice(1);
    } else {
      segments.push({ type: "text", content: remaining.slice(0, nextSpecialIndex) });
      remaining = remaining.slice(nextSpecialIndex);
    }
  }

  return segments;
}

function parseMarkdown(content: string): TextSegment[][] {
  const lines = content.split("\n");
  const blocks: TextSegment[][] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      blocks.push([{
        type: "heading",
        content: headingMatch[2],
        level: headingMatch[1].length,
      }]);
      continue;
    }

    const listMatch = line.match(/^[\s]*[-*+]\s+(.+)$/);
    if (listMatch) {
      const inlineSegments = parseInlineMarkdown(listMatch[1]);
      blocks.push([{ type: "listItem", content: "" }, ...inlineSegments]);
      continue;
    }

    const numberedListMatch = line.match(/^[\s]*\d+\.\s+(.+)$/);
    if (numberedListMatch) {
      const inlineSegments = parseInlineMarkdown(numberedListMatch[1]);
      blocks.push([{ type: "listItem", content: "" }, ...inlineSegments]);
      continue;
    }

    const blockquoteMatch = line.match(/^>\s*(.+)$/);
    if (blockquoteMatch) {
      const inlineSegments = parseInlineMarkdown(blockquoteMatch[1]);
      blocks.push([{ type: "blockquote", content: "" }, ...inlineSegments]);
      continue;
    }

    if (line.trim() === "") {
      blocks.push([{ type: "text", content: "\n" }]);
      continue;
    }

    blocks.push(parseInlineMarkdown(line));
  }

  return blocks;
}

export function MarkdownRenderer({ content, isUser = false }: MarkdownRendererProps) {
  const { theme, isDark } = useTheme();

  const blocks = useMemo(() => parseMarkdown(content), [content]);

  const handleLinkPress = (url: string) => {
    Linking.openURL(url).catch((err) => console.error("Failed to open URL:", err));
  };

  const renderSegment = (segment: TextSegment, index: number) => {
    const textColor = isUser ? "#FFFFFF" : theme.text;

    switch (segment.type) {
      case "bold":
        return (
          <ThemedText key={index} style={[styles.text, styles.bold, { color: textColor }]}>
            {segment.content}
          </ThemedText>
        );

      case "italic":
        return (
          <ThemedText key={index} style={[styles.text, styles.italic, { color: textColor }]}>
            {segment.content}
          </ThemedText>
        );

      case "code":
        return (
          <ThemedText
            key={index}
            style={[
              styles.inlineCode,
              {
                backgroundColor: isUser ? "rgba(255,255,255,0.2)" : theme.codeBackground,
                color: isUser ? "#FFFFFF" : theme.codeText,
                fontFamily: Fonts?.mono || "monospace",
              },
            ]}
          >
            {segment.content}
          </ThemedText>
        );

      case "link":
        return (
          <ThemedText
            key={index}
            style={[styles.link, { color: isUser ? "#A5D6FF" : theme.link }]}
            onPress={() => segment.url && handleLinkPress(segment.url)}
          >
            {segment.content}
          </ThemedText>
        );

      case "heading":
        const headingStyles = [
          styles.h1,
          styles.h2,
          styles.h3,
          styles.h4,
          styles.h5,
          styles.h6,
        ];
        return (
          <ThemedText
            key={index}
            style={[headingStyles[(segment.level || 1) - 1], { color: textColor }]}
          >
            {segment.content}
          </ThemedText>
        );

      default:
        return (
          <ThemedText key={index} style={[styles.text, { color: textColor }]}>
            {segment.content}
          </ThemedText>
        );
    }
  };

  const renderBlock = (segments: TextSegment[], blockIndex: number) => {
    if (segments.length === 0) return null;

    const firstSegment = segments[0];

    if (firstSegment.type === "listItem") {
      return (
        <View key={blockIndex} style={styles.listItem}>
          <ThemedText style={[styles.bullet, { color: isUser ? "#FFFFFF" : theme.textSecondary }]}>
            {"\u2022"}
          </ThemedText>
          <ThemedText style={styles.listContent}>
            {segments.slice(1).map((seg, i) => renderSegment(seg, i))}
          </ThemedText>
        </View>
      );
    }

    if (firstSegment.type === "blockquote") {
      return (
        <View
          key={blockIndex}
          style={[
            styles.blockquote,
            { borderLeftColor: isUser ? "rgba(255,255,255,0.5)" : theme.link },
          ]}
        >
          <ThemedText style={[styles.blockquoteText, { color: isUser ? "#FFFFFF" : theme.textSecondary }]}>
            {segments.slice(1).map((seg, i) => renderSegment(seg, i))}
          </ThemedText>
        </View>
      );
    }

    if (firstSegment.type === "heading") {
      return (
        <View key={blockIndex} style={styles.headingContainer}>
          {renderSegment(firstSegment, 0)}
        </View>
      );
    }

    return (
      <ThemedText key={blockIndex} style={styles.paragraph}>
        {segments.map((seg, i) => renderSegment(seg, i))}
      </ThemedText>
    );
  };

  return (
    <View style={styles.container}>
      {blocks.map((block, index) => renderBlock(block, index))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  paragraph: {
    marginBottom: Spacing.xs,
  },
  text: {
    fontSize: 15,
    lineHeight: 22,
  },
  bold: {
    fontWeight: "700",
  },
  italic: {
    fontStyle: "italic",
  },
  inlineCode: {
    fontSize: 13,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  link: {
    textDecorationLine: "underline",
  },
  h1: {
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 32,
    marginBottom: Spacing.sm,
  },
  h2: {
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 28,
    marginBottom: Spacing.sm,
  },
  h3: {
    fontSize: 18,
    fontWeight: "600",
    lineHeight: 26,
    marginBottom: Spacing.xs,
  },
  h4: {
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 24,
    marginBottom: Spacing.xs,
  },
  h5: {
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 22,
    marginBottom: Spacing.xs,
  },
  h6: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    marginBottom: Spacing.xs,
  },
  headingContainer: {
    marginTop: Spacing.sm,
  },
  listItem: {
    flexDirection: "row",
    marginBottom: Spacing.xs,
  },
  bullet: {
    width: 20,
    fontSize: 15,
    lineHeight: 22,
  },
  listContent: {
    flex: 1,
  },
  blockquote: {
    borderLeftWidth: 3,
    paddingLeft: Spacing.md,
    marginVertical: Spacing.sm,
  },
  blockquoteText: {
    fontSize: 14,
    fontStyle: "italic",
    lineHeight: 20,
  },
});
