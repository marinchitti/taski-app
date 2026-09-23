import { useRouter } from "expo-router";
import React from "react";
import {
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView as RNSafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "../../components/icons";
import { useAuth } from "../../context/auth";
import { useGroup } from "../../context/group";
import { loadTasks, subscribeToTasks, Task } from "../../lib/tasks";

export default function HomeScreen() {
  const { user } = useAuth();
  const { activeGroup } = useGroup();
  const activeTeamId = activeGroup?.id ?? null;
  const router = useRouter();
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const teamName = activeGroup?.name ?? "...";

  const displayName = user?.user_metadata?.displayName as string | undefined;
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;
  const userInitial = (displayName?.trim() || user?.email || "U")
    .charAt(0)
    .toUpperCase();

  React.useEffect(() => {
    if (!user) return;

    // Tasks follow the chosen team everywhere in the app.
    const refreshTasks = async () => {
      Text.defaultProps = Text.defaultProps || {};
      Text.defaultProps.allowFontScaling = false;
      const { data, error } = await loadTasks(user.id, activeTeamId);
      if (!error) setTasks(data);
    };

    void refreshTasks();

    return subscribeToTasks(
      user.id,
      activeTeamId ?? undefined,
      () => void refreshTasks(),
    );
  }, [user, activeTeamId]);

  const completedCount = tasks.filter((task) => task.status === "Done").length;
  const overdueCount = tasks.filter((task) => {
    if (!task.dueDate || task.status === "Done") return false;
    return new Date(`${task.dueDate}T23:59:59`) < new Date();
  }).length;
  const progress = tasks.length
    ? Math.round((completedCount / tasks.length) * 100)
    : 0;
  const upcomingTasks = tasks
    .filter((task) => task.status !== "Done" && task.dueDate)
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate))
    .slice(0, 3);

  return (
    <RNSafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Top Dark Header */}
        <View style={styles.header}>
          <View style={styles.headerTopRow}>
            <TouchableOpacity
              style={styles.userInfo}
              onPress={() => router.push("/profile")}
            >
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{userInitial}</Text>
                </View>
              )}
              <View>
                {/* Render the active group name above user name */}
                <Text style={styles.roleText}>{teamName.toUpperCase()}</Text>
                <Text style={styles.userNameText}>
                  {displayName || "Username"}
                </Text>
              </View>
            </TouchableOpacity>

            <View style={styles.headerIcons}>
              <TouchableOpacity
                style={styles.iconButton}
                onPress={() => router.push("/notifications")}
                accessibilityLabel="Open notifications"
              >
                <Ionicons
                  name="notifications-outline"
                  size={18}
                  color="#FFFFFF"
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.iconButton}
                onPress={() => router.push("/settings")}
                accessibilityLabel="Open settings"
              >
                <Ionicons name="settings-outline" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.placeholder} />
        </View>

        {/* Floating Stat Counters */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: "#6366F1" }]}>
              {tasks.length}
            </Text>
            <Text style={styles.statLabel}>TOTAL TASKS</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: "#0F172A" }]}>
              {completedCount}
            </Text>
            <Text style={styles.statLabel}>DONE</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: "#0F172A" }]}>
              {overdueCount}
            </Text>
            <Text style={styles.statLabel}>OVERDUE</Text>
          </View>
        </View>

        {/* Team Progress Widget */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.cardTitle}>Team Progress</Text>
              <Text style={styles.cardSubtitle}>
                COLLECTIVE WORKSPACE VELOCITY
              </Text>
            </View>
            <View style={styles.teamBadge}>
              <Ionicons name="people" size={18} color="#6366F1" />
            </View>
          </View>
          <View style={styles.progressRow}>
            <Text style={styles.progressPercentage}>{progress}%</Text>
            <Text style={styles.progressLabel}>SUCCESS RATE</Text>
          </View>
        </View>

        {/* Upcoming Tasks Section */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Upcoming Tasks</Text>
            <TouchableOpacity
              style={styles.viewAllBtn}
              onPress={() => router.push("/tasks")}
            >
              <Text style={styles.viewAllText}>VIEW ALL</Text>
              <Ionicons name="chevron-forward" size={14} color="#6366F1" />
            </TouchableOpacity>
          </View>
          {upcomingTasks.length > 0 ? (
            <View style={styles.upcomingList}>
              {upcomingTasks.map((task) => (
                <TouchableOpacity
                  key={task.id}
                  style={styles.upcomingTask}
                  onPress={() => router.push("/tasks")}
                >
                  <View style={styles.upcomingTaskDot} />
                  <View style={styles.upcomingTaskInfo}>
                    <Text style={styles.upcomingTaskTitle} numberOfLines={1}>
                      {task.title}
                    </Text>
                    <Text style={styles.upcomingTaskDate}>{task.dueDate}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconBg}>
                <Ionicons name="calendar-outline" size={28} color="#CBD5E1" />
              </View>
              <Text style={styles.emptyText}>NO UPCOMING TASKS</Text>
            </View>
          )}
        </View>

        {/* Recent Activity Section */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Recent Activity</Text>
          </View>
          {completedCount > 0 ? (
            <View style={styles.activityList}>
              {tasks
                .filter((task) => task.status === "Done")
                .slice(-3)
                .reverse()
                .map((task) => (
                  <View key={task.id} style={styles.activityRow}>
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color="#16A34A"
                    />
                    <Text style={styles.activityText} numberOfLines={1}>
                      {task.title} completed
                    </Text>
                  </View>
                ))}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconBg}>
                <Ionicons name="pulse-outline" size={28} color="#CBD5E1" />
              </View>
              <Text style={styles.emptyText}>NO ACTIVITY</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </RNSafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  scrollContent: {
    paddingBottom: 24,
  },
  header: {
    backgroundColor: "#0F172A",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 50,
  },
  headerTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#334155",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    color: "#FF007A",
    fontSize: 22,
    fontWeight: "800",
  },
  roleText: {
    color: "#94A3B8",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  userNameText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
  headerIcons: {
    flexDirection: "row",
    gap: 10,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#1E293B",
    justifyContent: "center",
    alignItems: "center",
  },
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    marginTop: -30,
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    paddingVertical: 18,
    alignItems: "center",
    boxShadow: [
      {
        offsetX: 0,
        offsetY: 2,
        blurRadius: 8,
        color: "rgba(0,0,0,0.04)",
      },
    ],
    elevation: 2,
  },
  statNumber: {
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: "#94A3B8",
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    marginHorizontal: 16,
    padding: 20,
    marginBottom: 16,
    boxShadow: [
      {
        offsetX: 0,
        offsetY: 2,
        blurRadius: 8,
        color: "rgba(0,0,0,0.03)",
      },
    ],
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  cardSubtitle: {
    fontSize: 9,
    fontWeight: "700",
    color: "#94A3B8",
    marginTop: 2,
    letterSpacing: 0.5,
  },
  teamBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#EEF2FF",
    justifyContent: "center",
    alignItems: "center",
  },
  progressRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginTop: 16,
  },
  progressPercentage: {
    fontSize: 28,
    fontWeight: "800",
    color: "#0F172A",
  },
  progressLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: "#94A3B8",
    letterSpacing: 0.5,
  },
  viewAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  viewAllText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6366F1",
  },
  upcomingList: {
    gap: 12,
    marginTop: 4,
  },
  upcomingTask: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
  },
  upcomingTaskDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#6366F1",
  },
  upcomingTaskInfo: {
    flex: 1,
  },
  upcomingTaskTitle: {
    color: "#1E293B",
    fontSize: 13,
    fontWeight: "700",
  },
  upcomingTaskDate: {
    color: "#94A3B8",
    fontSize: 10,
    marginTop: 3,
  },
  activityList: {
    gap: 12,
    marginTop: 4,
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  activityText: {
    flex: 1,
    color: "#64748B",
    fontSize: 12,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 24,
  },
  emptyIconBg: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: "#F8FAFC",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#CBD5E1",
    letterSpacing: 0.8,
  },
});
