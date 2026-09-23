import React, { useMemo, useState } from "react";
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView as RNSafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "../../components/icons";
import { useGroup } from "../../context/group";
import { useAuth } from "../../context/auth";
import { getTaskHealth } from "../../lib/stats";
import {
  createTask,
  loadTasks,
  removeTask,
  subscribeToTasks,
  updateTask,
} from "../../lib/tasks";

type TaskStatus = "To Do" | "In Progress" | "Review" | "Done";
type Priority = "High" | "Medium" | "Low";

type Subtask = {
  id: string;
  title: string;
  completed: boolean;
};

type Task = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  assignee: string;
  dueDate: string;
  subtasks: Subtask[];
};

const statusTabs = ["All", "To Do", "In Progress", "Review", "Done"] as const;
const boardStatuses = ["To Do", "In Progress", "Review", "Done"] as const;
const priorities = ["All Priority", "High", "Medium", "Low"] as const;
type ViewMode = "kanban" | "list";

function getEmptyStateCopy(status: (typeof statusTabs)[number]) {
  if (status === "To Do") {
    return {
      title: "NO Tasks Yet",
    };
  }
  if (status === "In Progress") {
    return {
      title: "NO TASKS IN PROGRESS",
    };
  }
  if (status === "Done") {
    return {
      title: "NO COMPLETED TASKS",
    };
  }
  return {
    title: "NO TASKS",
    subtitle: "Drag card or click + to add",
  };
}

export default function TasksScreen() {
  const { user } = useAuth();
  const { activeGroup } = useGroup();
  const activeTeamId = activeGroup?.id ?? null;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [prevUserId, setPrevUserId] = useState<string | null>(user?.id ?? null);
  const [activeStatus, setActiveStatus] =
    useState<(typeof statusTabs)[number]>("All");
  const [activePriority, setActivePriority] =
    useState<(typeof priorities)[number]>("All Priority");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const [priorityMenuOpen, setPriorityMenuOpen] = useState(false);
  const [activeDropStatus, setActiveDropStatus] = useState<TaskStatus | null>(
    null,
  );
  const [taskFormVisible, setTaskFormVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [columnLayouts, setColumnLayouts] = useState<
    Partial<Record<TaskStatus, { x: number; width: number }>>
  >({});
  const columnRefs = React.useRef<Partial<Record<TaskStatus, View | null>>>({});
  const [isDragging, setIsDragging] = useState(false);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [scrollOffsetX, setScrollOffsetX] = useState(0);
  const [boardFrame, setBoardFrame] = useState({ x: 0, width: 0 });
  const boardScrollRef = React.useRef<ScrollView>(null);
  const boardWrapRef = React.useRef<View>(null);
  // Build a de-duplicated assignee list: "Unassigned" is always offered first,
  // followed by the signed-in user and any assignee already used on a task.
  // Task rows commonly store the literal "Unassigned" (see TaskFormModal.submit),
  // so seeding a Set instead of prepending to an array prevents duplicate
  // entries — duplicates would render duplicate React keys and drop list items.
  const assigneeOptions = useMemo(() => {
    const names = new Set<string>(["Unassigned"]);

    const displayName = user?.user_metadata?.displayName;
    if (typeof displayName === "string" && displayName.trim()) {
      names.add(displayName.trim());
    }

    tasks.forEach((task) => {
      const assignee = task.assignee?.trim();
      if (assignee) names.add(assignee);
    });

    return Array.from(names);
  }, [tasks, user]);

  // Clear stale tasks as soon as the signed-in user changes (e.g. logs out).
  // Using the "adjust state during render" pattern avoids a synchronous
  // setState inside an effect (react-hooks/set-state-in-effect).
  const userId = user?.id ?? null;
  if (userId !== prevUserId) {
    setPrevUserId(userId);
    if (!userId) {
      setTasks([]);
    }
  }

  React.useEffect(() => {
    if (!user) return;

    const refreshTasks = async () => {
      const { data, error } = await loadTasks(user.id, activeTeamId);
      if (error) {
        console.error("Unable to load tasks:", error);
        return;
      }
      setTasks(data);
    };

    void refreshTasks();
    return subscribeToTasks(user.id, activeTeamId ?? undefined, () =>
      void refreshTasks(),
    );
  }, [user, activeTeamId]);

  const visibleTasks = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return tasks.filter((task) => {
      const matchesStatus =
        activeStatus === "All" || task.status === activeStatus;
      const matchesPriority =
        activePriority === "All Priority" || task.priority === activePriority;
      const matchesSearch =
        !normalizedSearch ||
        `${task.title} ${task.description}`
          .toLowerCase()
          .includes(normalizedSearch);

      return matchesStatus && matchesPriority && matchesSearch;
    });
  }, [activePriority, activeStatus, search, tasks]);

  const getStatusCount = (status: (typeof statusTabs)[number]) => {
    if (status === "All") return tasks.length;
    return tasks.filter((task) => task.status === status).length;
  };

  // Resolve which column a finger position is over. Column x/width come from
  // onLayout (fixed content coordinates); the board's viewport window origin
  // minus the current content scroll offset gives the live window position, so
  // hit-testing stays correct even while the board is scrolled or auto-scrolling.
  const findDropTarget = (x: number): TaskStatus | null => {
    for (const status of boardStatuses) {
      const layout = columnLayouts[status];
      if (!layout) continue;
      const windowX = boardFrame.x - scrollOffsetX + layout.x;
      if (x >= windowX && x <= windowX + layout.width) {
        return status;
      }
    }
    return null;
  };

  const openCreateTask = (status: TaskStatus = "To Do") => {
    setEditingTask({
      id: "",
      title: "",
      description: "",
      status,
      priority: "Medium",
      assignee: "",
      dueDate: "",
      subtasks: [],
    });
    setTaskFormVisible(true);
  };

  const openEditTask = (task: Task) => {
    setEditingTask(task);
    setTaskFormVisible(true);
  };

  // Delete Task
  const deleteTask = (task: Task) => {
    Alert.alert(
      "Delete task?",
      `This will permanently delete "${task.title}".`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (!user) return;
            try {
              // ✅ Only pass task.id (owner filtering is handled by RLS)
              await removeTask(task.id);
            } catch (error) {
              Alert.alert(
                "Unable to delete task",
                error instanceof Error ? error.message : "Please try again.",
              );
            }
          },
        },
      ],
    );
  };

  // Save Task
  const saveTask = async (values: Omit<Task, "id">) => {
    if (!user) return;

    try {
      if (editingTask?.id) {
        // ✅ Pass (taskId, updates)
        await updateTask(editingTask.id, values);
        // Reflect the edit instantly instead of waiting for the realtime channel.
        setTasks((current) =>
          current.map((t) =>
            t.id === editingTask.id ? { ...t, ...values } : t,
          ),
        );
      } else {
        // ✅ Pass (userId, taskData)
        const created = await createTask(user.id, values);
        const row = created?.[0];
        if (row) {
          // Insert the freshly created task (including its subtasks) right away
          // so it shows on the board without relying on realtime.
          setTasks((current) => [
            ...current,
            {
              id: row.id,
              title: row.title ?? values.title,
              description: row.description ?? values.description,
              status: (row.status as TaskStatus) ?? values.status,
              priority: (row.priority as Priority) ?? values.priority,
              assignee: row.assignee ?? values.assignee,
              dueDate: row.due_date ?? values.dueDate,
              subtasks: row.subtasks ?? values.subtasks,
            },
          ]);
        }
      }
    } catch (error) {
      Alert.alert(
        editingTask?.id ? "Unable to update task" : "Unable to create task",
        error instanceof Error ? error.message : "Please try again.",
      );
      return;
    }

    setTaskFormVisible(false);
    setEditingTask(null);
  };
  // Update Subtasks
  const updateSubtasks = async (task: Task, subtasks: Subtask[]) => {
    if (!user) return;
    const prevSubtasks = task.subtasks;
    // Optimistically show the updated subtasks (added/toggled) immediately
    // instead of waiting for the realtime channel to echo the write back.
    setTasks((current) =>
      current.map((t) => (t.id === task.id ? { ...t, subtasks } : t)),
    );
    try {
      await updateTask(task.id, { subtasks });
    } catch (error) {
      setTasks((current) =>
        current.map((t) =>
          t.id === task.id ? { ...t, subtasks: prevSubtasks } : t,
        ),
      );
      Alert.alert(
        "Unable to update subtasks",
        error instanceof Error ? error.message : "Please try again.",
      );
    }
  };

  return (
    <RNSafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#111A31" />

      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View style={styles.headerTitleRow}>
            <View style={styles.headerIcon}>
              <Ionicons name="clipboard-outline" size={26} color="#FFFFFF" />
            </View>
            <View>
              <Text style={styles.headerTitle}>TASKS</Text>
              <Text style={styles.headerSubtitle}>Workspace</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => openCreateTask()}
            accessibilityLabel="Add task"
          >
            <Ionicons name="add" size={16} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!isDragging}
      >
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={19} color="#8CA0BE" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search tasks..."
              placeholderTextColor="#B3C0D4"
              style={styles.searchInput}
              returnKeyType="search"
            />
          </View>

          <View
            style={styles.viewToggle}
            accessibilityRole="tablist"
            accessibilityLabel="Task view"
          >
            <TouchableOpacity
              style={[
                styles.viewToggleButton,
                viewMode === "kanban" && styles.activeViewToggleButton,
              ]}
              onPress={() => setViewMode("kanban")}
              accessibilityRole="tab"
              accessibilityState={{ selected: viewMode === "kanban" }}
              accessibilityLabel="Kanban board view"
            >
              <Ionicons
                name="square-outline"
                size={17}
                color={viewMode === "kanban" ? "#FFFFFF" : "#64748B"}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.viewToggleButton,
                viewMode === "list" && styles.activeViewToggleButton,
              ]}
              onPress={() => setViewMode("list")}
              accessibilityRole="tab"
              accessibilityState={{ selected: viewMode === "list" }}
              accessibilityLabel="Task list view"
            >
              <Ionicons
                name="list-outline"
                size={17}
                color={viewMode === "list" ? "#FFFFFF" : "#64748B"}
              />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.statusTabs}
        >
          {statusTabs.map((status) => {
            const isActive = activeStatus === status;

            return (
              <TouchableOpacity
                key={status}
                style={[
                  styles.statusTab,
                  isActive && {
                    backgroundColor: getStatusColor(status),
                  },
                ]}
                onPress={() => setActiveStatus(status)}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
              >
                <Text
                  style={[
                    styles.statusTabText,
                    isActive && styles.activeStatusTabText,
                  ]}
                >
                  {status.toUpperCase()}
                </Text>
                <Text
                  style={[
                    styles.countBadge,
                    isActive && {
                      backgroundColor: "rgba(255, 255, 255, 0.22)",
                      color: "#FFFFFF",
                    },
                  ]}
                >
                  {getStatusCount(status)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.filterRow}>
          <Text style={styles.sectionLabel}>MY TASKS</Text>
          <View style={styles.priorityWrapper}>
            <TouchableOpacity
              style={styles.priorityButton}
              onPress={() => setPriorityMenuOpen((isOpen) => !isOpen)}
              accessibilityRole="button"
              accessibilityLabel="Filter by priority"
            >
              <Text style={styles.priorityButtonText}>{activePriority}</Text>
              <Ionicons
                name={priorityMenuOpen ? "chevron-up" : "chevron-down"}
                size={15}
                color="#566985"
              />
            </TouchableOpacity>

            {priorityMenuOpen ? (
              <View style={styles.priorityMenu}>
                {priorities.map((priority) => (
                  <TouchableOpacity
                    key={priority}
                    style={styles.priorityOption}
                    onPress={() => {
                      setActivePriority(priority);
                      setPriorityMenuOpen(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.priorityOptionText,
                        priority === activePriority &&
                          styles.selectedPriorityText,
                      ]}
                    >
                      {priority}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </View>
        </View>

        {viewMode === "kanban" ? (
          <View
            ref={boardWrapRef}
            collapsable={false}
            onLayout={(event) => {
              const { width } = event.nativeEvent.layout;
              boardWrapRef.current?.measureInWindow((x) => {
                setBoardFrame((current) =>
                  current.x === x && current.width === width
                    ? current
                    : { x, width },
                );
              });
            }}
          >
          <ScrollView
            ref={boardScrollRef}
            horizontal
            scrollEnabled={!isDragging}
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={(event) =>
              setScrollOffsetX(event.nativeEvent.contentOffset.x)
            }
            contentContainerStyle={styles.boardScroller}
          >
            {boardStatuses.map((status) => {
              const columnTasks = visibleTasks.filter(
                (task) => task.status === status,
              );
              const isDropTarget = activeDropStatus === status;

              return (
                <View
                  key={status}
                  style={[
                    styles.taskBoard,
                    isDropTarget && styles.activeDropBoard,
                  ]}
                  ref={(node) => {
                    columnRefs.current[status] = node;
                  }}
                  onLayout={(event) => {
                    const { x, width } = event.nativeEvent.layout;
                    setColumnLayouts((current) => {
                      const existing = current[status];
                      return existing?.x === x && existing.width === width
                        ? current
                        : { ...current, [status]: { x, width } };
                    });
                  }}
                >
                  <View style={styles.boardHeader}>
                    <View style={styles.boardTitleRow}>
                      <View
                        style={[
                          styles.boardStatusDot,
                          { backgroundColor: getStatusColor(status) },
                        ]}
                      />
                      <Text style={styles.boardTitle}>
                        {status.toUpperCase()}
                      </Text>
                      <Text style={styles.boardCount}>
                        {columnTasks.length}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.boardAddButton}
                      onPress={() => openCreateTask(status)}
                      accessibilityLabel={`Add task to ${status}`}
                    >
                      <Ionicons name="add" size={18} color="#8FA2BE" />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.taskList}>
                    {columnTasks.length > 0 ? (
                      columnTasks.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          isDragging={draggingTaskId === task.id}
                          resolveDropTarget={findDropTarget}
                          onDragStart={() => {
                            setDraggingTaskId(task.id);
                            setActiveDropStatus(task.status);
                            setIsDragging(true);
                          }}
                          onDragMove={(x) => {
                            const target = findDropTarget(x);
                            setActiveDropStatus((current) =>
                              current === target ? current : target,
                            );

                            // Auto-scroll the board while the finger sits near
                            // its horizontal edges so cards can be dragged across
                            // far-apart columns seamlessly.
                            if (
                              boardScrollRef.current &&
                              boardFrame.width > 0
                            ) {
                              const edge = 56;
                              const step = 24;
                              if (x < boardFrame.x + edge) {
                                boardScrollRef.current.scrollTo({
                                  x: Math.max(0, scrollOffsetX - step),
                                  animated: false,
                                });
                              } else if (
                                x >
                                boardFrame.x + boardFrame.width - edge
                              ) {
                                boardScrollRef.current.scrollTo({
                                  x: scrollOffsetX + step,
                                  animated: false,
                                });
                              }
                            }
                          }}
                          onDragEnd={(targetStatus) => {
                            setDraggingTaskId(null);
                            setActiveDropStatus(null);
                            setIsDragging(false);
                            if (
                              targetStatus &&
                              targetStatus !== task.status &&
                              user
                            ) {
                              const prevStatus = task.status;
                              // Optimistically move the card into the target
                              // column immediately; revert if the write fails.
                              setTasks((current) =>
                                current.map((t) =>
                                  t.id === task.id
                                    ? { ...t, status: targetStatus }
                                    : t,
                                ),
                              );
                              updateTask(task.id, {
                                status: targetStatus,
                              }).catch(() => {
                                setTasks((current) =>
                                  current.map((t) =>
                                    t.id === task.id
                                      ? { ...t, status: prevStatus }
                                      : t,
                                  ),
                                );
                                Alert.alert(
                                  "Unable to move task",
                                  "Couldn't save the new status. Please try again.",
                                );
                              });
                            }
                          }}
                          onEdit={() => openEditTask(task)}
                          onDelete={() => deleteTask(task)}
                          onUpdateSubtasks={(subtasks) =>
                            updateSubtasks(task, subtasks)
                          }
                        />
                      ))
                    ) : (
                      <View style={styles.emptyCard}>
                        <Text style={styles.emptyTitle}>
                          {getEmptyStateCopy(status).title}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
        ) : (
          <View style={styles.listContainer}>
            {(activeStatus === "All"
              ? [...boardStatuses]
              : [activeStatus]
            ).map((status) => {
              const sectionTasks = visibleTasks.filter(
                (task) => task.status === status,
              );

              return (
                <View key={status} style={styles.listSection}>
                  <View style={styles.boardHeader}>
                    <View style={styles.boardTitleRow}>
                      <View
                        style={[
                          styles.boardStatusDot,
                          { backgroundColor: getStatusColor(status) },
                        ]}
                      />
                      <Text style={styles.boardTitle}>
                        {status.toUpperCase()}
                      </Text>
                      <Text style={styles.boardCount}>
                        {sectionTasks.length}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.boardAddButton}
                      onPress={() => openCreateTask(status)}
                      accessibilityLabel={`Add task to ${status}`}
                    >
                      <Ionicons name="add" size={18} color="#8FA2BE" />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.taskList}>
                    {sectionTasks.length > 0 ? (
                      sectionTasks.map((task) => (
                        <TaskListRow
                          key={task.id}
                          task={task}
                          onEdit={() => openEditTask(task)}
                          onDelete={() => deleteTask(task)}
                        />
                      ))
                    ) : (
                      <View style={styles.emptyCard}>
                        <Text style={styles.emptyTitle}>
                          {getEmptyStateCopy(status).title}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <TaskFormModal
        visible={taskFormVisible}
        task={editingTask}
        assigneeOptions={assigneeOptions}
        onClose={() => {
          setTaskFormVisible(false);
          setEditingTask(null);
        }}
        onSave={saveTask}
      />
    </RNSafeAreaView>
  );
}

function TaskListRow({
  task,
  onEdit,
  onDelete,
}: {
  task: Task;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const health = getTaskHealth(task);
  const completedSubtasks = task.subtasks.filter(
    (subtask) => subtask.completed,
  ).length;

  return (
    <View style={styles.listRow}>
      <View
        style={[
          styles.listRowStatusBar,
          { backgroundColor: getStatusColor(task.status) },
        ]}
      />
      <View style={styles.listRowContent}>
        <View style={styles.taskCardTopRow}>
          <Text style={styles.taskTitle} numberOfLines={1}>
            {task.title}
          </Text>
          <View style={styles.taskActions}>
            <TouchableOpacity onPress={onEdit} accessibilityLabel="Edit task">
              <Ionicons name="create-outline" size={16} color="#566985" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onDelete}
              accessibilityLabel="Delete task"
            >
              <Ionicons name="trash-outline" size={16} color="#566985" />
            </TouchableOpacity>
          </View>
        </View>

        {task.description ? (
          <Text style={styles.taskDescription} numberOfLines={2}>
            {task.description}
          </Text>
        ) : null}

        <View style={styles.listRowMetaRow}>
          <View
            style={[
              styles.listRowStatusBadge,
              { backgroundColor: getStatusColor(task.status) },
            ]}
          >
            <Text style={styles.listRowStatusText}>{task.status}</Text>
          </View>
          <View
            style={[
              styles.listRowPriorityBadge,
              { backgroundColor: getPriorityAccent(task.priority).background },
            ]}
          >
            <Ionicons
              name={getPriorityIcon(task.priority)}
              size={12}
              color={getPriorityAccent(task.priority).color}
            />
            <Text
              style={[
                styles.listRowPriorityText,
                { color: getPriorityAccent(task.priority).color },
              ]}
            >
              {task.priority}
            </Text>
          </View>
          <Text style={styles.listRowMetaText} numberOfLines={1}>
            {task.assignee || "Unassigned"}
          </Text>
        </View>

        <View style={styles.listRowFooter}>
          <View
            style={[styles.listRowHealthBadge, { backgroundColor: health.background }]}
          >
            <Text style={[styles.healthText, { color: health.color }]}>
              {health.label}
            </Text>
          </View>
          <Text style={styles.listRowMetaText}>
            {completedSubtasks}/{task.subtasks.length} subtasks
          </Text>
        </View>
      </View>
    </View>
  );
}

function TaskCard({
  task,
  isDragging,
  resolveDropTarget,
  onDragStart,
  onDragMove,
  onDragEnd,
  onEdit,
  onDelete,
  onUpdateSubtasks,
}: {
  task: Task;
  isDragging: boolean;
  resolveDropTarget: (x: number) => TaskStatus | null;
  onDragStart: () => void;
  onDragMove: (x: number) => void;
  onDragEnd: (targetStatus: TaskStatus | null) => void;
  onEdit: () => void;
  onDelete: () => void;
  onUpdateSubtasks: (subtasks: Subtask[]) => Promise<void>;
}) {
  const [translate] = useState(() => new Animated.ValueXY());
  const [scale] = useState(() => new Animated.Value(1));
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const health = getTaskHealth(task);

  // Inline subtask editing state
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [editingSubtaskTitle, setEditingSubtaskTitle] = useState("");

  const startEditSubtask = (subtask: Subtask) => {
    setEditingSubtaskId(subtask.id);
    setEditingSubtaskTitle(subtask.title);
  };

  const commitEditSubtask = (subtask: Subtask) => {
    const title = editingSubtaskTitle.trim();
    setEditingSubtaskId(null);
    setEditingSubtaskTitle("");
    if (!title || title === subtask.title) return;
    void onUpdateSubtasks(
      task.subtasks.map((item) =>
        item.id === subtask.id ? { ...item, title } : item,
      ),
    );
  };

  // Recreate the PanResponder whenever the values it captures change so the
  // gesture handlers always close over fresh layouts/callbacks. Recreating the
  // handler set mid-gesture is safe: the responder stays attached to the view,
  // and each move event is dispatched through the latest props.
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > 8 || Math.abs(gestureState.dy) > 8,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          onDragStart();
          translate.setOffset({ x: 0, y: 0 });
          translate.setValue({ x: 0, y: 0 });
          Animated.spring(scale, {
            toValue: 1.04,
            useNativeDriver: true,
            speed: 24,
            bounciness: 0,
          }).start();
        },
        onPanResponderMove: (_, gestureState) => {
          translate.setValue({ x: gestureState.dx, y: gestureState.dy });
          // The parent handles column hit-testing and board auto-scroll.
          onDragMove(gestureState.moveX);
        },
        onPanResponderRelease: (_, gestureState) => {
          const target = resolveDropTarget(gestureState.moveX) ?? null;

          if (target && target !== task.status) {
            // Dropped in a different column: snap home instantly. The parent's
            // optimistic update re-renders the card inside the target column.
            translate.setValue({ x: 0, y: 0 });
          } else {
            // Dropped back in the same column (or nowhere): spring back.
            translate.flattenOffset();
            Animated.spring(translate, {
              toValue: { x: 0, y: 0 },
              useNativeDriver: true,
              speed: 36,
              bounciness: 0,
            }).start();
          }
          Animated.spring(scale, {
            toValue: 1,
            useNativeDriver: true,
          }).start();
          onDragEnd(target);
        },
        onPanResponderTerminate: () => {
          translate.flattenOffset();
          Animated.spring(translate, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: true,
            speed: 36,
            bounciness: 0,
          }).start();
          Animated.spring(scale, {
            toValue: 1,
            useNativeDriver: true,
          }).start();
          onDragEnd(null);
        },
      }),
    [
      onDragEnd,
      onDragMove,
      onDragStart,
      resolveDropTarget,
      scale,
      task.status,
      translate,
    ],
  );

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.taskCard,
        isDragging && styles.draggingCard,
        {
          transform: [
            { translateX: translate.x },
            { translateY: translate.y },
            { scale },
          ],
        },
      ]}
    >
      <View style={styles.taskCardTopRow}>
        <View
          style={[
            styles.priorityDot,
            { backgroundColor: getPriorityColor(task.priority) },
          ]}
        />
        <Text style={styles.taskTitle}>{task.title}</Text>
        <View style={styles.taskActions}>
          <TouchableOpacity
            onPress={onEdit}
            accessibilityLabel={`Edit ${task.title}`}
          >
            <Ionicons name="create-outline" size={18} color="#64748B" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onDelete}
            accessibilityLabel={`Delete ${task.title}`}
          >
            <Ionicons name="trash-outline" size={18} color="#F15B76" />
          </TouchableOpacity>
        </View>
      </View>
      <Text style={styles.taskDescription}>{task.description}</Text>
      <View style={styles.taskDetailsRow}>
        <View style={styles.detailItem}>
          <Ionicons name="person-outline" size={13} color="#8292AA" />
          <Text style={styles.detailText}>{task.assignee || "Unassigned"}</Text>
        </View>
        <View style={styles.detailItem}>
          <Ionicons name="calendar" size={13} color="#8292AA" />
          <Text style={styles.detailText}>{task.dueDate || "No due date"}</Text>
        </View>
      </View>
      <View
        style={[styles.healthBadge, { backgroundColor: health.background }]}
      >
        <View style={[styles.healthDot, { backgroundColor: health.color }]} />
        <Text style={[styles.healthText, { color: health.color }]}>
          {health.label}
        </Text>
      </View>
      <View style={styles.subtaskSection}>
        <View style={styles.subtaskHeader}>
          <Text style={styles.subtaskLabel}>SUBTASKS</Text>
          <Text style={styles.subtaskCount}>
            {task.subtasks.filter((subtask) => subtask.completed).length}/
            {task.subtasks.length}
          </Text>
        </View>
        {task.subtasks.map((subtask) => (
          <View key={subtask.id} style={styles.subtaskRow}>
            <TouchableOpacity
              onPress={() =>
                onUpdateSubtasks(
                  task.subtasks.map((item) =>
                    item.id === subtask.id
                      ? { ...item, completed: !item.completed }
                      : item,
                  ),
                )
              }
              accessibilityLabel={`Mark subtask ${subtask.title} ${subtask.completed ? "incomplete" : "complete"}`}
            >
              <Ionicons
                name={subtask.completed ? "checkbox" : "square-outline"}
                size={17}
                color={subtask.completed ? "#16A34A" : "#94A3B8"}
              />
            </TouchableOpacity>
            {editingSubtaskId === subtask.id ? (
              <>
                <TextInput
                  value={editingSubtaskTitle}
                  onChangeText={setEditingSubtaskTitle}
                  style={styles.subtaskEditInput}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={() => commitEditSubtask(subtask)}
                  onBlur={() => commitEditSubtask(subtask)}
                />
                <TouchableOpacity
                  onPress={() => commitEditSubtask(subtask)}
                  style={styles.subtaskEditBtn}
                  accessibilityLabel="Save subtask edit"
                >
                  <Ionicons name="checkmark" size={14} color="#16A34A" />
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text
                  style={[
                    styles.subtaskText,
                    subtask.completed && styles.completedSubtask,
                  ]}
                  numberOfLines={1}
                >
                  {subtask.title}
                </Text>
                <TouchableOpacity
                  onPress={() => startEditSubtask(subtask)}
                  style={styles.subtaskEditBtn}
                  accessibilityLabel={`Edit subtask ${subtask.title}`}
                >
                  <Ionicons name="create-outline" size={13} color="#94A3B8" />
                </TouchableOpacity>
              </>
            )}
          </View>
        ))}
        <View style={styles.addSubtaskRow}>
          <TextInput
            value={subtaskTitle}
            onChangeText={setSubtaskTitle}
            placeholder="Add a subtask..."
            placeholderTextColor="#A5B3C5"
            style={styles.subtaskInput}
            returnKeyType="done"
            onSubmitEditing={() => {
              const title = subtaskTitle.trim();
              if (!title) return;
              void onUpdateSubtasks([
                ...task.subtasks,
                { id: `${Date.now()}`, title, completed: false },
              ]);
              setSubtaskTitle("");
            }}
          />
          <TouchableOpacity
            style={styles.addSubtaskButton}
            onPress={() => {
              const title = subtaskTitle.trim();
              if (!title) return;
              void onUpdateSubtasks([
                ...task.subtasks,
                { id: `${Date.now()}`, title, completed: false },
              ]);
              setSubtaskTitle("");
            }}
            accessibilityLabel="Add subtask"
          >
            <Ionicons name="add" size={16} color="#6366F1" />
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.taskMetaRow}>
        <Text style={styles.taskStatus}>{task.status.toUpperCase()}</Text>
        <Text style={styles.taskPriority}>{task.priority.toUpperCase()}</Text>
      </View>
    </Animated.View>
  );
}

// Task health (Healthy / Due soon / Overdue / No deadline) now comes from the
// shared stats layer in `lib/stats`, so the Tasks board, the Statistics tab and
// the notification feed always classify a task the same way.

function TaskFormModal({
  visible,
  task,
  assigneeOptions,
  onClose,
  onSave,
}: {
  visible: boolean;
  task: Task | null;
  assigneeOptions: string[];
  onClose: () => void;
  onSave: (values: Omit<Task, "id">) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>("To Do");
  const [priority, setPriority] = useState<Priority>("Medium");
  const [assignee, setAssignee] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [subtaskInput, setSubtaskInput] = useState("");
  const [editingModalSubtaskId, setEditingModalSubtaskId] = useState<
    string | null
  >(null);
  const [editingModalSubtaskTitle, setEditingModalSubtaskTitle] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // A task with an id already exists → the modal is editing it rather than
  // creating a new one.
  const isEditing = Boolean(task?.id);

  const [assigneeMenuOpen, setAssigneeMenuOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());

  // Copy the opened task into the form controls whenever the opened task
  // changes. Using the "adjust state during render" pattern avoids a
  // synchronous setState inside an effect (react-hooks/set-state-in-effect).
  const [prevTask, setPrevTask] = useState(task);
  if (task !== prevTask) {
    setPrevTask(task);
    if (task) {
      setTitle(task.title);
      setDescription(task.description);
      setStatus(task.status);
      setPriority(task.priority);
      setAssignee(task.assignee || "Unassigned");
      setDueDate(task.dueDate || "");
      setSubtasks(task.subtasks || []);
      setCalendarMonth(
        task.dueDate ? new Date(`${task.dueDate}T12:00:00`) : new Date(),
      );
    }
  }

  const handleAddSubtask = () => {
    const trimmed = subtaskInput.trim();
    if (!trimmed) return;
    setSubtasks((prev) => [
      ...prev,
      { id: `${Date.now()}`, title: trimmed, completed: false },
    ]);
    setSubtaskInput("");
  };

  const startEditModalSubtask = (st: Subtask) => {
    setEditingModalSubtaskId(st.id);
    setEditingModalSubtaskTitle(st.title);
  };

  const commitEditModalSubtask = (st: Subtask) => {
    const title = editingModalSubtaskTitle.trim();
    setEditingModalSubtaskId(null);
    setEditingModalSubtaskTitle("");
    if (!title || title === st.title) return;
    setSubtasks((prev) =>
      prev.map((item) => (item.id === st.id ? { ...item, title } : item)),
    );
  };

  const submit = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      Alert.alert("Title required", "Add a title before saving the task.");
      return;
    }

    setIsSaving(true);
    await onSave({
      title: trimmedTitle,
      description: description.trim(),
      status,
      priority,
      assignee: assignee || "Unassigned",
      dueDate,
      subtasks,
    });
    setIsSaving(false);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.modalBackdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>
                {isEditing ? "EDIT TASK" : "CREATE TASK"}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              accessibilityLabel="Close modal"
            >
              <Ionicons name="close" size={22} color="#8F9BB3" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.formScrollView}
            contentContainerStyle={styles.formScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Task Title */}
            <Text style={styles.formLabel}>TASK TITLE *</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="What needs to be done?"
              placeholderTextColor="#8F9BB3"
              style={styles.formInput}
            />

            {/* Description */}
            <Text style={styles.formLabel}>DESCRIPTION *</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Add details, notes, or instructions..."
              placeholderTextColor="#8F9BB3"
              style={[styles.formInput, styles.descriptionInput]}
              multiline
              textAlignVertical="top"
            />

            {/* Initial Status */}
            <Text style={styles.formLabel}>STATUS</Text>
            <View style={styles.choiceRow}>
              {boardStatuses.map((option) => {
                const selected = status === option;
                return (
                  <TouchableOpacity
                    key={option}
                    style={[
                      styles.statusChip,
                      // Use each status' own board color instead of one shared
                      // accent so the selected chip matches its column/tab.
                      selected && { backgroundColor: getStatusColor(option) },
                    ]}
                    onPress={() => setStatus(option)}
                  >
                    <Text
                      style={[
                        styles.statusChipText,
                        selected && styles.statusChipTextSelected,
                      ]}
                    >
                      {option}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Priority */}
            <Text style={styles.formLabel}>PRIORITY</Text>
            <View style={styles.choiceRow}>
              {(["Low", "Medium", "High"] as Priority[]).map((option) => {
                const selected = priority === option;
                const accent = getPriorityAccent(option);

                return (
                  <TouchableOpacity
                    key={option}
                    style={[
                      styles.priorityChip,
                      // Tint the selected chip with the priority's own accent so
                      // Low/Medium/High each get blue/amber/red (previously only
                      // Medium had a variant and the others went gray).
                      selected && {
                        backgroundColor: accent.background,
                        borderColor: accent.border,
                      },
                    ]}
                    onPress={() => setPriority(option)}
                  >
                    <Ionicons
                      name={getPriorityIcon(option)}
                      size={18}
                      color={selected ? accent.color : "#64748B"}
                    />
                    <Text
                      style={[
                        styles.priorityChipText,
                        selected && { color: accent.color, fontWeight: "700" },
                      ]}
                    >
                      {option}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Assignee & Due Date Row */}
            <View style={styles.rowInputs}>
              <View style={styles.rowInputFlex}>
                <Text style={styles.formLabel}>ASSIGNEE</Text>
                <TouchableOpacity
                  style={styles.formSelect}
                  onPress={() => setAssigneeMenuOpen((open) => !open)}
                >
                  <Text style={styles.formSelectText}>
                    {assignee || "Unassigned"}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color="#8F9BB3" />
                </TouchableOpacity>
                {assigneeMenuOpen ? (
                  <View style={styles.formMenu}>
                    {assigneeOptions.map((option) => (
                      <TouchableOpacity
                        key={option}
                        style={styles.formMenuOption}
                        onPress={() => {
                          setAssignee(option);
                          setAssigneeMenuOpen(false);
                        }}
                      >
                        <Text style={styles.formMenuText}>{option}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
              </View>

              <View style={styles.rowInputFlex}>
                <Text style={styles.formLabel}>DUE DATE</Text>
                <TouchableOpacity
                  style={styles.formSelect}
                  onPress={() => setCalendarOpen((open) => !open)}
                >
                  <Text style={styles.formSelectText}>
                    {dueDate || "Select date"}
                  </Text>
                  <Ionicons name="calendar-outline" size={18} color="#64748B" />
                </TouchableOpacity>
                {calendarOpen ? (
                  <DatePicker
                    value={dueDate}
                    month={calendarMonth}
                    onMonthChange={setCalendarMonth}
                    onSelect={(date) => {
                      setDueDate(date);
                      setCalendarOpen(false);
                    }}
                  />
                ) : null}
              </View>
            </View>

            {/* Subtasks Section */}
            <View style={styles.subtasksContainer}>
              <View style={styles.subtasksLabelRow}>
                <Text style={styles.subtasksTitle}>SUBTASKS</Text>
              </View>

              <View style={styles.addSubtaskContainer}>
                <TextInput
                  value={subtaskInput}
                  onChangeText={setSubtaskInput}
                  placeholder="Add a subtask..."
                  placeholderTextColor="#8F9BB3"
                  style={styles.subtaskFormInput}
                  onSubmitEditing={handleAddSubtask}
                />
                <TouchableOpacity
                  style={styles.addSubtaskBtn}
                  onPress={handleAddSubtask}
                >
                  <Text style={styles.addSubtaskBtnText}>Add</Text>
                </TouchableOpacity>
              </View>

              {subtasks.length === 0 ? (
                <Text style={styles.noSubtasksText}>
                  No subtasks created yet.
                </Text>
              ) : (
                subtasks.map((st) => (
                  <View key={st.id} style={styles.subtaskItemRow}>
                    {editingModalSubtaskId === st.id ? (
                      <View style={styles.modalSubtaskEditRow}>
                        <TextInput
                          value={editingModalSubtaskTitle}
                          onChangeText={setEditingModalSubtaskTitle}
                          style={styles.subtaskFormInput}
                          autoFocus
                          returnKeyType="done"
                          onSubmitEditing={() => commitEditModalSubtask(st)}
                          onBlur={() => commitEditModalSubtask(st)}
                        />
                        <TouchableOpacity
                          onPress={() => commitEditModalSubtask(st)}
                          style={styles.modalSubtaskEditBtn}
                          accessibilityLabel="Save subtask edit"
                        >
                          <Ionicons
                            name="checkmark"
                            size={16}
                            color="#16A34A"
                          />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={styles.modalSubtaskRowInner}>
                        <Text style={styles.subtaskItemText}>• {st.title}</Text>
                        <TouchableOpacity
                          onPress={() => startEditModalSubtask(st)}
                          style={styles.modalSubtaskEditBtn}
                          accessibilityLabel={`Edit subtask ${st.title}`}
                        >
                          <Ionicons
                            name="create-outline"
                            size={13}
                            color="#94A3B8"
                          />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))
              )}
            </View>
          </ScrollView>

          {/* Footer Actions */}
          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onClose}
              disabled={isSaving}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveButton, isSaving && styles.disabledButton]}
              onPress={submit}
              disabled={isSaving}
            >
              <Text style={styles.saveButtonText}>
                {isSaving ? "SAVI" : isEditing ? "UPDATE" : "CREATE"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function getPriorityColor(priority: Priority) {
  if (priority === "High") return "#E90909";
  if (priority === "Medium") return "#F6B84B";
  return "#5B8DEF";
}

function DatePicker({
  value,
  month,
  onMonthChange,
  onSelect,
}: {
  value: string;
  month: Date;
  onMonthChange: (month: Date) => void;
  onSelect: (date: string) => void;
}) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells = Array.from({ length: firstDay + daysInMonth }, (_, index) =>
    index < firstDay ? null : index - firstDay + 1,
  );

  return (
    <View style={styles.datePicker}>
      <View style={styles.datePickerHeader}>
        <TouchableOpacity
          onPress={() => onMonthChange(new Date(year, monthIndex - 1, 1))}
        >
          <Ionicons name="chevron-back" size={16} color="#566985" />
        </TouchableOpacity>
        <Text style={styles.datePickerTitle}>
          {month.toLocaleString("default", { month: "long" })} {year}
        </Text>
        <TouchableOpacity
          onPress={() => onMonthChange(new Date(year, monthIndex + 1, 1))}
        >
          <Ionicons name="chevron-forward" size={16} color="#566985" />
        </TouchableOpacity>
      </View>
      <View style={styles.weekdayRow}>
        {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
          <Text key={`${day}-${index}`} style={styles.weekdayText}>
            {day}
          </Text>
        ))}
      </View>
      <View style={styles.dateGrid}>
        {cells.map((day, index) => {
          if (!day)
            return <View key={`empty-${index}`} style={styles.dateCell} />;
          const date = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const selected = date === value;
          return (
            <TouchableOpacity
              key={date}
              style={[styles.dateCell, selected && styles.selectedDateCell]}
              onPress={() => onSelect(date)}
            >
              <Text
                style={[
                  styles.dateCellText,
                  selected && styles.selectedDateText,
                ]}
              >
                {day}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function getStatusColor(status: (typeof statusTabs)[number]) {
  if (status === "To Do") return "#6366F1";
  if (status === "In Progress") return "#F59E0B";
  if (status === "Review") return "#F15B76";
  if (status === "Done") return "#16A34A";
  return "#111A31";
}

// Per-priority accent palette. The `background`/`border` tints are used for the
// selected chip in the task form so each priority reads as its own color
// (blue / amber / red) instead of falling back to a neutral gray.
const PRIORITY_ACCENTS: Record<
  Priority,
  { color: string; background: string; border: string }
> = {
  Low: { color: "#3B82F6", background: "#EFF6FF", border: "#BFDBFE" },
  Medium: { color: "#D97706", background: "#FFFBEB", border: "#FDE68A" },
  High: { color: "#E90909", background: "#FEF2F2", border: "#FECACA" },
};

function getPriorityAccent(priority: Priority) {
  return PRIORITY_ACCENTS[priority];
}

function getPriorityIcon(priority: Priority) {
  if (priority === "Low") return "arrow-down-circle-outline";
  if (priority === "Medium") return "alert-circle-outline";
  return "warning-outline";
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  // Matches the team screen header metrics (24/24/28 padding + 48px icon) so
  // both tabs render a header of the same height.
  header: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 28,
    backgroundColor: "#111A31",
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "#3D485F",
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 42,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchBox: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E8EDF4",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
    boxShadow: [{
      offsetX: 0,
      offsetY: 2,
      blurRadius: 5,
      color: "rgba(21,34,61,0.05)",
    }],
    elevation: 1,
    marginVertical: 5,
  },
  searchInput: {
    flex: 1,
    color: "#253653",
    fontSize: 14,
    marginLeft: 9,
  },
  viewToggle: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    padding: 4,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E8EDF4",
    marginVertical: 5,
  },
  viewToggleButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  activeViewToggleButton: {
    backgroundColor: "#111A31",
  },
  statusTabs: {
    minWidth: "100%",
    backgroundColor: "#EEF2F6",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    gap: 6,
  },
  statusTab: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  activeStatusTab: {
    boxShadow: [{
      offsetX: 0,
      offsetY: 2,
      blurRadius: 4,
      color: "rgba(17,26,49,0.15)",
    }],
    elevation: 2,
  },
  statusTabText: {
    color: "#334563",
    fontSize: 10,
    fontWeight: "900",
  },
  activeStatusTabText: {
    color: "#FFFFFF",
  },
  countBadge: {
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: "#E3EAF3",
    color: "#6E829F",
    fontSize: 9,
    fontWeight: "800",
    textAlign: "center",
    lineHeight: 17,
  },
  filterRow: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionLabel: {
    color: "#71839F",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  priorityWrapper: {
    position: "relative",
    zIndex: 2,
  },
  priorityButton: {
    minWidth: 130,
    height: 34,
    paddingHorizontal: 11,
    borderRadius: 9,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  priorityButtonText: {
    color: "#566985",
    fontSize: 11,
    fontWeight: "700",
  },
  priorityMenu: {
    position: "absolute",
    right: 0,
    top: 39,
    width: 130,
    paddingVertical: 5,
    borderRadius: 9,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    boxShadow: [{
      offsetX: 0,
      offsetY: 4,
      blurRadius: 8,
      color: "rgba(21,34,61,0.12)",
    }],
    elevation: 4,
  },
  priorityOption: {
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  priorityOptionText: {
    color: "#566985",
    fontSize: 11,
    fontWeight: "600",
  },
  selectedPriorityText: {
    color: "#111A31",
    fontWeight: "900",
  },
  taskBoard: {
    width: 300,
    gap: 12,
    minHeight: 315,
    padding: 12,
    borderRadius: 18,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E1E8F1",
  },
  activeDropBoard: {
    borderColor: "#6366F1",
    backgroundColor: "#EEF2FF",
  },
  boardScroller: {
    gap: 12,
    paddingRight: 12,
  },
  listContainer: {
    gap: 12,
    paddingBottom: 8,
  },
  listSection: {
    gap: 10,
    padding: 12,
    borderRadius: 18,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E1E8F1",
  },
  listRow: {
    flexDirection: "row",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
  },
  listRowStatusBar: {
    width: 6,
  },
  listRowContent: {
    flex: 1,
    gap: 8,
    padding: 12,
  },
  listRowMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  listRowStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  listRowStatusText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  listRowPriorityBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    gap: 4,
  },
  listRowPriorityText: {
    fontSize: 11,
    fontWeight: "700",
  },
  listRowMetaText: {
    flex: 1,
    fontSize: 11,
    color: "#8FA2BE",
    fontWeight: "600",
  },
  listRowFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  listRowHealthBadge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
  },
  boardHeader: {
    minHeight: 26,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  boardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  boardStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  boardTitle: {
    color: "#334563",
    fontSize: 11,
    fontWeight: "900",
  },
  boardCount: {
    minWidth: 20,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: "#FFFFFF",
    color: "#6366F1",
    fontSize: 9,
    fontWeight: "900",
    lineHeight: 18,
    textAlign: "center",
  },
  boardAddButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  taskList: {
    gap: 12,
  },
  emptyCard: {
    minHeight: 120,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#DCE5EF",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },
  emptyTitle: {
    color: "#8FA2BE",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  emptySubtitle: {
    color: "#B4C1D3",
    fontSize: 10,
    marginTop: 5,
  },
  taskCard: {
    padding: 15,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  draggingCard: {
    zIndex: 1000,
    elevation: 20,
    boxShadow: [{
      offsetX: 0,
      offsetY: 12,
      blurRadius: 18,
      color: "rgba(15,23,42,0.25)",
    }],
    opacity: 0.97,
  },
  taskCardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  taskActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  priorityDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  taskTitle: {
    flex: 1,
    color: "#1E2C45",
    fontSize: 14,
    fontWeight: "800",
  },
  taskDescription: {
    color: "#8292AA",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
  taskDetailsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12,
  },
  detailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    maxWidth: "100%",
  },
  detailText: {
    color: "#8292AA",
    fontSize: 10,
    fontWeight: "700",
  },
  healthBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 10,
  },
  healthDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  healthText: {
    fontSize: 9,
    fontWeight: "900",
  },
  subtaskSection: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#EEF2F6",
  },
  subtaskHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 7,
  },
  subtaskLabel: {
    color: "#71839F",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  subtaskCount: {
    color: "#8FA2BE",
    fontSize: 9,
    fontWeight: "800",
  },
  subtaskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  subtaskText: {
    flex: 1,
    color: "#566985",
    fontSize: 11,
  },
  completedSubtask: {
    color: "#94A3B8",
    textDecorationLine: "line-through",
  },
  addSubtaskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 3,
  },
  subtaskInput: {
    flex: 1,
    height: 32,
    paddingHorizontal: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    color: "#1E2C45",
    fontSize: 10,
  },
  subtaskEditInput: {
    flex: 1,
    height: 32,
    paddingHorizontal: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#6366F1",
    backgroundColor: "#FFFFFF",
    color: "#1E2C45",
    fontSize: 10,
  },
  subtaskEditBtn: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  addSubtaskButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  taskMetaRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  taskStatus: {
    color: "#64748B",
    fontSize: 9,
    fontWeight: "900",
  },
  taskPriority: {
    color: "#64748B",
    fontSize: 9,
    fontWeight: "900",
  },

  /* NEW MODAL STYLES (REPLACES OLD MODAL RULES) */
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(30, 41, 59, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxHeight: "90%",
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#1E293B",
    letterSpacing: 0.5,
  },
  taskIdRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  taskIdDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#5B46F6",
  },
  taskIdText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#5B46F6",
  },
  formScrollView: {
    flexGrow: 0,
  },
  formScrollContent: {
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  formLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#8F9BB3",
    letterSpacing: 0.8,
    marginTop: 14,
    marginBottom: 8,
  },
  formInput: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: "#1E293B",
  },
  descriptionInput: {
    height: 90,
  },
  choiceRow: {
    flexDirection: "row",
    gap: 8,
  },
  statusChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
  },
  statusChipTextSelected: {
    color: "#FFFFFF",
  },
  priorityChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  priorityChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
  },
  rowInputs: {
    flexDirection: "row",
    gap: 12,
  },
  rowInputFlex: {
    flex: 1,
  },
  formSelect: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  formSelectText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E293B",
  },
  formMenu: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#DCE5EF",
    backgroundColor: "#FFFFFF",
    marginTop: 5,
    overflow: "hidden",
  },
  formMenuOption: {
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  formMenuText: {
    color: "#566985",
    fontSize: 12,
    fontWeight: "700",
  },
  datePicker: {
    marginTop: 5,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#DCE5EF",
    backgroundColor: "#FFFFFF",
  },
  datePickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  datePickerTitle: {
    color: "#1E2C45",
    fontSize: 12,
    fontWeight: "900",
  },
  weekdayRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 5,
  },
  weekdayText: {
    width: "14.28%",
    textAlign: "center",
    color: "#8FA2BE",
    fontSize: 10,
    fontWeight: "800",
  },
  dateGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dateCell: {
    width: "14.28%",
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  selectedDateCell: {
    backgroundColor: "#4B3AF5",
  },
  dateCellText: {
    color: "#566985",
    fontSize: 11,
  },
  selectedDateText: {
    color: "#FFFFFF",
    fontWeight: "900",
  },
  subtasksContainer: {
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  subtasksLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  subtasksTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: "#5B46F6",
    letterSpacing: 0.8,
  },
  addSubtaskContainer: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  subtaskFormInput: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 12,
    color: "#1E293B",
  },
  addSubtaskBtn: {
    backgroundColor: "#F1F0FE",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  addSubtaskBtnText: {
    color: "#5B46F6",
    fontWeight: "700",
    fontSize: 12,
  },
  noSubtasksText: {
    fontSize: 11,
    fontStyle: "italic",
    color: "#94A3B8",
    marginTop: 12,
  },
  subtaskItemRow: {
    marginTop: 6,
  },
  subtaskItemText: {
    fontSize: 12,
    color: "#475569",
  },
  modalSubtaskRowInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  modalSubtaskEditRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  modalSubtaskEditBtn: {
    padding: 6,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  modalFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    paddingHorizontal: 24,
    paddingVertical: 18,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    backgroundColor: "#FFFFFF",
  },
  cancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  cancelButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
  },
  saveButton: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#9B8DF9",
  },
  disabledButton: {
    opacity: 0.55,
  },
  saveButtonText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
});
