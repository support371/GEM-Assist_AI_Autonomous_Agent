import React from "react";
import { View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  FadeIn,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Gradients } from "@/constants/theme";

interface AgentStatusProps {
  status: "analyzing" | "planning" | "researching" | "generating" | "complete";
  step?: string;
  progress?: number;
}

const statusConfig = {
  analyzing: { 
    icon: "search" as const, 
    label: "Analyzing Requirements", 
    color: "#8B5CF6",
    description: "Understanding your request and identifying key requirements"
  },
  planning: { 
    icon: "list" as const, 
    label: "Planning Approach", 
    color: "#3B82F6",
    description: "Breaking down the task and choosing optimal strategies"
  },
  researching: { 
    icon: "book-open" as const, 
    label: "Researching", 
    color: "#10B981",
    description: "Gathering best practices and relevant patterns"
  },
  generating: { 
    icon: "code" as const, 
    label: "Generating Code", 
    color: "#F59E0B",
    description: "Building production-ready solution"
  },
  complete: { 
    icon: "check-circle" as const, 
    label: "Complete", 
    color: "#10B981",
    description: "Task completed successfully"
  },
};

export function AgentStatus({ status, step, progress }: AgentStatusProps) {
  const { theme } = useTheme();
  const config = statusConfig[status];
  const rotation = useSharedValue(0);
  const pulse = useSharedValue(1);

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
      pulse.value = withRepeat(
        withSequence(
          withTiming(1.05, { duration: 600 }),
          withTiming(1, { duration: 600 })
        ),
        -1
      );
    } else {
      rotation.value = 0;
      pulse.value = 1;
    }
  }, [status]);

  const animatedIconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const animatedContainerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  const stepIcons: Record<string, "zap" | "cpu" | "layers" | "package"> = {
    "Analyzing requirements": "zap",
    "Planning approach": "cpu",
    "Researching": "layers",
    "Generating solution": "package",
  };

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      style={[animatedContainerStyle]}
    >
      <LinearGradient
        colors={[config.color + "15", config.color + "05"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.container, { borderColor: config.color + "30" }]}
      >
        <View style={styles.mainRow}>
          <Animated.View 
            style={[
              styles.iconContainer, 
              { backgroundColor: config.color + "20" },
              animatedIconStyle
            ]}
          >
            <Feather name={config.icon} size={18} color={config.color} />
          </Animated.View>
          
          <View style={styles.textContainer}>
            <ThemedText style={[styles.label, { color: config.color }]}>
              {config.label}
            </ThemedText>
            <ThemedText style={[styles.description, { color: theme.textSecondary }]}>
              {step || config.description}
            </ThemedText>
          </View>

          {status !== "complete" ? (
            <View style={styles.pulseIndicator}>
              <View style={[styles.pulseDot, { backgroundColor: config.color }]} />
            </View>
          ) : null}
        </View>

        {progress !== undefined && status !== "complete" ? (
          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { backgroundColor: theme.backgroundSecondary }]}>
              <View 
                style={[
                  styles.progressFill, 
                  { 
                    backgroundColor: config.color,
                    width: `${progress}%` 
                  }
                ]} 
              />
            </View>
          </View>
        ) : null}
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
  },
  mainRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  textContainer: {
    flex: 1,
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  description: {
    fontSize: 12,
    lineHeight: 16,
  },
  pulseIndicator: {
    width: 12,
    height: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  progressContainer: {
    marginTop: Spacing.md,
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
});
