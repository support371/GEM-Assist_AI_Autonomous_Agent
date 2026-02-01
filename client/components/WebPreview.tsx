import React, { useState, useRef } from "react";
import { View, StyleSheet, Pressable, Platform, ActivityIndicator } from "react-native";
import { WebView } from "react-native-webview";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";

interface WebPreviewProps {
  html: string;
  css?: string;
  js?: string;
  onClose: () => void;
}

export function WebPreview({ html, css, js, onClose }: WebPreviewProps) {
  const { theme } = useTheme();
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const webViewRef = useRef<WebView>(null);

  const viewModes = {
    desktop: { width: "100%", icon: "monitor" as const },
    tablet: { width: 768, icon: "tablet" as const },
    mobile: { width: 375, icon: "smartphone" as const },
  };

  const fullHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    ${css || ""}
  </style>
</head>
<body>
  ${html}
  <script>${js || ""}</script>
</body>
</html>
  `;

  const handleRefresh = () => {
    webViewRef.current?.reload();
  };

  if (Platform.OS === "web") {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundDefault }]}>
        <View style={[styles.toolbar, { borderBottomColor: theme.border }]}>
          <View style={styles.viewModes}>
            {(Object.keys(viewModes) as Array<keyof typeof viewModes>).map((mode) => (
              <Pressable
                key={mode}
                onPress={() => setViewMode(mode)}
                style={[
                  styles.modeButton,
                  viewMode === mode && { backgroundColor: theme.link + "20" },
                ]}
              >
                <Feather
                  name={viewModes[mode].icon}
                  size={18}
                  color={viewMode === mode ? theme.link : theme.textSecondary}
                />
              </Pressable>
            ))}
          </View>
          <View style={styles.actions}>
            <Pressable onPress={handleRefresh} style={styles.actionButton}>
              <Feather name="refresh-cw" size={18} color={theme.textSecondary} />
            </Pressable>
            <Pressable onPress={onClose} style={styles.actionButton}>
              <Feather name="x" size={18} color={theme.textSecondary} />
            </Pressable>
          </View>
        </View>

        <View style={styles.previewContainer}>
          <iframe
            srcDoc={fullHtml}
            style={{
              width: typeof viewModes[viewMode].width === "number" 
                ? viewModes[viewMode].width 
                : "100%",
              height: "100%",
              border: "none",
              backgroundColor: "#FFFFFF",
              borderRadius: BorderRadius.sm,
            }}
            title="Preview"
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundDefault }]}>
      <View style={[styles.toolbar, { borderBottomColor: theme.border }]}>
        <ThemedText style={styles.urlText}>Live Preview</ThemedText>
        <View style={styles.actions}>
          <Pressable onPress={handleRefresh} style={styles.actionButton}>
            <Feather name="refresh-cw" size={18} color={theme.textSecondary} />
          </Pressable>
          <Pressable onPress={onClose} style={styles.actionButton}>
            <Feather name="x" size={18} color={theme.textSecondary} />
          </Pressable>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.link} />
        </View>
      ) : null}

      <WebView
        ref={webViewRef}
        source={{ html: fullHtml }}
        style={[styles.webView, isLoading && styles.hidden]}
        onLoadEnd={() => setIsLoading(false)}
        originWhitelist={["*"]}
        javaScriptEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  viewModes: {
    flexDirection: "row",
    gap: Spacing.xs,
  },
  modeButton: {
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  urlText: {
    fontSize: 14,
    fontWeight: "500",
  },
  actions: {
    flexDirection: "row",
    gap: Spacing.xs,
  },
  actionButton: {
    padding: Spacing.sm,
  },
  previewContainer: {
    flex: 1,
    alignItems: "center",
    padding: Spacing.md,
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  webView: {
    flex: 1,
  },
  hidden: {
    opacity: 0,
  },
});
