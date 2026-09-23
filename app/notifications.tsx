import { Ionicons } from "../components/icons";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
    Pressable,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../context/auth";
import {
  DUE_SOON_DAYS,
  isTaskDone,
  isTaskDueSoon,
  isTaskOverdue,
} from "../lib/stats";
import { loadTasks, subscribeToTasks, Task } from "../lib/tasks";

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  background: string;
};

function getNotifications(tasks: Task[]): NotificationItem[] {
  const notifications: NotificationItem[] = [];
  const now = new Date();

  tasks.forEach((task) => {
    if (isTaskDone(task) || !task.dueDate) return;

    // Overdue / due soon thresholds come from the shared stats layer, so a task
    // flagged "Due soon" on the board raises the same notification here.
    if (isTaskOverdue(task, now)) {
      notifications.push({
        id: `${task.id}-overdue`,
        title: "Task overdue",
        message: `${task.title} needs your attention.`,
        icon: "alert-circle-outline",
        color: "#E11D48",
        background: "#FFF1F2",
      });
    } else if (isTaskDueSoon(task, DUE_SOON_DAYS, now)) {
      notifications.push({
        id: `${task.id}-due-soon`,
        title: "Task due soon",
        message: `${task.title} is due on ${task.dueDate}.`,
        icon: "time-outline",
        color: "#D97706",
        background: "#FFFBEB",
      });
    }
  });

  return notifications;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [readIds, setReadIds] = useState<string[]>([]);

  React.useEffect(() => {
    if (!user) return;

    const refreshTasks = async () => {
      const { data, error } = await loadTasks(user.id);
      if (!error) setTasks(data);
    };

    void refreshTasks();
    return subscribeToTasks(user.id, undefined, () => void refreshTasks());
  }, [user]);

  const notifications = useMemo(() => getNotifications(tasks), [tasks]);
  const unreadCount = notifications.filter(
    (notification) => !readIds.includes(notification.id),
  ).length;

  const markAsRead = (notificationId: string) => {
    setReadIds((current) =>
      current.includes(notificationId) ? current : [...current, notificationId],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <StatusBar barStyle="light-content" backgroundColor="#111A31" />
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={21} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>NOTIFICATIONS</Text>
          <Text style={styles.headerSubtitle}>
            {unreadCount} UNREAD NOTIFICATION{unreadCount === 1 ? "" : "S"}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionLabel}>RECENT ACTIVITY</Text>

        {notifications.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconBox}>
              <Ionicons
                name="notifications-outline"
                size={32}
                color="#DCE5F0"
              />
            </View>
            <Text style={styles.emptyTitle}>NO NOTIFICATIONS YET</Text>
            <Text style={styles.emptySubtitle}>
              CHECK BACK LATER FOR TASK UPDATES
            </Text>
          </View>
        ) : (
          <View style={styles.notificationList}>
            {notifications.map((notification) => {
              const isRead = readIds.includes(notification.id);
              return (
                <Pressable
                  key={notification.id}
                  style={[styles.notificationCard, isRead && styles.readCard]}
                  onPress={() => {
                    markAsRead(notification.id);
                    router.push("/tasks");
                  }}
                >
                  <View
                    style={[
                      styles.notificationIcon,
                      { backgroundColor: notification.background },
                    ]}
                  >
                    <Ionicons
                      name={notification.icon}
                      size={20}
                      color={notification.color}
                    />
                  </View>
                  <View style={styles.notificationCopy}>
                    <Text style={styles.notificationTitle}>
                      {notification.title}
                    </Text>
                    <Text style={styles.notificationMessage}>
                      {notification.message}
                    </Text>
                  </View>
                  {!isRead ? <View style={styles.unreadDot} /> : null}
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  header: {
    minHeight: 105,
    paddingHorizontal: 20,
    paddingVertical: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#111A31",
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#526079",
    backgroundColor: "#29344D",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: {
    gap: 3,
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 23,
    fontWeight: "900",
  },
  headerSubtitle: {
    color: "#9BA8BE",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
    paddingHorizontal: 19,
    paddingTop: 22,
    paddingBottom: 40,
  },
  sectionLabel: {
    color: "#8292AA",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  emptyState: {
    flex: 1,
    minHeight: 360,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 75,
  },
  emptyIconBox: {
    width: 80,
    height: 80,
    borderRadius: 26,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E8EDF4",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: [{
      offsetX: 0,
      offsetY: 2,
      blurRadius: 5,
      color: "rgba(21,34,61,0.06)",
    }],
    elevation: 2,
    marginBottom: 20,
  },
  emptyTitle: {
    color: "#B4C1D3",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  emptySubtitle: {
    color: "#8FA2BE",
    fontSize: 9,
    fontWeight: "700",
    marginTop: 8,
  },
  notificationList: {
    gap: 10,
    marginTop: 22,
  },
  notificationCard: {
    minHeight: 76,
    padding: 14,
    borderRadius: 15,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E6ECF4",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  readCard: {
    opacity: 0.65,
  },
  notificationIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  notificationCopy: {
    flex: 1,
    gap: 4,
  },
  notificationTitle: {
    color: "#1E2C45",
    fontSize: 13,
    fontWeight: "900",
  },
  notificationMessage: {
    color: "#8292AA",
    fontSize: 11,
    lineHeight: 16,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#6366F1",
  },
});
