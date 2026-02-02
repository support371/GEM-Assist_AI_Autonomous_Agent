import {
  withSpring,
  withTiming,
  withSequence,
  withRepeat,
  Easing,
  WithSpringConfig,
  WithTimingConfig,
} from "react-native-reanimated";
import { AnimationDurations } from "@/constants/theme";

export const springConfigs = {
  gentle: {
    damping: 20,
    mass: 1,
    stiffness: 100,
    overshootClamping: false,
  } as WithSpringConfig,
  snappy: {
    damping: 15,
    mass: 0.3,
    stiffness: 150,
    overshootClamping: true,
    energyThreshold: 0.001,
  } as WithSpringConfig,
  bouncy: {
    damping: 10,
    mass: 0.5,
    stiffness: 200,
    overshootClamping: false,
  } as WithSpringConfig,
};

export const timingConfigs = {
  fast: {
    duration: AnimationDurations.fast,
    easing: Easing.out(Easing.cubic),
  } as WithTimingConfig,
  normal: {
    duration: AnimationDurations.normal,
    easing: Easing.out(Easing.cubic),
  } as WithTimingConfig,
  slow: {
    duration: AnimationDurations.slow,
    easing: Easing.out(Easing.cubic),
  } as WithTimingConfig,
};

export const fadeIn = (duration = AnimationDurations.normal) => {
  "worklet";
  return withTiming(1, { duration, easing: Easing.out(Easing.cubic) });
};

export const fadeOut = (duration = AnimationDurations.normal) => {
  "worklet";
  return withTiming(0, { duration, easing: Easing.out(Easing.cubic) });
};

export const scaleIn = (config = springConfigs.snappy) => {
  "worklet";
  return withSpring(1, config);
};

export const scaleOut = (config = springConfigs.snappy) => {
  "worklet";
  return withSpring(0.95, config);
};

export const slideInFromBottom = (distance = 20) => {
  "worklet";
  return withSpring(0, springConfigs.gentle);
};

export const pulse = (minOpacity = 0.7, maxOpacity = 1) => {
  "worklet";
  return withRepeat(
    withSequence(
      withTiming(minOpacity, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      withTiming(maxOpacity, { duration: 1000, easing: Easing.inOut(Easing.ease) })
    ),
    -1,
    true
  );
};

export const shimmer = () => {
  "worklet";
  return withRepeat(
    withTiming(1, { duration: 2000, easing: Easing.linear }),
    -1,
    false
  );
};

export const float = (distance = 10) => {
  "worklet";
  return withRepeat(
    withSequence(
      withTiming(-distance, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.ease) })
    ),
    -1,
    true
  );
};

export const pressScale = {
  onPressIn: (scale: { value: number }) => {
    "worklet";
    scale.value = withSpring(0.98, springConfigs.snappy);
  },
  onPressOut: (scale: { value: number }) => {
    "worklet";
    scale.value = withSpring(1, springConfigs.snappy);
  },
};

export const hoverLift = {
  onHoverIn: (translateY: { value: number }) => {
    "worklet";
    translateY.value = withSpring(-5, springConfigs.gentle);
  },
  onHoverOut: (translateY: { value: number }) => {
    "worklet";
    translateY.value = withSpring(0, springConfigs.gentle);
  },
};
