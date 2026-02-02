import React from "react";
import { View, StyleSheet, Pressable, ScrollView, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Gradients } from "@/constants/theme";

export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  icon: keyof typeof Feather.glyphMap;
  systemPrompt: string;
  gradient: readonly [string, string];
  category: "development" | "design" | "data" | "general";
}

export const agentTemplates: AgentTemplate[] = [
  {
    id: "fullstack",
    name: "Full-Stack Developer",
    description: "Expert in React, Node.js, databases, and complete web applications",
    icon: "layers",
    gradient: Gradients.primary as [string, string],
    category: "development",
    systemPrompt: "You are a senior full-stack developer specializing in React, TypeScript, Node.js, and PostgreSQL. You create complete, production-ready applications with clean architecture, proper error handling, and modern best practices. Always provide complete, runnable code.",
  },
  {
    id: "react",
    name: "React Specialist",
    description: "Advanced React patterns, hooks, state management, and component design",
    icon: "code",
    gradient: ["#61DAFB", "#087EA4"] as const,
    category: "development",
    systemPrompt: "You are a React expert specializing in modern React patterns, custom hooks, context management, and component architecture. You excel at creating reusable, performant components with TypeScript. Focus on clean component design and React best practices.",
  },
  {
    id: "api",
    name: "API Designer",
    description: "RESTful APIs, GraphQL, authentication, and backend architecture",
    icon: "server",
    gradient: ["#10B981", "#059669"] as const,
    category: "development",
    systemPrompt: "You are a backend API architect specializing in RESTful design, GraphQL, authentication systems, and database optimization. You create secure, scalable, and well-documented APIs with proper error handling and validation.",
  },
  {
    id: "uiux",
    name: "UI/UX Expert",
    description: "Beautiful interfaces, animations, accessibility, and design systems",
    icon: "layout",
    gradient: ["#EC4899", "#BE185D"] as const,
    category: "design",
    systemPrompt: "You are a UI/UX design expert who creates beautiful, accessible interfaces with smooth animations and modern styling. You prioritize user experience, responsive design, and visual polish. Always include proper CSS animations and micro-interactions.",
  },
  {
    id: "python",
    name: "Python Expert",
    description: "Python development, scripting, automation, and data processing",
    icon: "terminal",
    gradient: ["#3776AB", "#FFD43B"] as const,
    category: "development",
    systemPrompt: "You are a Python expert specializing in clean, Pythonic code, automation scripts, data processing, and API development with FastAPI or Flask. You follow PEP 8 guidelines and Python best practices.",
  },
  {
    id: "data",
    name: "Data Engineer",
    description: "SQL, database design, data pipelines, and analytics",
    icon: "database",
    gradient: ["#F59E0B", "#D97706"] as const,
    category: "data",
    systemPrompt: "You are a data engineering expert specializing in SQL optimization, database schema design, ETL pipelines, and analytics queries. You create efficient, normalized database structures with proper indexing.",
  },
  {
    id: "mobile",
    name: "Mobile Developer",
    description: "React Native, Expo, and cross-platform mobile development",
    icon: "smartphone",
    gradient: ["#8B5CF6", "#6D28D9"] as const,
    category: "development",
    systemPrompt: "You are a mobile development expert specializing in React Native and Expo. You create performant, cross-platform mobile applications with native-feeling UX, proper navigation, and platform-specific optimizations.",
  },
  {
    id: "devops",
    name: "DevOps Engineer",
    description: "Docker, CI/CD, cloud infrastructure, and deployment automation",
    icon: "cloud",
    gradient: ["#0EA5E9", "#0284C7"] as const,
    category: "development",
    systemPrompt: "You are a DevOps engineer specializing in containerization, CI/CD pipelines, cloud infrastructure, and deployment automation. You create reliable, scalable infrastructure with proper monitoring and security.",
  },
];

interface AgentTemplatesProps {
  onSelect: (template: AgentTemplate) => void;
  selectedId?: string;
}

export function AgentTemplates({ onSelect, selectedId }: AgentTemplatesProps) {
  const { theme } = useTheme();

  const handleSelect = (template: AgentTemplate) => {
    if (Platform.OS !== "web") {
      Haptics.selectionAsync();
    }
    onSelect(template);
  };

  return (
    <View style={styles.container}>
      <ThemedText type="h4" style={styles.title}>
        Agent Templates
      </ThemedText>
      <ThemedText style={[styles.subtitle, { color: theme.textSecondary }]}>
        Choose a specialized agent for your task
      </ThemedText>
      
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {agentTemplates.map((template) => (
          <Pressable
            key={template.id}
            onPress={() => handleSelect(template)}
            style={[
              styles.templateCard,
              {
                backgroundColor: theme.backgroundSecondary,
                borderColor: selectedId === template.id ? template.gradient[0] : theme.border,
                borderWidth: selectedId === template.id ? 2 : 1,
              },
            ]}
          >
            <LinearGradient
              colors={template.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.iconContainer}
            >
              <Feather name={template.icon} size={20} color="#FFFFFF" />
            </LinearGradient>
            <ThemedText style={styles.templateName} numberOfLines={1}>
              {template.name}
            </ThemedText>
            <ThemedText
              style={[styles.templateDescription, { color: theme.textSecondary }]}
              numberOfLines={2}
            >
              {template.description}
            </ThemedText>
            {selectedId === template.id ? (
              <View style={[styles.selectedBadge, { backgroundColor: template.gradient[0] }]}>
                <Feather name="check" size={12} color="#FFFFFF" />
              </View>
            ) : null}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

interface AgentTemplateBadgeProps {
  template: AgentTemplate;
  onClear?: () => void;
}

export function AgentTemplateBadge({ template, onClear }: AgentTemplateBadgeProps) {
  const { theme } = useTheme();

  return (
    <View style={[styles.badge, { backgroundColor: template.gradient[0] + "20" }]}>
      <Feather name={template.icon} size={14} color={template.gradient[0]} />
      <ThemedText style={[styles.badgeText, { color: template.gradient[0] }]}>
        {template.name}
      </ThemedText>
      {onClear ? (
        <Pressable onPress={onClear} hitSlop={8}>
          <Feather name="x" size={14} color={template.gradient[0]} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: Spacing.lg,
  },
  title: {
    marginBottom: Spacing.xs,
    paddingHorizontal: Spacing.lg,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  templateCard: {
    width: 160,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    position: "relative",
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  templateName: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: Spacing.xs,
  },
  templateDescription: {
    fontSize: 12,
    lineHeight: 16,
  },
  selectedBadge: {
    position: "absolute",
    top: Spacing.sm,
    right: Spacing.sm,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    gap: Spacing.xs,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "500",
  },
});
