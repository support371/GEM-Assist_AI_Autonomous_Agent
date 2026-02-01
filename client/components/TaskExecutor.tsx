import React from "react";
import { View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  FadeIn,
  FadeOut,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import type { AgentTask } from "@/types/chat";

interface TaskExecutorProps {
  tasks: AgentTask[];
  currentTaskId?: string;
}

export function TaskExecutor({ tasks, currentTaskId }: TaskExecutorProps) {
  const { theme } = useTheme();

  if (tasks.length === 0) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      exiting={FadeOut.duration(200)}
      style={[styles.container, { backgroundColor: theme.backgroundSecondary }]}
    >
      <View style={styles.header}>
        <Feather name="list" size={16} color={theme.link} />
        <ThemedText style={[styles.headerText, { color: theme.link }]}>
          Task Execution
        </ThemedText>
      </View>
      
      <View style={styles.taskList}>
        {tasks.map((task, index) => (
          <TaskItem
            key={task.id}
            task={task}
            isActive={task.id === currentTaskId}
            isLast={index === tasks.length - 1}
          />
        ))}
      </View>
    </Animated.View>
  );
}

interface TaskItemProps {
  task: AgentTask;
  isActive: boolean;
  isLast: boolean;
}

function TaskItem({ task, isActive, isLast }: TaskItemProps) {
  const { theme } = useTheme();
  const rotation = useSharedValue(0);

  React.useEffect(() => {
    if (task.status === "running") {
      rotation.value = withRepeat(withTiming(360, { duration: 1000 }), -1);
    }
  }, [task.status]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const getStatusIcon = () => {
    switch (task.status) {
      case "complete":
        return (
          <View style={[styles.statusIcon, { backgroundColor: theme.success + "20" }]}>
            <Feather name="check" size={12} color={theme.success} />
          </View>
        );
      case "running":
        return (
          <Animated.View style={[styles.statusIcon, { backgroundColor: theme.link + "20" }, spinStyle]}>
            <Feather name="loader" size={12} color={theme.link} />
          </Animated.View>
        );
      default:
        return (
          <View style={[styles.statusIcon, { backgroundColor: theme.textTertiary + "20" }]}>
            <Feather name="circle" size={12} color={theme.textTertiary} />
          </View>
        );
    }
  };

  return (
    <View style={styles.taskItem}>
      <View style={styles.taskIndicator}>
        {getStatusIcon()}
        {!isLast ? (
          <View
            style={[
              styles.taskLine,
              {
                backgroundColor:
                  task.status === "complete" ? theme.success + "40" : theme.border,
              },
            ]}
          />
        ) : null}
      </View>
      <View style={styles.taskContent}>
        <ThemedText
          style={[
            styles.taskName,
            task.status === "complete" && { color: theme.textSecondary },
            isActive && { color: theme.link },
          ]}
        >
          {task.name}
        </ThemedText>
        {task.description ? (
          <ThemedText style={[styles.taskDescription, { color: theme.textTertiary }]}>
            {task.description}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  headerText: {
    fontSize: 13,
    fontWeight: "600",
  },
  taskList: {
    gap: Spacing.xs,
  },
  taskItem: {
    flexDirection: "row",
  },
  taskIndicator: {
    alignItems: "center",
    marginRight: Spacing.md,
  },
  statusIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  taskLine: {
    width: 2,
    flex: 1,
    marginTop: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  taskContent: {
    flex: 1,
    paddingBottom: Spacing.md,
  },
  taskName: {
    fontSize: 14,
    fontWeight: "500",
  },
  taskDescription: {
    fontSize: 12,
    marginTop: 2,
  },
});
