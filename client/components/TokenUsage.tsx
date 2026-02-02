import React, { useState, useEffect } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";

interface TokenUsageProps {
  inputTokens: number;
  outputTokens: number;
  totalTokens?: number;
  estimatedCost?: number;
  showDetails?: boolean;
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + "K";
  }
  return num.toString();
}

function formatCost(cost: number): string {
  if (cost < 0.01) {
    return "<$0.01";
  }
  return `$${cost.toFixed(2)}`;
}

export function TokenUsage({
  inputTokens,
  outputTokens,
  totalTokens,
  estimatedCost,
  showDetails = false,
}: TokenUsageProps) {
  const { theme } = useTheme();
  const [expanded, setExpanded] = useState(showDetails);
  const height = useSharedValue(showDetails ? 120 : 40);
  const rotation = useSharedValue(showDetails ? 180 : 0);

  const total = totalTokens || inputTokens + outputTokens;
  const cost = estimatedCost || (total * 0.00001);

  const toggleExpand = () => {
    setExpanded(!expanded);
    height.value = withSpring(expanded ? 40 : 120);
    rotation.value = withTiming(expanded ? 0 : 180);
  };

  const animatedContainerStyle = useAnimatedStyle(() => ({
    height: height.value,
  }));

  const animatedArrowStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const getUsageLevel = (tokens: number) => {
    if (tokens < 1000) return { label: "Low", color: theme.success };
    if (tokens < 5000) return { label: "Medium", color: theme.warning };
    return { label: "High", color: theme.error };
  };

  const usageLevel = getUsageLevel(total);

  return (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor: theme.backgroundSecondary, borderColor: theme.border },
        animatedContainerStyle,
      ]}
    >
      <Pressable onPress={toggleExpand} style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.statusDot, { backgroundColor: usageLevel.color }]} />
          <ThemedText style={styles.headerText}>
            {formatNumber(total)} tokens
          </ThemedText>
          <View style={[styles.costBadge, { backgroundColor: theme.link + "20" }]}>
            <ThemedText style={[styles.costText, { color: theme.link }]}>
              {formatCost(cost)}
            </ThemedText>
          </View>
        </View>
        <Animated.View style={animatedArrowStyle}>
          <Feather name="chevron-down" size={16} color={theme.textTertiary} />
        </Animated.View>
      </Pressable>

      {expanded ? (
        <View style={styles.details}>
          <View style={styles.detailRow}>
            <View style={styles.detailItem}>
              <Feather name="arrow-up" size={14} color={theme.textTertiary} />
              <ThemedText style={[styles.detailLabel, { color: theme.textSecondary }]}>
                Input
              </ThemedText>
              <ThemedText style={styles.detailValue}>
                {formatNumber(inputTokens)}
              </ThemedText>
            </View>
            <View style={styles.detailDivider} />
            <View style={styles.detailItem}>
              <Feather name="arrow-down" size={14} color={theme.textTertiary} />
              <ThemedText style={[styles.detailLabel, { color: theme.textSecondary }]}>
                Output
              </ThemedText>
              <ThemedText style={styles.detailValue}>
                {formatNumber(outputTokens)}
              </ThemedText>
            </View>
          </View>

          <View style={[styles.progressContainer, { backgroundColor: theme.backgroundTertiary }]}>
            <View
              style={[
                styles.progressInput,
                {
                  backgroundColor: theme.link,
                  width: `${(inputTokens / total) * 100}%`,
                },
              ]}
            />
            <View
              style={[
                styles.progressOutput,
                {
                  backgroundColor: theme.linkSecondary,
                  width: `${(outputTokens / total) * 100}%`,
                },
              ]}
            />
          </View>

          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: theme.link }]} />
              <ThemedText style={[styles.legendText, { color: theme.textTertiary }]}>
                Input ({Math.round((inputTokens / total) * 100)}%)
              </ThemedText>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: theme.linkSecondary }]} />
              <ThemedText style={[styles.legendText, { color: theme.textTertiary }]}>
                Output ({Math.round((outputTokens / total) * 100)}%)
              </ThemedText>
            </View>
          </View>
        </View>
      ) : null}
    </Animated.View>
  );
}

interface TokenUsageBadgeProps {
  tokens: number;
}

export function TokenUsageBadge({ tokens }: TokenUsageBadgeProps) {
  const { theme } = useTheme();

  return (
    <View style={[styles.badge, { backgroundColor: theme.backgroundSecondary }]}>
      <Feather name="zap" size={12} color={theme.textTertiary} />
      <ThemedText style={[styles.badgeText, { color: theme.textSecondary }]}>
        {formatNumber(tokens)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    height: 40,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  headerText: {
    fontSize: 13,
    fontWeight: "500",
  },
  costBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  costText: {
    fontSize: 11,
    fontWeight: "600",
  },
  details: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  detailItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  detailDivider: {
    width: 1,
    height: 20,
    marginHorizontal: Spacing.md,
  },
  detailLabel: {
    fontSize: 12,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: "600",
  },
  progressContainer: {
    height: 6,
    borderRadius: 3,
    flexDirection: "row",
    overflow: "hidden",
  },
  progressInput: {
    height: "100%",
  },
  progressOutput: {
    height: "100%",
  },
  legend: {
    flexDirection: "row",
    gap: Spacing.lg,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
    gap: 4,
  },
  badgeText: {
    fontSize: 11,
  },
});
