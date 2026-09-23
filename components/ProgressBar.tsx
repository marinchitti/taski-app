import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

interface Task {
  id: string;
  status: string;
  assigneeId?: string;
  assignedTo?: string;
  assignee?: string;
}

interface ProgressBarProps {
  memberId?: string | null;
  label?: string;
  subtitle?: string;
  variant?: "default" | "card";
  tasks?: Task[] | null;
  /**
   * Explicit progress (0-100). Takes precedence over the tasks/memberId
   * calculation so callers that already computed a rate (e.g. the shared stats
   * layer) can reuse this component without re-deriving it from tasks.
   */
  value?: number | null;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  memberId = null,
  label,
  subtitle,
  variant = "default",
  tasks = null,
  value = null,
}) => {
  const computedProgress = useMemo(() => {
    if (!tasks || tasks.length === 0) return 0;

    const filteredTasks = memberId
      ? tasks.filter(
          (t) =>
            t.assigneeId === memberId ||
            t.assignedTo === memberId ||
            t.assignee === memberId,
        )
      : tasks;

    const total = filteredTasks.length;
    if (total === 0) return 0;

    const completed = filteredTasks.filter(
      (t) => t.status === "done" || t.status === "Done",
    ).length;
    return Math.round((completed / total) * 100);
  }, [tasks, memberId]);

  const progress =
    typeof value === "number" && Number.isFinite(value)
      ? Math.min(100, Math.max(0, Math.round(value)))
      : computedProgress;

  const displayLabel =
    label || (memberId ? "Member Progress" : "Team Progress");

  if (variant === "card") {
    return (
      <View style={styles.cardContainer}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.cardTitle}>{displayLabel}</Text>
            {subtitle && <Text style={styles.cardSubtitle}>{subtitle}</Text>}
          </View>
        </View>

        <View style={styles.cardStatRow}>
          <Text style={styles.cardStatValue}>{progress}%</Text>
          <Text style={styles.cardStatLabel}>SUCCESS RATE</Text>
        </View>

        <View style={styles.track}>
          <View style={[styles.fill, { width: `${progress}%` }]} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{displayLabel}</Text>
        <Text style={styles.percentage}>{progress}%</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${progress}%` }]} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: 6 },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    fontSize: 10,
    fontWeight: "900",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  percentage: { fontSize: 12, fontWeight: "900", color: "#4C51BF" },
  track: {
    height: 8,
    backgroundColor: "#F1F5F9",
    borderRadius: 4,
    overflow: "hidden",
  },
  fill: { height: "100%", backgroundColor: "#4C51BF", borderRadius: 4 },
  cardContainer: {
    backgroundColor: "#FFFFFF",
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    gap: 12,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  cardTitle: { fontSize: 16, fontWeight: "900", color: "#1E293B" },
  cardSubtitle: {
    fontSize: 9,
    fontWeight: "700",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  cardStatRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  cardStatValue: { fontSize: 28, fontWeight: "900", color: "#0F172A" },
  cardStatLabel: {
    fontSize: 9,
    fontWeight: "900",
    color: "#94A3B8",
    letterSpacing: 1,
    marginBottom: 4,
  },
});

export default ProgressBar;
