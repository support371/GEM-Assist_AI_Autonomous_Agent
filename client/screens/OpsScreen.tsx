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

type CostGuardSummary = {
  schemaVersion: number;
  generatedAt: string | null;
  overallState: string;
  repositoriesChecked: number;
  requestsUsed: number;
  totals: {
    vercelContexts: number;
    rateLimitedContexts: number;
    duplicateContexts: number;
  };
  automaticUpgradeAllowed: boolean;
  message?: string;
};

type RemediationSummary = {
  schemaVersion: number;
  generatedAt: string | null;
  sourceOverallState: string;
  sourceCostState?: string;
  executionAuthority: string;
  totalTasks: number;
  operationalTasks?: number;
  costTasks?: number;
  counts: {
    P0: number;
    P1: number;
    P2: number;
    P3: number;
    P4: number;
  };
  message?: string;
};

type ReleaseReadinessSummary = {
  schemaVersion: number;
  generatedAt: string | null;
  state: string;
  blockers: number;
  warnings: number;
  authority: string;
  automaticMergeAllowed: boolean;
  automaticDeploymentAllowed: boolean;
  message?: string;
};

type HistoryEntrySummary = {
  generatedAt?: string;
  operationalState?: string;
  costState?: string;
  releaseState?: string;
  failed?: number;
  degraded?: number;
  rateLimitedContexts?: number;
  duplicateContexts?: number;
  p0?: number;
  p1?: number;
};

type HistorySummary = {
  schemaVersion: number;
  updatedAt: string | null;
  retainedRuns: number;
  publicWindow: number;
  trend: string;
  latest: HistoryEntrySummary | null;
  recent: HistoryEntrySummary[];
  message?: string;
};

type AuditSummary = {
  schemaVersion: number;
  updatedAt: string | null;
  integrity: string;
  eventCount: number;
  appended: boolean;
  headHash: string | null;
  failedIndex: number | null;
  failureReason: string | null;
  latest: {
    sequence?: number;
    sourceGeneratedAt?: string | null;
    operationalState?: string;
    costState?: string;
    releaseState?: string;
    trend?: string;
  } | null;
  message?: string;
};

type OpsCapabilities = {
  mode: string;
  pcIndependent: boolean;
  liveMutationEnabled: boolean;
  remediationAuthority: string;
  releaseDecisionAuthority: string;
  historyRetentionRuns: number;
  automaticPaidUpgradeAllowed: boolean;
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
    maxRemoteRequestsPerRun: number;
    maxCostGuardRequestsPerRun: number;
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

const emptyRemediationCounts = {
  P0: 0,
  P1: 0,
  P2: 0,
  P3: 0,
  P4: 0,
};

export default function OpsScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [summary, setSummary] = useState<OpsSummary | null>(null);
  const [costGuard, setCostGuard] = useState<CostGuardSummary | null>(null);
  const [remediation, setRemediation] = useState<RemediationSummary | null>(null);
  const [readiness, setReadiness] = useState<ReleaseReadinessSummary | null>(null);
  const [history, setHistory] = useState<HistorySummary | null>(null);
  const [audit, setAudit] = useState<AuditSummary | null>(null);
  const [capabilities, setCapabilities] = useState<OpsCapabilities | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (manual = false) => {
    manual ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const base = getApiUrl();
      const [
        summaryResponse,
        costResponse,
        remediationResponse,
        readinessResponse,
        historyResponse,
        auditResponse,
        capabilitiesResponse,
      ] = await Promise.all([
        fetch(new URL("/api/ops/summary", base), { credentials: "include" }),
        fetch(new URL("/api/ops/cost-summary", base), { credentials: "include" }),
        fetch(new URL("/api/ops/remediation-summary", base), { credentials: "include" }),
        fetch(new URL("/api/ops/release-readiness", base), { credentials: "include" }),
        fetch(new URL("/api/ops/history", base), { credentials: "include" }),
        fetch(new URL("/api/ops/audit-summary", base), { credentials: "include" }),
        fetch(new URL("/api/ops/capabilities", base), { credentials: "include" }),
      ]);

      const statuses = [
        summaryResponse.status,
        costResponse.status,
        remediationResponse.status,
        readinessResponse.status,
        historyResponse.status,
        auditResponse.status,
        capabilitiesResponse.status,
      ];
      if (
        !summaryResponse.ok ||
        !costResponse.ok ||
        !remediationResponse.ok ||
        !readinessResponse.ok ||
        !historyResponse.ok ||
        !auditResponse.ok ||
        !capabilitiesResponse.ok
      ) {
        throw new Error(`Operations API unavailable (${statuses.join("/")})`);
      }

      setSummary((await summaryResponse.json()) as OpsSummary);
      setCostGuard((await costResponse.json()) as CostGuardSummary);
      setRemediation((await remediationResponse.json()) as RemediationSummary);
      setReadiness((await readinessResponse.json()) as ReleaseReadinessSummary);
      setHistory((await historyResponse.json()) as HistorySummary);
      setAudit((await auditResponse.json()) as AuditSummary);
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

  const costColor = useMemo(() => {
    switch (costGuard?.overallState) {
      case "HEALTHY":
        return theme.success;
      case "DUPLICATE_BUILD_SURFACE":
      case "COST_PRESSURE":
      case "INSPECTION_LIMITED":
        return theme.warning;
      case "CAPACITY_BLOCKED":
      case "BUILD_FAILURE":
        return theme.error;
      default:
        return theme.textSecondary;
    }
  }, [costGuard?.overallState, theme]);

  const readinessColor = useMemo(() => {
    switch (readiness?.state) {
      case "READY_FOR_REVIEW":
        return theme.success;
      case "REVIEW_REQUIRED":
        return theme.warning;
      case "HOLD":
        return theme.error;
      default:
        return theme.textSecondary;
    }
  }, [readiness?.state, theme]);

  const trendColor = useMemo(() => {
    switch (history?.trend) {
      case "STABLE":
      case "RECOVERING":
        return theme.success;
      case "MIXED":
      case "INSUFFICIENT_HISTORY":
        return theme.warning;
      case "DETERIORATING":
      case "PERSISTENT_RISK":
        return theme.error;
      default:
        return theme.textSecondary;
    }
  }, [history?.trend, theme]);

  const auditColor = useMemo(() => {
    if (audit?.integrity === "VALID") return theme.success;
    if (audit?.integrity === "FAILED") return theme.error;
    return theme.textSecondary;
  }, [audit?.integrity, theme]);

  const counts = summary?.counts || emptyCounts;
  const remediationCounts = remediation?.counts || emptyRemediationCounts;
  const providerEntries = capabilities ? Object.entries(capabilities.providers) : [];

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
                {summary.overallState.replace(/_/g, " ")}
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

      {readiness ? (
        <View
          style={[
            styles.card,
            { backgroundColor: theme.backgroundDefault, borderColor: theme.border },
          ]}
        >
          <View style={styles.inlineRow}>
            <Feather name="shield" size={18} color={readinessColor} />
            <ThemedText type="h4" style={{ color: readinessColor }}>
              Release readiness — {readiness.state.replace(/_/g, " ")}
            </ThemedText>
          </View>
          <InfoRow label="Blockers" value={String(readiness.blockers)} />
          <InfoRow label="Warnings" value={String(readiness.warnings)} />
          <InfoRow label="Decision authority" value={readiness.authority} />
          <InfoRow
            label="Automatic merge"
            value={readiness.automaticMergeAllowed ? "Allowed" : "Forbidden"}
          />
          <InfoRow
            label="Automatic deploy"
            value={readiness.automaticDeploymentAllowed ? "Allowed" : "Forbidden"}
          />
        </View>
      ) : null}

      {history ? (
        <View
          style={[
            styles.card,
            { backgroundColor: theme.backgroundDefault, borderColor: theme.border },
          ]}
        >
          <View style={styles.inlineRow}>
            <Feather name="trending-up" size={18} color={trendColor} />
            <ThemedText type="h4" style={{ color: trendColor }}>
              Operational trend — {history.trend.replace(/_/g, " ")}
            </ThemedText>
          </View>
          <InfoRow label="Runs retained" value={String(history.retainedRuns)} />
          <InfoRow label="Dashboard window" value={String(history.publicWindow)} />
          <InfoRow
            label="Latest operational state"
            value={history.latest?.operationalState || "Not available"}
          />
          <InfoRow label="Latest cost state" value={history.latest?.costState || "Not available"} />
          <InfoRow
            label="Latest release state"
            value={history.latest?.releaseState || "Not available"}
          />
        </View>
      ) : null}

      {audit ? (
        <View
          style={[
            styles.card,
            { backgroundColor: theme.backgroundDefault, borderColor: theme.border },
          ]}
        >
          <View style={styles.inlineRow}>
            <Feather name="link" size={18} color={auditColor} />
            <ThemedText type="h4" style={{ color: auditColor }}>
              Audit integrity — {audit.integrity.replace(/_/g, " ")}
            </ThemedText>
          </View>
          <InfoRow label="Hash-linked events" value={String(audit.eventCount)} />
          <InfoRow label="Ledger head" value={audit.headHash || "Not initialized"} />
          <InfoRow
            label="Latest sequence"
            value={audit.latest?.sequence ? String(audit.latest.sequence) : "Not initialized"}
          />
          {audit.integrity === "FAILED" ? (
            <>
              <InfoRow label="Failed event index" value={String(audit.failedIndex ?? "unknown")} />
              <InfoRow label="Failure reason" value={audit.failureReason || "unknown"} />
            </>
          ) : null}
          {audit.message ? (
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              {audit.message}
            </ThemedText>
          ) : null}
        </View>
      ) : null}

      {costGuard ? (
        <View
          style={[
            styles.card,
            { backgroundColor: theme.backgroundDefault, borderColor: theme.border },
          ]}
        >
          <View style={styles.inlineRow}>
            <Feather name="dollar-sign" size={18} color={costColor} />
            <ThemedText type="h4" style={{ color: costColor }}>
              Build-cost guard — {costGuard.overallState.replace(/_/g, " ")}
            </ThemedText>
          </View>
          <InfoRow label="Repositories checked" value={String(costGuard.repositoriesChecked)} />
          <InfoRow label="Guard requests" value={String(costGuard.requestsUsed)} />
          <InfoRow label="Vercel contexts" value={String(costGuard.totals.vercelContexts)} />
          <InfoRow label="Duplicate contexts" value={String(costGuard.totals.duplicateContexts)} />
          <InfoRow label="Rate-limited contexts" value={String(costGuard.totals.rateLimitedContexts)} />
          <InfoRow
            label="Automatic paid upgrade"
            value={costGuard.automaticUpgradeAllowed ? "Allowed" : "Forbidden"}
          />
        </View>
      ) : null}

      {remediation ? (
        <View
          style={[
            styles.card,
            { backgroundColor: theme.backgroundDefault, borderColor: theme.border },
          ]}
        >
          <View style={styles.inlineRow}>
            <Feather name="clipboard" size={18} color={theme.link} />
            <ThemedText type="h4">Remediation queue</ThemedText>
          </View>
          <InfoRow label="Open tasks" value={String(remediation.totalTasks)} />
          <InfoRow label="Operational tasks" value={String(remediation.operationalTasks || 0)} />
          <InfoRow label="Cost-governance tasks" value={String(remediation.costTasks || 0)} />
          <InfoRow label="P0 — immediate" value={String(remediationCounts.P0)} />
          <InfoRow label="P1 — high" value={String(remediationCounts.P1)} />
          <InfoRow label="P2 — normal" value={String(remediationCounts.P2)} />
          <InfoRow label="P3 — access/review" value={String(remediationCounts.P3)} />
          <InfoRow label="Authority" value={remediation.executionAuthority} />
        </View>
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
            <InfoRow label="Remediation authority" value={capabilities.remediationAuthority} />
            <InfoRow label="Release authority" value={capabilities.releaseDecisionAuthority} />
            <InfoRow
              label="Paid upgrade authority"
              value={capabilities.automaticPaidUpgradeAllowed ? "Enabled" : "Locked"}
            />
            <InfoRow
              label="Remote refresh"
              value={capabilities.remoteRefreshEnabled ? "Protected / enabled" : "Disabled"}
            />
            <InfoRow label="History retention" value={`${capabilities.historyRetentionRuns} runs`} />
            <InfoRow
              label="Configured checks"
              value={String(
                capabilities.configuredChecks.http +
                  capabilities.configuredChecks.repositories +
                  capabilities.configuredChecks.vercelProjects,
              )}
            />
            <InfoRow
              label="Sentinel request ceiling"
              value={String(capabilities.configuredChecks.maxRemoteRequestsPerRun)}
            />
            <InfoRow
              label="Cost-guard request ceiling"
              value={String(capabilities.configuredChecks.maxCostGuardRequestsPerRun)}
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

function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ComponentProps<typeof Feather>["name"];
}) {
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
