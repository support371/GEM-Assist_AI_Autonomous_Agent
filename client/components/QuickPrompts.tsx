import React from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Gradients } from "@/constants/theme";

interface QuickPromptsProps {
  onSelect: (prompt: string) => void;
}

const QUICK_PROMPTS = [
  {
    icon: "layout" as const,
    title: "Landing Page",
    prompt: "Create a modern, responsive landing page with a hero section, feature highlights, pricing table with 3 tiers, testimonials carousel, and a contact form. Use a dark theme with gradient accents.",
  },
  {
    icon: "bar-chart-2" as const,
    title: "Dashboard",
    prompt: "Build an analytics dashboard with KPI cards showing key metrics, a line chart for revenue over time, a data table with sorting and filtering, and quick action buttons. Include dark mode support.",
  },
  {
    icon: "shopping-cart" as const,
    title: "E-commerce",
    prompt: "Create a product listing page with a grid of product cards, each showing image, title, price, and add-to-cart button. Include filtering by category, price range, and a search bar.",
  },
  {
    icon: "user" as const,
    title: "Auth System",
    prompt: "Build a complete authentication system with login, registration, password reset, and email verification forms. Include proper validation, error handling, and loading states.",
  },
  {
    icon: "message-circle" as const,
    title: "Chat Interface",
    prompt: "Create a real-time chat interface with message bubbles, typing indicators, read receipts, and a message input with emoji picker. Support for text, images, and file attachments.",
  },
  {
    icon: "database" as const,
    title: "API Integration",
    prompt: "Design a REST API with CRUD operations for a resource management system. Include proper error handling, validation, authentication middleware, and TypeScript types.",
  },
];

export function QuickPrompts({ onSelect }: QuickPromptsProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.container}>
      <ThemedText type="h4" style={styles.title}>
        Quick Start Templates
      </ThemedText>
      <ThemedText style={[styles.subtitle, { color: theme.textSecondary }]}>
        Select a template to get started quickly
      </ThemedText>
      
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {QUICK_PROMPTS.map((prompt, index) => (
          <Pressable
            key={index}
            onPress={() => onSelect(prompt.prompt)}
            style={({ pressed }) => [
              styles.card,
              {
                backgroundColor: theme.backgroundSecondary,
                borderColor: theme.border,
                opacity: pressed ? 0.8 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              },
            ]}
          >
            <LinearGradient
              colors={Gradients.primary as [string, string]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.iconContainer}
            >
              <Feather name={prompt.icon} size={20} color="#FFFFFF" />
            </LinearGradient>
            <ThemedText style={styles.cardTitle}>{prompt.title}</ThemedText>
            <ThemedText
              style={[styles.cardDescription, { color: theme.textSecondary }]}
              numberOfLines={2}
            >
              {prompt.prompt.slice(0, 80)}...
            </ThemedText>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: Spacing.xl,
  },
  title: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    fontSize: 14,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  card: {
    width: 180,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: Spacing.xs,
  },
  cardDescription: {
    fontSize: 12,
    lineHeight: 16,
  },
});
