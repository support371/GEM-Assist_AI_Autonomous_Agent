import React from "react";
import { View, StyleSheet, Image } from "react-native";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing } from "@/constants/theme";

interface EmptyStateProps {
  type: "conversation" | "code" | "history";
  title?: string;
  description?: string;
}

const images = {
  conversation: require("../../assets/images/empty-conversation.png"),
  code: require("../../assets/images/empty-code.png"),
  history: require("../../assets/images/empty-conversation.png"),
};

const defaultContent = {
  conversation: {
    title: "Start a New Conversation",
    description: "Describe what you want to build and I'll generate the code for you.",
  },
  code: {
    title: "No Code Generated Yet",
    description: "Your generated code will appear here.",
  },
  history: {
    title: "No Conversations Yet",
    description: "Start a new chat to begin building with AI.",
  },
};

export function EmptyState({
  type,
  title,
  description,
}: EmptyStateProps) {
  const { theme } = useTheme();
  const content = defaultContent[type];

  return (
    <View style={styles.container}>
      <Image source={images[type]} style={styles.image} resizeMode="contain" />
      <ThemedText type="h4" style={styles.title}>
        {title || content.title}
      </ThemedText>
      <ThemedText
        style={[styles.description, { color: theme.textSecondary }]}
      >
        {description || content.description}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing["3xl"],
  },
  image: {
    width: 180,
    height: 180,
    marginBottom: Spacing["2xl"],
    opacity: 0.8,
  },
  title: {
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  description: {
    textAlign: "center",
    fontSize: 15,
    lineHeight: 22,
  },
});
