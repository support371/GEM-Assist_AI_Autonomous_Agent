import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import type { Conversation } from "@/types/chat";

interface ConversationItemProps {
  conversation: Conversation;
  onPress: () => void;
  onDelete: () => void;
  isActive?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function ConversationItem({
  conversation,
  onPress,
  onDelete,
  isActive = false,
}: ConversationItemProps) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.98);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString();
  };

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.container,
        animatedStyle,
        {
          backgroundColor: isActive
            ? theme.backgroundSecondary
            : theme.backgroundDefault,
          borderColor: isActive ? theme.link : "transparent",
        },
      ]}
    >
      <View style={styles.iconContainer}>
        <View
          style={[
            styles.icon,
            { backgroundColor: isActive ? theme.link : theme.backgroundTertiary },
          ]}
        >
          <Feather
            name="message-square"
            size={16}
            color={isActive ? "#FFFFFF" : theme.textSecondary}
          />
        </View>
      </View>
      <View style={styles.content}>
        <ThemedText
          numberOfLines={1}
          style={[styles.title, { color: isActive ? theme.link : theme.text }]}
        >
          {conversation.title}
        </ThemedText>
        <ThemedText style={[styles.date, { color: theme.textTertiary }]}>
          {formatDate(conversation.createdAt)}
        </ThemedText>
      </View>
      <Pressable
        onPress={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        hitSlop={8}
        style={styles.deleteButton}
      >
        <Feather name="trash-2" size={16} color={theme.textTertiary} />
      </Pressable>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  iconContainer: {
    marginRight: Spacing.md,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: "500",
    marginBottom: 2,
  },
  date: {
    fontSize: 12,
  },
  deleteButton: {
    padding: Spacing.xs,
  },
});
