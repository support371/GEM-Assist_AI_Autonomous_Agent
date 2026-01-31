import React from "react";
import { View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";

interface AgentStatusProps {
  status: "analyzing" | "planning" | "researching" | "generating" | "complete";
  step?: string;
}

const statusConfig = {
  analyzing: { icon: "search" as const, label: "Analyzing", color: "#8B5CF6" },
  planning: { icon: "list" as const, label: "Planning", color: "#3B82F6" },
  researching: { icon: "book-open" as const, label: "Researching", color: "#10B981" },
  generating: { icon: "code" as const, label: "Generating", color: "#F59E0B" },
  complete: { icon: "check-circle" as const, label: "Complete", color: "#10B981" },
};

export function AgentStatus({ status, step }: AgentStatusProps) {
  const { theme } = useTheme();
  const config = statusConfig[status];
  const rotation = useSharedValue(0);

  React.useEffect(() => {
    if (status !== "complete") {
      rotation.value = withRepeat(
        withSequence(
          withTiming(10, { duration: 100 }),
          withTiming(-10, { duration: 200 }),
          withTiming(0, { duration: 100 })
        ),
        -1
      );
    } else {
      rotation.value = 0;
    }
  }, [status]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundSecondary }]}>
      <Animated.View style={[styles.iconContainer, { backgroundColor: config.color + "20" }, animatedStyle]}>
        <Feather name={config.icon} size={16} color={config.color} />
      </Animated.View>
      <View style={styles.textContainer}>
        <ThemedText style={[styles.label, { color: config.color }]}>
          {config.label}
        </ThemedText>
        {step ? (
          <ThemedText style={[styles.step, { color: theme.textSecondary }]} numberOfLines={1}>
            {step}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  textContainer: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
  },
  step: {
    fontSize: 12,
    marginTop: 2,
  },
});
