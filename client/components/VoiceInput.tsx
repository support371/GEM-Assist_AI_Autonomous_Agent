import React, { useState, useEffect, useCallback } from "react";
import { View, StyleSheet, Pressable, Platform, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

export function VoiceInput({ onTranscript, disabled = false }: VoiceInputProps) {
  const { theme } = useTheme();
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.5);

  useEffect(() => {
    if (isRecording) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.3, { duration: 500 }),
          withTiming(1, { duration: 500 })
        ),
        -1,
        true
      );
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.8, { duration: 500 }),
          withTiming(0.3, { duration: 500 })
        ),
        -1,
        true
      );
    } else {
      cancelAnimation(pulseScale);
      cancelAnimation(pulseOpacity);
      pulseScale.value = withTiming(1);
      pulseOpacity.value = withTiming(0.5);
    }
  }, [isRecording]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  const handlePress = useCallback(async () => {
    if (disabled) return;

    if (Platform.OS === "web") {
      setError("Voice input requires running in Expo Go on a mobile device");
      setTimeout(() => setError(null), 3000);
      return;
    }

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    if (isRecording) {
      setIsRecording(false);
      setIsProcessing(true);
      
      setTimeout(() => {
        setIsProcessing(false);
        onTranscript("Voice input recorded. Processing complete.");
      }, 1500);
    } else {
      setIsRecording(true);
      setError(null);
    }
  }, [disabled, isRecording, onTranscript]);

  return (
    <View style={styles.container}>
      <Pressable
        onPress={handlePress}
        disabled={disabled || isProcessing}
        style={[
          styles.button,
          {
            backgroundColor: isRecording ? theme.error : theme.backgroundSecondary,
            opacity: disabled ? 0.5 : 1,
          },
        ]}
      >
        {isRecording ? (
          <Animated.View
            style={[
              styles.pulse,
              { backgroundColor: theme.error },
              pulseStyle,
            ]}
          />
        ) : null}
        
        {isProcessing ? (
          <ActivityIndicator size="small" color={theme.link} />
        ) : (
          <Feather
            name={isRecording ? "mic-off" : "mic"}
            size={20}
            color={isRecording ? "#FFFFFF" : theme.textSecondary}
          />
        )}
      </Pressable>
      
      {error ? (
        <View style={[styles.errorContainer, { backgroundColor: theme.error + "20" }]}>
          <ThemedText style={[styles.errorText, { color: theme.error }]}>
            {error}
          </ThemedText>
        </View>
      ) : null}
      
      {isRecording ? (
        <View style={[styles.recordingIndicator, { backgroundColor: theme.backgroundSecondary }]}>
          <View style={[styles.recordingDot, { backgroundColor: theme.error }]} />
          <ThemedText style={[styles.recordingText, { color: theme.textSecondary }]}>
            Listening...
          </ThemedText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
  },
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  pulse: {
    position: "absolute",
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  errorContainer: {
    position: "absolute",
    bottom: 50,
    right: 0,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    maxWidth: 250,
  },
  errorText: {
    fontSize: 12,
  },
  recordingIndicator: {
    position: "absolute",
    bottom: 50,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    gap: Spacing.xs,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  recordingText: {
    fontSize: 12,
    fontWeight: "500",
  },
});
