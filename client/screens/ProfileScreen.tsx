import React from "react";
import { View, StyleSheet, Image, Pressable, Linking, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Gradients } from "@/constants/theme";

interface SettingItemProps {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  subtitle?: string;
  onPress?: () => void;
}

function SettingItem({ icon, title, subtitle, onPress }: SettingItemProps) {
  const { theme } = useTheme();

  return (
    <Pressable
      onPress={() => {
        if (Platform.OS !== "web") {
          Haptics.selectionAsync();
        }
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.settingItem,
        { backgroundColor: pressed ? theme.backgroundSecondary : "transparent" },
      ]}
    >
      <View
        style={[styles.settingIcon, { backgroundColor: theme.backgroundSecondary }]}
      >
        <Feather name={icon} size={20} color={theme.link} />
      </View>
      <View style={styles.settingContent}>
        <ThemedText style={styles.settingTitle}>{title}</ThemedText>
        {subtitle ? (
          <ThemedText style={[styles.settingSubtitle, { color: theme.textSecondary }]}>
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      <Feather name="chevron-right" size={20} color={theme.textTertiary} />
    </Pressable>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme, isDark } = useTheme();

  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.xl,
        paddingBottom: tabBarHeight + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
    >
      <View style={styles.profileHeader}>
        <LinearGradient
          colors={Gradients.primary as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.avatarGradient}
        >
          <View style={[styles.avatarInner, { backgroundColor: theme.backgroundRoot }]}>
            <Image
              source={require("../../assets/images/icon.png")}
              style={styles.avatarImage}
              resizeMode="contain"
            />
          </View>
        </LinearGradient>
        <ThemedText type="h3" style={styles.appName}>
          AI Agent Builder
        </ThemedText>
        <ThemedText style={[styles.appVersion, { color: theme.textSecondary }]}>
          Version 1.0.0
        </ThemedText>
      </View>

      <Card elevation={2} style={styles.card}>
        <SettingItem
          icon="info"
          title="About"
          subtitle="Learn more about AI Agent Builder"
        />
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <SettingItem
          icon="book-open"
          title="Documentation"
          subtitle="Read the user guide"
        />
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <SettingItem
          icon="message-circle"
          title="Feedback"
          subtitle="Send us your thoughts"
        />
      </Card>

      <Card elevation={2} style={styles.card}>
        <SettingItem
          icon="moon"
          title="Appearance"
          subtitle={isDark ? "Dark mode" : "Light mode"}
        />
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <SettingItem
          icon="bell"
          title="Notifications"
          subtitle="Manage notifications"
        />
      </Card>

      <View style={styles.footer}>
        <ThemedText style={[styles.footerText, { color: theme.textTertiary }]}>
          Powered by Replit AI Integrations
        </ThemedText>
        <ThemedText style={[styles.footerText, { color: theme.textTertiary }]}>
          Built with OpenAI GPT-5.2
        </ThemedText>
      </View>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  profileHeader: {
    alignItems: "center",
    marginBottom: Spacing["3xl"],
  },
  avatarGradient: {
    width: 96,
    height: 96,
    borderRadius: 48,
    padding: 3,
    marginBottom: Spacing.lg,
  },
  avatarInner: {
    flex: 1,
    borderRadius: 45,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImage: {
    width: 60,
    height: 60,
  },
  appName: {
    marginBottom: Spacing.xs,
  },
  appVersion: {
    fontSize: 14,
  },
  card: {
    marginBottom: Spacing.lg,
    padding: 0,
    overflow: "hidden",
  },
  settingItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: "500",
  },
  settingSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  divider: {
    height: 1,
    marginLeft: 68,
  },
  footer: {
    alignItems: "center",
    marginTop: Spacing.xl,
    paddingBottom: Spacing.xl,
  },
  footerText: {
    fontSize: 12,
    marginBottom: Spacing.xs,
  },
});
