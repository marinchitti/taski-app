import { useFocusEffect } from "expo-router";
import { Feather, Ionicons } from "../../components/icons";
import React, { useCallback, useMemo, useState } from "react";
import {
    Modal,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../context/auth";
import {
  loadTasks,
  subscribeToTasks,
  Task,
  TaskStatus,
  updateTask,
} from "../../lib/tasks";
import { normalizeDueDate } from "../../lib/stats";

type CalendarDay = {
  day: number;
  date: string;
  tasks: Task[];
  isCurrentMonth: boolean;
  isToday: boolean;
};

// `normalizeDueDate` lives in the shared stats layer (lib/stats) so the Calendar
// grid, the Statistics tab and the notification feed all match the same day.

export default function CalendarView() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [view, setView] = useState("grid"); // 'grid' | 'day'
  const [selectedDayDate, setSelectedDayDate] = useState<string | null>(null);
  const [newCalendarSubtask, setNewCalendarSubtask] = useState("");

  const refreshTasks = useCallback(async () => {
    if (!user) return;
    const { data, error } = await loadTasks(user.id);
    if (!error) setTasks(data);
  }, [user]);

  React.useEffect(() => {
    if (!user) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch + realtime subscription
    void refreshTasks();
    return subscribeToTasks(user.id, undefined, () => void refreshTasks());
  }, [user, refreshTasks]);

  // Tabs stay mounted, so the calendar view can be stale when you navigate
  // back from Tasks after editing a due date — and the shared realtime
  // channel name means only one tab's subscription may actually be live.
  // Re-fetch on every focus so the grid always shows the latest due dates.
  useFocusEffect(
    useCallback(() => {
      void refreshTasks();
    }, [refreshTasks]),
  );

  const onUpdateTask = async (task: Task) => {
    if (!user) return;
    // Optimistically update local state first so status/subtask toggles feel
    // instant even if realtime doesn't echo back to this tab.
    setTasks((current) =>
      current.map((t) =>
        t.id === task.id
          ? { ...t, status: task.status, subtasks: task.subtasks }
          : t,
      ),
    );
    try {
      await updateTask(task.id, {
        status: task.status,
        subtasks: task.subtasks,
      });
    } catch {
      // Refresh from the server on failure so the UI matches reality.
      await refreshTasks();
    }
  };

  // Generate 42 days (6 full weeks) for grid view
  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const startDate = new Date(year, month, 1 - firstDayOfMonth);

    const days = [];
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    for (let i = 0; i < 42; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);

      const dYear = date.getFullYear();
      const dMonth = String(date.getMonth() + 1).padStart(2, "0");
      const dDay = String(date.getDate()).padStart(2, "0");
      const dateStr = `${dYear}-${dMonth}-${dDay}`;

      const dayTasks = tasks.filter(
        (t) => normalizeDueDate(t.dueDate) === dateStr,
      );

      days.push({
        day: date.getDate(),
        date: dateStr,
        tasks: dayTasks,
        isCurrentMonth: date.getMonth() === month,
        isToday: dateStr === todayStr,
      });
    }
    return days;
  }, [currentDate, tasks]);

  const monthName = currentDate.toLocaleString("default", { month: "long" });
  const year = currentDate.getFullYear();

  const handlePrevMonth = () =>
    setCurrentDate(new Date(year, currentDate.getMonth() - 1, 1));
  const handleNextMonth = () =>
    setCurrentDate(new Date(year, currentDate.getMonth() + 1, 1));
  const handleToday = () => setCurrentDate(new Date());

  const handleDayClick = (dateObj: CalendarDay) => {
    setSelectedDayDate(dateObj.date);
    setView("day");
  };

  // Derive the day-agenda data live from `tasks` instead of a frozen snapshot
  // so due-date edits move the task to its new day immediately.
  const selectedDayData = useMemo<CalendarDay | null>(() => {
    if (!selectedDayDate) return null;
    const dayTasks = tasks.filter(
      (t) => normalizeDueDate(t.dueDate) === selectedDayDate,
    );
    const parts = selectedDayDate.split("-").map(Number);
    const selectedMonth = parts[1] ?? 0;
    const selectedDay = parts[2] ?? 1;
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    return {
      day: selectedDay,
      date: selectedDayDate,
      tasks: dayTasks,
      isCurrentMonth: selectedMonth - 1 === currentDate.getMonth(),
      isToday: selectedDayDate === todayStr,
    };
  }, [selectedDayDate, tasks, currentDate]);

  const formattedLongDate = useMemo(() => {
    if (!selectedDayDate) return "";
    const [y, m, d] = selectedDayDate.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString("default", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }, [selectedDayDate]);

  const selectedTask = tasks.find((t) => t.id === selectedTaskId);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#111A31" />

      {/* App Header — shared by both the grid and day-agenda views */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <View style={styles.headerIcon}>
            <Ionicons name="calendar" size={26} color="#FFFFFF" />
          </View>
          <View>
            <Text style={styles.headerTitle}>CALENDAR</Text>
            <Text style={styles.headerSubtitle}>TACTICAL TIMELINE</Text>
          </View>
        </View>
      </View>

      {view === "grid" ? (
        /* GRID VIEW */
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Control Bar */}
          <View style={styles.controlBar}>
            <View style={styles.navGroup}>
              <TouchableOpacity style={styles.navBtn} onPress={handlePrevMonth}>
                <Ionicons name="chevron-back" size={18} color="#94A3B8" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.navBtn} onPress={handleNextMonth}>
                <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <Text style={styles.monthText}>
              {monthName.toUpperCase()}{" "}
              <Text style={styles.yearText}>{year}</Text>
            </Text>

            <TouchableOpacity style={styles.todayBtn} onPress={handleToday}>
              <Text style={styles.todayBtnText}>TODAY</Text>
            </TouchableOpacity>
          </View>

          {/* Grid Card */}
          <View style={styles.gridCard}>
            {/* Days Header */}
            <View style={styles.daysHeaderRow}>
              {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((d) => (
                <View key={d} style={styles.dayHeaderCell}>
                  <Text style={styles.dayHeaderText}>{d}</Text>
                </View>
              ))}
            </View>

            {/* Grid Cells */}
            <View style={styles.gridContainer}>
              {calendarDays.map((dateObj, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.dayCell,
                    !dateObj.isCurrentMonth && styles.outsideCell,
                    (idx + 1) % 7 === 0 && { borderRightWidth: 0 },
                  ]}
                  onPress={() => handleDayClick(dateObj)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.dayNumber,
                      dateObj.tasks.length > 0 && styles.hasTasksText,
                      dateObj.isToday && styles.todayText,
                      !dateObj.isCurrentMonth && styles.outsideDayText,
                    ]}
                  >
                    {dateObj.day}
                  </Text>

                  {/* Indicators */}
                  {dateObj.isToday ? (
                    <View style={styles.todayDot} />
                  ) : dateObj.tasks.length > 0 ? (
                    <View style={styles.taskDot} />
                  ) : null}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
      ) : (
        /* DAY AGENDA VIEW */
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.dayHeaderRow}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => setView("grid")}
            >
              <Ionicons name="chevron-back" size={20} color="#0F172A" />
            </TouchableOpacity>
            <View>
              <Text style={styles.dayTitle}>DAILY AGENDA</Text>
              <Text style={styles.daySubtitle}>
                {formattedLongDate.toUpperCase()}
              </Text>
            </View>
          </View>

          {selectedDayData && selectedDayData.tasks.length > 0 ? (
            <View style={styles.taskListContainer}>
              {selectedDayData.tasks.map((task) => (
                <TouchableOpacity
                  key={task.id}
                  style={styles.taskCard}
                  onPress={() => setSelectedTaskId(task.id)}
                  activeOpacity={0.8}
                >
                  <View style={styles.taskInfo}>
                    <View style={styles.badgeRow}>
                      <View
                        style={[
                          styles.badge,
                          task.priority === "High"
                            ? styles.highBadge
                            : task.priority === "Medium"
                              ? styles.medBadge
                              : styles.lowBadge,
                        ]}
                      >
                        <Text
                          style={[
                            styles.badgeText,
                            task.priority === "High"
                              ? styles.highText
                              : task.priority === "Medium"
                                ? styles.medText
                                : styles.lowText,
                          ]}
                        >
                          {task.priority?.toUpperCase()}
                        </Text>
                      </View>

                      <View
                        style={[
                          styles.badge,
                          task.status === "Done"
                            ? styles.doneBadge
                            : styles.statusBadge,
                        ]}
                      >
                        <Text
                          style={[
                            styles.badgeText,
                            task.status === "Done"
                              ? styles.doneText
                              : styles.statusText,
                          ]}
                        >
                          {task.status?.toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    <Text
                      style={[
                        styles.taskTitle,
                        task.status === "Done" && styles.lineThrough,
                      ]}
                    >
                      {task.title}
                    </Text>

                    {task.assignee && (
                      <View style={styles.assigneeRow}>
                        <View style={styles.assigneeAvatar}>
                          <Text style={styles.assigneeAvatarText}>
                            {task.assignee.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <Text style={styles.assigneeName}>{task.assignee}</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.arrowIconBg}>
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color="#CBD5E1"
                    />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={styles.emptyStateContainer}>
              <View style={styles.emptyIconBox}>
                <Feather name="clipboard" size={32} color="#CBD5E1" />
              </View>
              <Text style={styles.emptyTitle}>STATUS: IDLE</Text>
              <Text style={styles.emptySubtitle}>
                No missions scheduled for this tactical window.
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* TASK INTEL MODAL */}
      <Modal
        visible={!!selectedTaskId}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedTaskId(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSelectedTaskId(null)}
        >
          <TouchableOpacity style={styles.modalContent} activeOpacity={1}>
            {selectedTask && (
              <>
                <View style={styles.modalHeader}>
                  <View style={styles.intelTag}>
                    <Text style={styles.intelTagText}>TASK INTEL</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setSelectedTaskId(null)}
                    style={styles.closeBtn}
                  >
                    <Ionicons name="close" size={20} color="#CBD5E1" />
                  </TouchableOpacity>
                </View>

                <Text style={styles.modalTitle}>{selectedTask.title}</Text>

                <View style={styles.intelMetaRow}>
                  <View style={styles.metaBadge}>
                    <Ionicons name="time-outline" size={12} color="#64748B" />
                    <Text style={styles.metaText}>{selectedTask.dueDate}</Text>
                  </View>
                  <View style={styles.metaBadge}>
                    <View
                      style={[
                        styles.statusDot,
                        {
                          backgroundColor:
                            selectedTask.status === "Done"
                              ? "#34D399"
                              : "#FBBF24",
                        },
                      ]}
                    />
                    <Text style={styles.metaText}>
                      {selectedTask.status?.toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.descriptionBox}>
                  <Text style={styles.descriptionText}>
                    {selectedTask.description ||
                      "No mission brief provided for this operation."}
                  </Text>
                </View>

                {/* Subtasks Section */}
                {(() => {
                  const subtasks = selectedTask.subtasks || [];
                  const total = subtasks.length;
                  const done = subtasks.filter((s) => s.completed).length;
                  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

                  const handleToggleSub = (subId: string) => {
                    const updated = subtasks.map((s) =>
                      s.id === subId ? { ...s, completed: !s.completed } : s,
                    );
                    onUpdateTask({ ...selectedTask, subtasks: updated });
                  };

                  const handleAddSub = () => {
                    if (!newCalendarSubtask.trim()) return;
                    const newItem = {
                      id: `sub-${Date.now()}-${Math.random()
                        .toString(36)
                        .substr(2, 6)}`,
                      title: newCalendarSubtask.trim(),
                      completed: false,
                      createdAt: new Date().toISOString(),
                    };
                    onUpdateTask({
                      ...selectedTask,
                      subtasks: [...subtasks, newItem],
                    });
                    setNewCalendarSubtask("");
                  };

                  return (
                    <View style={styles.subtaskContainer}>
                      <View style={styles.subtaskHeader}>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <Feather name="list" size={14} color="#6366F1" />
                          <Text style={styles.subtaskTitleText}>SUBTASKS</Text>
                          {total > 0 && (
                            <View style={styles.subtaskCountBadge}>
                              <Text style={styles.subtaskCountText}>
                                {done}/{total}
                              </Text>
                            </View>
                          )}
                        </View>
                        {total > 0 && (
                          <Text style={styles.subtaskPctText}>{pct}%</Text>
                        )}
                      </View>

                      {total > 0 && (
                        <View style={styles.subtaskTrack}>
                          <View
                            style={[
                              styles.subtaskFill,
                              {
                                width: `${pct}%`,
                                backgroundColor:
                                  done === total ? "#10B981" : "#6366F1",
                              },
                            ]}
                          />
                        </View>
                      )}

                      {total > 0 && (
                        <ScrollView style={{ maxHeight: 120 }}>
                          {subtasks.map((st) => (
                            <TouchableOpacity
                              key={st.id}
                              style={[
                                styles.subtaskRow,
                                st.completed && styles.subtaskRowCompleted,
                              ]}
                              onPress={() => handleToggleSub(st.id)}
                            >
                              <View
                                style={[
                                  styles.checkbox,
                                  st.completed && styles.checkboxChecked,
                                ]}
                              >
                                {st.completed && (
                                  <Ionicons
                                    name="checkmark"
                                    size={12}
                                    color="#FFFFFF"
                                  />
                                )}
                              </View>
                              <Text
                                style={[
                                  styles.subtaskText,
                                  st.completed && styles.lineThrough,
                                ]}
                              >
                                {st.title}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      )}

                      <View style={styles.addSubtaskRow}>
                        <TextInput
                          style={styles.subtaskInput}
                          placeholder="Add subtask..."
                          placeholderTextColor="#94A3B8"
                          value={newCalendarSubtask}
                          onChangeText={setNewCalendarSubtask}
                          onSubmitEditing={handleAddSub}
                        />
                        <TouchableOpacity
                          style={[
                            styles.addSubtaskBtn,
                            !newCalendarSubtask.trim() && { opacity: 0.4 },
                          ]}
                          onPress={handleAddSub}
                          disabled={!newCalendarSubtask.trim()}
                        >
                          <Ionicons name="add" size={18} color="#6366F1" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })()}

                {/* Cycle Status Button */}
                <TouchableOpacity
                  style={styles.cycleBtn}
                  onPress={() => {
                    const nextStatusMap: Record<TaskStatus, TaskStatus> = {
                      "To Do": "In Progress",
                      "In Progress": "Review",
                      Review: "Done",
                      Done: "To Do",
                    };
                    onUpdateTask({
                      ...selectedTask,
                      status:
                        nextStatusMap[selectedTask.status] || "In Progress",
                    });
                    setSelectedTaskId(null);
                  }}
                >
                  <Feather name="clipboard" size={14} color="#FFFFFF" />
                  <Text style={styles.cycleBtnText}>CYCLE STATUS</Text>
                </TouchableOpacity>
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4F7F9",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  // Dark app header, sized to match the Tasks/Team headers (24/24/28 padding
  // with a 48px icon tile) so every tab renders the same 100px header.
  header: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 28,
    backgroundColor: "#111A31",
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#29344D",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900",
  },
  headerSubtitle: {
    color: "#AAB4C7",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 2,
    letterSpacing: 0.5,
  },
  controlBar: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 0,
    marginBottom: 20,
    boxShadow: [{
      offsetX: 0,
      offsetY: 2,
      blurRadius: 8,
      color: "rgba(0,0,0,0.03)",
    }],
    elevation: 2,
  },
  navGroup: {
    flexDirection: "row",
    gap: 6,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    justifyContent: "center",
    alignItems: "center",
  },
  monthText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: 0.8,
  },
  yearText: {
    color: "#6366F1",
  },
  todayBtn: {
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
  },
  todayBtnText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 0.5,
  },
  gridCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
    boxShadow: [{
      offsetX: 0,
      offsetY: 4,
      blurRadius: 10,
      color: "rgba(0,0,0,0.03)",
    }],
    elevation: 2,
  },
  daysHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#F8FAFC",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  dayHeaderCell: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
  },
  dayHeaderText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#94A3B8",
    letterSpacing: 0.5,
  },
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dayCell: {
    width: "14.28%",
    height: 54,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#F1F5F9",
    alignItems: "center",
    paddingTop: 8,
    position: "relative",
  },
  outsideCell: {
    backgroundColor: "#FAFAFA",
  },
  dayNumber: {
    fontSize: 11,
    fontWeight: "600",
    color: "#94A3B8",
  },
  hasTasksText: {
    fontWeight: "900",
    color: "#0F172A",
  },
  todayText: {
    fontWeight: "900",
    color: "#6366F1",
  },
  outsideDayText: {
    opacity: 0.25,
  },
  todayDot: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#6366F1",
  },
  taskDot: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#CBD5E1",
  },
  dayHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
  },
  dayTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0F172A",
  },
  daySubtitle: {
    fontSize: 9,
    fontWeight: "800",
    color: "#6366F1",
    letterSpacing: 0.5,
    marginTop: 2,
  },
  taskListContainer: {
    gap: 12,
  },
  taskCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  taskInfo: {
    flex: 1,
  },
  badgeRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 8,
    fontWeight: "800",
  },
  highBadge: { backgroundColor: "#FFE4E6" },
  highText: { color: "#F43F5E" },
  medBadge: { backgroundColor: "#FEF3C7" },
  medText: { color: "#D97706" },
  lowBadge: { backgroundColor: "#DBEAFE" },
  lowText: { color: "#2563EB" },
  statusBadge: { backgroundColor: "#F1F5F9" },
  statusText: { color: "#64748B" },
  doneBadge: { backgroundColor: "#D1FAE5" },
  doneText: { color: "#10B981" },
  taskTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
  },
  lineThrough: {
    textDecorationLine: "line-through",
    opacity: 0.5,
  },
  assigneeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  assigneeAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#EEF2FF",
    justifyContent: "center",
    alignItems: "center",
  },
  assigneeAvatarText: {
    fontSize: 8,
    fontWeight: "900",
    color: "#6366F1",
  },
  assigneeName: {
    fontSize: 9,
    fontWeight: "800",
    color: "#94A3B8",
    letterSpacing: 0.5,
  },
  arrowIconBg: {
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    justifyContent: "center",
    alignItems: "center",
  },
  emptyStateContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyIconBox: {
    width: 64,
    height: 64,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#F1F5F9",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: 0.5,
  },
  emptySubtitle: {
    fontSize: 10,
    fontWeight: "700",
    color: "#94A3B8",
    marginTop: 4,
    textAlign: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 32,
    padding: 24,
    boxShadow: [{
      offsetX: 0,
      offsetY: 10,
      blurRadius: 20,
      color: "rgba(0,0,0,0.1)",
    }],
    elevation: 5,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  intelTag: {
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#C7D2FE",
  },
  intelTagText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#6366F1",
    letterSpacing: 0.5,
  },
  closeBtn: {
    padding: 4,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0F172A",
  },
  intelMetaRow: {
    flexDirection: "row",
    gap: 10,
    marginVertical: 16,
  },
  metaBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  metaText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 0.5,
  },
  descriptionBox: {
    backgroundColor: "#F8FAFC",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    marginBottom: 16,
  },
  descriptionText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748B",
    lineHeight: 16,
  },
  subtaskContainer: {
    backgroundColor: "#F8FAFC",
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    marginBottom: 20,
  },
  subtaskHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  subtaskTitleText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#64748B",
    letterSpacing: 0.5,
  },
  subtaskCountBadge: {
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  subtaskCountText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#4338CA",
  },
  subtaskPctText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#94A3B8",
  },
  subtaskTrack: {
    height: 4,
    backgroundColor: "#E2E8F0",
    borderRadius: 2,
    overflow: "hidden",
    marginBottom: 10,
  },
  subtaskFill: {
    height: "100%",
  },
  subtaskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFFFFF",
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 6,
  },
  subtaskRowCompleted: {
    backgroundColor: "#F1F5F9",
  },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxChecked: {
    backgroundColor: "#6366F1",
    borderColor: "#6366F1",
  },
  subtaskText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#334155",
  },
  addSubtaskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
  },
  subtaskInput: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 11,
    color: "#0F172A",
  },
  addSubtaskBtn: {
    backgroundColor: "#EEF2FF",
    padding: 6,
    borderRadius: 10,
  },
  cycleBtn: {
    backgroundColor: "#0F172A",
    paddingVertical: 14,
    borderRadius: 18,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  cycleBtnText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
});
