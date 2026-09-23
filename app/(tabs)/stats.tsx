import { BarChart2, TrendingUp } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { Dimensions, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, G, Path, Line as SvgLine } from "react-native-svg";
import { ProgressBar } from "../../components/ProgressBar";
import { StatsCard } from "../../components/StatsCard";
import { useAuth } from "../../context/auth";
import { loadTasks, subscribeToTasks, Task } from "../../lib/tasks";

const { width } = Dimensions.get("window");

export interface TeamMember {
  id: string;
  name: string;
  email?: string;
  role?: string;
}

// Inline SVG Donut Chart
const SimpleDonutChart = ({
  data,
  radius = 75,
  strokeWidth = 22,
}: {
  data: any[];
  radius?: number;
  strokeWidth?: number;
}) => {
  const total = data.reduce((acc, curr) => acc + curr.value, 0);

  if (total === 0) {
    return (
      <View style={styles.chartCenterContainer}>
        <Svg height={radius * 2} width={radius * 2}>
          <Circle
            cx={radius}
            cy={radius}
            r={radius - strokeWidth / 2}
            stroke="#E2E8F0"
            strokeWidth={strokeWidth}
            fill="transparent"
          />
        </Svg>
      </View>
    );
  }

  return (
    <View style={styles.chartCenterContainer}>
      <Svg
        height={radius * 2}
        width={radius * 2}
        viewBox={`0 0 ${radius * 2} ${radius * 2}`}
      >
        <G transform={`rotate(-90 ${radius} ${radius})`}>
          {data.map((item, index) => {
            if (item.value === 0) return null;
            const percentage = item.value / total;
            const strokeDasharray = 2 * Math.PI * (radius - strokeWidth / 2);
            const strokeDashoffset = strokeDasharray * (1 - percentage);

            return (
              <Circle
                key={index}
                cx={radius}
                cy={radius}
                r={radius - strokeWidth / 2}
                stroke={item.color}
                strokeWidth={strokeWidth}
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
                fill="transparent"
                strokeLinecap="round"
              />
            );
          })}
        </G>
      </Svg>
    </View>
  );
};

// Inline SVG Line Chart
const SimpleLineChart = ({
  data,
  height = 180,
  width: chartWidth = width - 88,
}: {
  data: any[];
  height?: number;
  width?: number;
}) => {
  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const paddingLeft = 20;
  const paddingBottom = 30;
  const paddingTop = 10;
  const innerWidth = chartWidth - paddingLeft;
  const innerHeight = height - paddingBottom - paddingTop;

  const points = data.map((d, index) => {
    const x = paddingLeft + (index / Math.max(data.length - 1, 1)) * innerWidth;
    const y = paddingTop + innerHeight - (d.value / maxValue) * innerHeight;
    return { x, y, ...d };
  });

  const pathD = points.reduce(
    (acc, point, index) =>
      index === 0
        ? `M ${point.x} ${point.y}`
        : `${acc} L ${point.x} ${point.y}`,
    "",
  );

  return (
    <View>
      <Svg width={chartWidth} height={height}>
        {[0, 0.5, 1].map((ratio, idx) => (
          <SvgLine
            key={idx}
            x1={paddingLeft}
            y1={paddingTop + innerHeight * ratio}
            x2={chartWidth}
            y2={paddingTop + innerHeight * ratio}
            stroke="#F1F5F9"
            strokeDasharray="4 4"
            strokeWidth="1"
          />
        ))}
        <Path d={pathD} fill="none" stroke="#4C51BF" strokeWidth="3" />
        {points.map((pt, idx) => (
          <G key={idx}>
            <Circle
              cx={pt.x}
              cy={pt.y}
              r="5"
              fill="#FFFFFF"
              stroke="#4C51BF"
              strokeWidth="2.5"
            />
          </G>
        ))}
      </Svg>
      <View style={styles.xAxisContainer}>
        {data.map((item, idx) => (
          <Text key={idx} style={styles.axisLabel}>
            {item.date}
          </Text>
        ))}
      </View>
    </View>
  );
};

export default function StatsScreen() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);

  React.useEffect(() => {
    if (!user) {
      return;
    }

    const refreshTasks = async () => {
      const { data, error } = await loadTasks(user.id);
      if (!error) setTasks(data);
    };

    void refreshTasks();
    return subscribeToTasks(user.id, undefined, () => void refreshTasks());
  }, [user]);

  const teamMembers = useMemo<TeamMember[]>(
    () =>
      Array.from(
        new Set(tasks.map((task) => task.assignee).filter(Boolean)),
      ).map((name) => ({ id: name, name, role: "Member" })),
    [tasks],
  );

  const completedTasks = tasks.filter((t) => t.status === "Done");
  const completedCount = completedTasks.length;
  const overdueCount = tasks.filter(
    (t) =>
      t.dueDate &&
      new Date(`${t.dueDate}T23:59:59`) < new Date() &&
      t.status !== "Done",
  ).length;
  const avgCompletionText = completedCount > 0 ? "-1.2d" : "0d";

  const taskDistributionData = [
    {
      name: "To Do",
      value: tasks.filter((t) => t.status === "To Do").length,
      color: "#A5ADBA",
    },
    {
      name: "In Progress",
      value: tasks.filter((t) => t.status === "In Progress").length,
      color: "#4C51BF",
    },
    { name: "Completed", value: completedCount, color: "#319795" },
  ];

  const priorityData = [
    {
      name: "Low",
      value: tasks.filter((t) => t.priority === "Low").length,
      color: "#48BB78",
    },
    {
      name: "Medium",
      value: tasks.filter((t) => t.priority === "Medium").length,
      color: "#ECC94B",
    },
    {
      name: "High",
      value: tasks.filter((t) => t.priority === "High").length,
      color: "#ED8936",
    },
  ];

  const trendData = useMemo(
    () => [
      { date: "Apr 5", value: 0 },
      { date: "Apr 12", value: 0 },
      { date: "Apr 19", value: 0 },
      { date: "Apr 26", value: Math.max(0, completedCount - 1) * 0.4 },
      { date: "May 3", value: completedCount },
    ],
    [completedCount],
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.watermarkIcon}>
            <BarChart2 size={180} color="rgba(255, 255, 255, 0.08)" />
          </View>
          <View style={styles.headerContent}>
            <View style={styles.headerIconWrapper}>
              <TrendingUp size={22} color="#FFFFFF" />
            </View>
            <View>
              <Text style={styles.headerTitle}>Statistics</Text>
              <Text style={styles.headerSubtitle}>Insights</Text>
            </View>
          </View>
          <View style={{ height: 0 }} />
        </View>

        <View style={styles.metricsContainer}>
          <View style={styles.metricsGrid}>
            <StatsCard label="Completed" value={completedCount} />
            <StatsCard label="Avg. Completion" value={avgCompletionText} />
            <StatsCard label="Overdue" value={overdueCount} />
          </View>
        </View>

        <View style={styles.cardsSection}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Task Distribution</Text>
            <SimpleDonutChart data={taskDistributionData} />
            <View style={styles.legendContainer}>
              {taskDistributionData.map((item, i) => (
                <View key={i} style={styles.legendItem}>
                  <View
                    style={[styles.legendDot, { backgroundColor: item.color }]}
                  />
                  <Text style={styles.legendText}>
                    {item.name}{" "}
                    <Text style={styles.legendCount}>{item.value}</Text>
                  </Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Completion Trend</Text>
            <SimpleLineChart data={trendData} />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Member Proficiency</Text>
            <View style={styles.membersList}>
              {teamMembers.slice(0, 5).map((member) => (
                <View key={member.id} style={styles.memberRow}>
                  <View style={styles.memberHeader}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>
                        {member.name?.charAt(0) || "M"}
                      </Text>
                    </View>
                    <View style={styles.memberInfo}>
                      <Text style={styles.memberName}>{member.name}</Text>
                      <Text style={styles.memberRole}>
                        {member.role || "Member"}
                      </Text>
                    </View>
                  </View>
                  <ProgressBar tasks={tasks} memberId={member.id} />
                </View>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Priority Breakdown</Text>
            <SimpleDonutChart data={priorityData} />
            <View style={styles.legendContainer}>
              {priorityData.map((item, i) => (
                <View key={i} style={styles.legendItem}>
                  <View
                    style={[styles.legendDot, { backgroundColor: item.color }]}
                  />
                  <Text style={styles.legendText}>
                    {item.name}{" "}
                    <Text style={styles.legendCount}>{item.value}</Text>
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F9FC" },
  scrollContent: { paddingBottom: 40 },
  header: {
    backgroundColor: "#0F172A",
    paddingTop: 56,
    paddingBottom: 44,
    paddingHorizontal: 24,
    position: "relative",
    overflow: "hidden",
  },
  watermarkIcon: { position: "absolute", right: -20, top: -20 },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    zIndex: 10,
  },
  headerIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#FFFFFF",
    textTransform: "uppercase",
  },
  headerSubtitle: {
    fontSize: 10,
    fontWeight: "900",
    color: "rgba(255, 255, 255, 0.7)",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginTop: 2,
  },
  metricsContainer: {
    paddingHorizontal: 20,
    marginTop: -24,
    zIndex: 20,
    marginBottom: 24,
  },
  metricsGrid: { flexDirection: "row", gap: 10 },
  cardsSection: { paddingHorizontal: 20, gap: 20 },
  card: {
    backgroundColor: "#FFFFFF",
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 20,
  },
  chartCenterContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 8,
  },
  legendContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 16,
    marginTop: 20,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, fontWeight: "500", color: "#64748B" },
  legendCount: { fontWeight: "700", color: "#0F172A" },
  xAxisContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingLeft: 20,
    marginTop: 8,
  },
  axisLabel: { fontSize: 10, color: "#94A3B8", fontWeight: "500" },
  membersList: { gap: 18 },
  memberRow: { gap: 8 },
  memberHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#4C51BF",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  memberInfo: { flex: 1 },
  memberName: {
    fontSize: 12,
    fontWeight: "900",
    color: "#1E293B",
    textTransform: "uppercase",
  },
  memberRole: {
    fontSize: 9,
    fontWeight: "700",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
});
