import React, { useState, useCallback } from "react";
import { View, TextInput, StyleSheet, Pressable, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { VoiceInput } from "@/components/VoiceInput";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Gradients } from "@/constants/theme";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  showVoiceInput?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function ChatInput({
  onSend,
  disabled = false,
  placeholder = "Describe what you want to build...",
  showVoiceInput = true,
}: ChatInputProps) {
  const { theme } = useTheme();
  const [message, setMessage] = useState("");
  const scale = useSharedValue(1);

  const handleVoiceTranscript = useCallback((text: string) => {
    setMessage((prev) => prev + (prev ? " " : "") + text);
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = message.trim();
    if (trimmed && !disabled) {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      onSend(trimmed);
      setMessage("");
    }
  }, [message, disabled, onSend]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.95);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1);
  };

  const canSend = message.trim().length > 0 && !disabled;

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundDefault }]}>
      <View
        style={[
          styles.inputContainer,
          {
            backgroundColor: theme.backgroundSecondary,
            borderColor: theme.border,
          },
        ]}
      >
        {showVoiceInput && !message ? (
          <View style={styles.voiceInputWrapper}>
            <VoiceInput onTranscript={handleVoiceTranscript} disabled={disabled} />
          </View>
        ) : null}
        <TextInput
          style={[styles.input, { color: theme.text }]}
          value={message}
          onChangeText={setMessage}
          placeholder={placeholder}
          placeholderTextColor={theme.textTertiary}
          multiline
          maxLength={4000}
          editable={!disabled}
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
        />
        <AnimatedPressable
          onPress={handleSend}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          disabled={!canSend}
          style={[styles.sendButton, animatedStyle, { opacity: canSend ? 1 : 0.4 }]}
        >
          <LinearGradient
            colors={Gradients.primary as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.sendButtonGradient}
          >
            <Feather name="send" size={18} color="#FFFFFF" />
          </LinearGradient>
        </AnimatedPressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    paddingLeft: Spacing.sm,
    paddingRight: Spacing.sm,
    paddingVertical: Spacing.sm,
    minHeight: 52,
  },
  voiceInputWrapper: {
    marginRight: Spacing.xs,
    marginBottom: 2,
  },
  input: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    maxHeight: 120,
    paddingTop: Platform.OS === "ios" ? 8 : 4,
    paddingBottom: Platform.OS === "ios" ? 8 : 4,
    paddingLeft: Spacing.sm,
  },
  sendButton: {
    marginLeft: Spacing.sm,
    marginBottom: 2,
  },
  sendButtonGradient: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
});
