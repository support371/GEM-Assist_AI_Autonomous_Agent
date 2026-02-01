import React from "react";
import { View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Gradients } from "@/constants/theme";

interface EmptyStateProps {
  type: "conversation" | "code" | "history";
  title?: string;
  description?: string;
}

const defaultContent = {
  conversation: {
    title: "AI Agent Ready",
    description: "I can build complete applications, research best practices, design architectures, and generate production-ready code. What would you like me to create?",
    icon: "cpu" as const,
  },
  code: {
    title: "No Code Generated Yet",
    description: "Generated code and files will appear here with syntax highlighting and copy functionality.",
    icon: "code" as const,
  },
  history: {
    title: "No Conversations Yet",
    description: "Start a new conversation to begin building with your AI agent.",
    icon: "message-circle" as const,
  },
};

const capabilities = [
  { icon: "search" as const, label: "Requirement Analysis" },
  { icon: "book-open" as const, label: "Best Practice Research" },
  { icon: "layers" as const, label: "Architecture Design" },
  { icon: "code" as const, label: "Full Code Generation" },
  { icon: "eye" as const, label: "Live Preview" },
  { icon: "zap" as const, label: "Autonomous Execution" },
];

export function EmptyState({
  type,
  title,
  description,
}: EmptyStateProps) {
  const { theme } = useTheme();
  const content = defaultContent[type];

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={Gradients.primary as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.iconWrapper}
      >
        <View style={styles.iconInner}>
          <Feather name={content.icon} size={32} color="#FFFFFF" />
        </View>
      </LinearGradient>

      <ThemedText type="h4" style={styles.title}>
        {title || content.title}
      </ThemedText>
      <ThemedText
        style={[styles.description, { color: theme.textSecondary }]}
      >
        {description || content.description}
      </ThemedText>

      {type === "conversation" ? (
        <View style={styles.capabilitiesContainer}>
          <ThemedText style={[styles.capabilitiesTitle, { color: theme.textTertiary }]}>
            Agent Capabilities
          </ThemedText>
          <View style={styles.capabilitiesGrid}>
            {capabilities.map((cap, index) => (
              <View 
                key={index} 
                style={[styles.capabilityItem, { backgroundColor: theme.backgroundSecondary }]}
              >
                <Feather name={cap.icon} size={14} color={theme.link} />
                <ThemedText style={[styles.capabilityLabel, { color: theme.textSecondary }]}>
                  {cap.label}
                </ThemedText>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing["2xl"],
  },
  iconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing["2xl"],
  },
  iconInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  description: {
    textAlign: "center",
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 320,
  },
  capabilitiesContainer: {
    marginTop: Spacing["2xl"],
    width: "100%",
  },
  capabilitiesTitle: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: Spacing.md,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  capabilitiesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  capabilityItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    gap: Spacing.xs,
  },
  capabilityLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
});
