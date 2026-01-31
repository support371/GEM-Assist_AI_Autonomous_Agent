import { Platform } from "react-native";

const tintColorLight = "#3B82F6";
const tintColorDark = "#60A5FA";

export const Colors = {
  light: {
    text: "#11181C",
    textSecondary: "#64748B",
    textTertiary: "#94A3B8",
    buttonText: "#FFFFFF",
    tabIconDefault: "#687076",
    tabIconSelected: tintColorLight,
    link: "#3B82F6",
    linkSecondary: "#A855F7",
    backgroundRoot: "#F8FAFC",
    backgroundDefault: "#F1F5F9",
    backgroundSecondary: "#E2E8F0",
    backgroundTertiary: "#CBD5E1",
    success: "#10B981",
    warning: "#F59E0B",
    error: "#EF4444",
    border: "rgba(148, 163, 184, 0.2)",
    borderSecondary: "rgba(148, 163, 184, 0.3)",
    codeBackground: "#1E293B",
    codeText: "#E2E8F0",
  },
  dark: {
    text: "#F8FAFC",
    textSecondary: "#94A3B8",
    textTertiary: "#64748B",
    buttonText: "#FFFFFF",
    tabIconDefault: "#64748B",
    tabIconSelected: tintColorDark,
    link: "#60A5FA",
    linkSecondary: "#C084FC",
    backgroundRoot: "#0F172A",
    backgroundDefault: "#1E293B",
    backgroundSecondary: "#334155",
    backgroundTertiary: "#475569",
    success: "#34D399",
    warning: "#FBBF24",
    error: "#F87171",
    border: "rgba(148, 163, 184, 0.1)",
    borderSecondary: "rgba(148, 163, 184, 0.2)",
    codeBackground: "#0F172A",
    codeText: "#E2E8F0",
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  "4xl": 40,
  "5xl": 48,
  inputHeight: 48,
  buttonHeight: 52,
};

export const BorderRadius = {
  xs: 8,
  sm: 12,
  md: 18,
  lg: 24,
  xl: 30,
  "2xl": 40,
  "3xl": 50,
  full: 9999,
};

export const Typography = {
  h1: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: "700" as const,
  },
  h2: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: "700" as const,
  },
  h3: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: "600" as const,
  },
  h4: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: "600" as const,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "400" as const,
  },
  small: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "400" as const,
  },
  code: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "400" as const,
  },
  link: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "400" as const,
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: "system-ui",
    serif: "ui-serif",
    rounded: "ui-rounded",
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded:
      "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "'JetBrains Mono', 'Fira Code', SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

export const Gradients = {
  primary: ["#3B82F6", "#A855F7"],
  secondary: ["#6366F1", "#EC4899"],
  dark: ["#1E293B", "#0F172A"],
};
