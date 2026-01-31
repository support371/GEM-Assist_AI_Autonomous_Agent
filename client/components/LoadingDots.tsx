import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  withSequence,
} from "react-native-reanimated";

import { useTheme } from "@/hooks/useTheme";
import { Spacing } from "@/constants/theme";

interface LoadingDotsProps {
  size?: number;
}

export function LoadingDots({ size = 8 }: LoadingDotsProps) {
  const { theme } = useTheme();
  const opacity1 = useSharedValue(0.3);
  const opacity2 = useSharedValue(0.3);
  const opacity3 = useSharedValue(0.3);

  useEffect(() => {
    const animate = (opacityValue: Animated.SharedValue<number>, delay: number) => {
      opacityValue.value = withDelay(
        delay,
        withRepeat(
          withSequence(
            withTiming(1, { duration: 400 }),
            withTiming(0.3, { duration: 400 })
          ),
          -1,
          false
        )
      );
    };

    animate(opacity1, 0);
    animate(opacity2, 150);
    animate(opacity3, 300);
  }, []);

  const dot1Style = useAnimatedStyle(() => ({
    opacity: opacity1.value,
  }));

  const dot2Style = useAnimatedStyle(() => ({
    opacity: opacity2.value,
  }));

  const dot3Style = useAnimatedStyle(() => ({
    opacity: opacity3.value,
  }));

  const dotStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: theme.link,
    marginHorizontal: 3,
  };

  return (
    <View style={styles.container}>
      <Animated.View style={[dotStyle, dot1Style]} />
      <Animated.View style={[dotStyle, dot2Style]} />
      <Animated.View style={[dotStyle, dot3Style]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
});
