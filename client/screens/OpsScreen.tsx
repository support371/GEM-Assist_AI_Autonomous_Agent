import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";

type OpsCounts = {
  checked: number;
  healthy: number;
  degraded: number;
  failed: number;
  skipped: number;
};

type OpsSummary = {
  schemaVersion: number;
  generatedAt: string | null;
  overallState: string;
  counts: OpsCounts;
  materialChanges: number;
  resolved: number;
  remoteRequests: number;
  billingGuard?: string;
  message?: string;
};

type OpsCapabilities = {
  mode: string;
  pcIndependent: boolean;
  liveMutationEnabled: boolean;
  remoteRefreshEnabled: boolean;
  authenticatedDetailEnabled: boolean;
  providers: {
    github: boolean;
    http: boolean;
    vercel: boolean;
    supabase: boolean;
  };
  configuredChecks: {
    http: number;
    repositories: number;
    vercelProjects: number;
  };
  guardrails: string[];
};

const emptyCounts: OpsCounts = {
  checked: 0,
  healthy: 0,
  degraded: 0,
  failed: 0,
  skipped: 0,
};

export default function OpsScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [summary, setSummary] = useState<OpsSummary | null>(null);
  const [capabilities, setCapabilities] = useState<OpsCapabilities | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (manual = false) => {
    manual ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const base = getApiUrl();
      const [summaryResponse, capabilitiesResponse] = await Promise.all([
        fetch(new URL("/api/ops/summary", base), { credentials: "include" }),
        fetch(new URL("/api/ops/capabilities", base), { credentials: "include" }),
      ]);

      if (!summaryResponse.ok || !capabilitiesResponse.ok) {
        throw new Error(
          `Operations API unavailable (${summaryResponse.status}/${capabilitiesResponse.status})`,
        );
      }

      setSummary((await summaryResponse.json()) as OpsSummary);
      setCapabilities((await capabilitiesResponse.json()) as OpsCapabilities);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load operations status");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const stateColor = useMemo(() => {
    switch (summary?.overallState) {
      case "HEALTHY":
        return theme.success;
      case "DEGRADED":
        return theme.warning;
      case "ACTION_REQUIRED":
      case "CRITICAL":
        return theme.error;
      default:
        return theme.textSecondary;
    }
  }, [summary?.overallState, theme]);

  const counts = summary?.counts || emptyCounts;
  const providerEntries = capabilities
    ? Object.entries(capabilities.providers)
    : [];

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{
        paddingTop: insets.top + Spacing.xl,
        paddingBottom: insets.bottom + 110,
        paddingHorizontal: Spacing.xl,
      }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void load(true)}
          tintColor={theme.link}
        />
      }
    >
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <ThemedText type="h2">GEM Operations</ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            PC-independent cloud control plane
          </ThemedText>
        </View>
        <View
          style={[
            styles.statusDot,
            { backgroundColor: stateColor, borderColor: theme.backgroundRoot },
          ]}
        />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={theme.link} />
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            Loading controller state…
          </ThemedText>
        </View>
      ) : null}

      {error ? (
        <View
          style={[
            styles.card,
            { backgroundColor: theme.backgroundDefault, borderColor: theme.border },
          ]}
        >
          <View style={styles.inlineRow}>
            <Feather name="alert-triangle" size={18} color={theme.error} />
            <ThemedText type="h4">Controller unavailable</ThemedText>
          </View>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            {error}
          </ThemedText>
        </View>
      ) : null}

      {summary ? (
        <>
          <View
            style={[
              styles.heroCard,
              { backgroundColor: theme.backgroundDefault, borderColor: theme.border },
            ]}
          >
            <View style={styles.inlineRow}>
              <Feather name="activity" size={20} color={stateColor} />
              <ThemedText type="h3" style={{ color: stateColor }}>
                {summary.overallState.replaceAll("_", " ")}
              </ThemedText>
            </View>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              {summary.generatedAt
                ? `Observed ${new Date(summary.generatedAt).toLocaleString()}`
                : "Awaiting the first sentinel report"}
            </ThemedText>
            {summary.message ? (
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {summary.message}
              </ThemedText>
            ) : null}
          </View>

          <View style={styles.metricsGrid}>
            <Metric label="Checks" value={counts.checked} icon="list" />
            <Metric label="Healthy" value={counts.healthy} icon="check-circle" />
            <Metric label="Degraded" value={counts.degraded} icon="alert-circle" />
            <Metric label="Failed" value={counts.failed} icon="x-circle" />
            <Metric label="Skipped" value={counts.skipped} icon="minus-circle" />
            <Metric label="Changes" value={summary.materialChanges} icon="git-commit" />
          </View>

          <View
            style={[
              styles.card,
              { backgroundColor: theme.backgroundDefault, borderColor: theme.border },
            ]}
          >
            <ThemedText type="h4">Execution envelope</ThemedText>
            <InfoRow label="Remote requests last run" value={String(summary.remoteRequests)} />
            <InfoRow label="Resolved findings" value={String(summary.resolved)} />
            <InfoRow
              label="Billing guard"
              value={summary.billingGuard || "never-provision-paid-resources"}
            />
          </View>
        </>
      ) : null}

      {capabilities ? (
        <>
          <View
            style={[
              styles.card,
              { backgroundColor: theme.backgroundDefault, borderColor: theme.border },
            ]}
          >
            <ThemedText type="h4">Cloud capabilities</ThemedText>
            <InfoRow label="Mode" value={capabilities.mode} />
            <InfoRow label="PC required" value={capabilities.pcIndependent ? "No" : "Yes"} />
            <InfoRow
              label="Production mutation"
              value={capabilities.liveMutationEnabled ? "Enabled" : "Locked"}
            />
            <InfoRow
              label="Remote refresh"
              value={capabilities.remoteRefreshEnabled ? "Protected / enabled" : "Disabled"}
            />
            <InfoRow
              label="Configured checks"
              value={String(
                capabilities.configuredChecks.http +
                  capabilities.configuredChecks.repositories +
                  capabilities.configuredChecks.vercelProjects,
              )}
            />
          </View>

          <View
            style={[
              styles.card,
              { backgroundColor: theme.backgroundDefault, borderColor: theme.border },
            ]}
          >
            <ThemedText type="h4">Provider surface</ThemedText>
            <View style={styles.providerGrid}>
              {providerEntries.map(([name, enabled]) => (
                <View
                  key={name}
                  style={[
                    styles.providerPill,
                    {
                      backgroundColor: theme.backgroundSecondary,
                      borderColor: theme.borderSecondary,
                    },
                  ]}
                >
                  <Feather
                    name={enabled ? "check" : "minus"}
                    size={14}
                    color={enabled ? theme.success : theme.textTertiary}
                  />
                  <ThemedText type="small">{name.toUpperCase()}</ThemedText>
                </View>
              ))}
            </View>
          </View>

          <View
            style={[
              styles.card,
              { backgroundColor: theme.backgroundDefault, borderColor: theme.border },
            ]}
          >
            <ThemedText type="h4">Locked authority</ThemedText>
            {capabilities.guardrails.map((guardrail) => (
              <View key={guardrail} style={styles.guardrailRow}>
                <Feather name="lock" size={14} color={theme.warning} />
                <ThemedText type="small" style={{ flex: 1, color: theme.textSecondary }}>
                  {guardrail}
                </ThemedText>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon: React.ComponentProps<typeof Feather>["name"] }) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.metricCard,
        { backgroundColor: theme.backgroundDefault, borderColor: theme.border },
      ]}
    >
      <Feather name={icon} size={17} color={theme.link} />
      <ThemedText type="h3">{value}</ThemedText>
      <ThemedText type="small" style={{ color: theme.textSecondary }}>
        {label}
      </ThemedText>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.infoRow, { borderBottomColor: theme.border }]}>
      <ThemedText type="small" style={{ color: theme.textSecondary, flex: 1 }}>
        {label}
      </ThemedText>
      <ThemedText type="small" style={{ textAlign: "right", flex: 1 }}>
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing["2xl"],
  },
  headerCopy: { gap: Spacing.xs },
  statusDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 3,
  },
  loadingWrap: {
    minHeight: 140,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
  },
  heroCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  card: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  inlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  metricCard: {
    width: "47%",
    minHeight: 112,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    gap: Spacing.xs,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  providerGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  providerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  guardrailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
});
