import { Ionicons } from "../components/icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    Alert,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../context/auth";

const NOTIFICATIONS_KEY = "taski.notifications.enabled";
const TASK_UPDATES_KEY = "taski.taskUpdates.enabled";

export default function SettingsScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [taskUpdatesEnabled, setTaskUpdatesEnabled] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    const loadPreferences = async () => {
      const values = await AsyncStorage.multiGet([
        NOTIFICATIONS_KEY,
        TASK_UPDATES_KEY,
      ]);
      const storedNotifications = values[0][1];
      const storedTaskUpdates = values[1][1];
      if (storedNotifications !== null) {
        setNotificationsEnabled(storedNotifications === "true");
      }
      if (storedTaskUpdates !== null) {
        setTaskUpdatesEnabled(storedTaskUpdates === "true");
      }
    };

    void loadPreferences();
  }, []);

  const updatePreference = async (key: string, value: boolean) => {
    await AsyncStorage.setItem(key, String(value));
  };

  const completeSignOut = async () => {
    if (isSigningOut) return;

    setIsSigningOut(true);
    try {
      await signOut();
      router.replace("/(auth)/sign-in");
    } catch (error) {
      setIsSigningOut(false);
      Alert.alert(
        "Unable to sign out",
        error instanceof Error ? error.message : "Please try again.",
      );
    }
  };

  const handleSignOut = () => {
    if (isSigningOut) return;

    if (Platform.OS === "web") {
      const confirmed = globalThis.confirm(
        "Sign out? You will need to sign in again to access Taski.",
      );
      if (confirmed) void completeSignOut();
      return;
    }

    Alert.alert(
      "Sign out?",
      "You will need to sign in again to access Taski.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: () => void completeSignOut(),
        },
      ],
    );
  };

  const displayName =
    (user?.user_metadata?.displayName as string | undefined) ||
    user?.email?.split("@")[0] ||
    "Taski member";

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
        <View>
          <Text style={styles.headerTitle}>SETTINGS</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionLabel}>ACCOUNT</Text>
        <TouchableOpacity
          style={styles.accountRow}
          onPress={() => router.push("/profile")}
        >
          <View style={styles.accountIcon}>
            <Ionicons name="person-outline" size={20} color="#6366F1" />
          </View>
          <View style={styles.rowCopy}>
            <Text style={styles.rowTitle}>{displayName}</Text>
            <Text style={styles.rowSubtitle}>
              {user?.email || "Account profile"}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#A5B3C5" />
        </TouchableOpacity>

        <Text style={styles.sectionLabel}>PREFERENCES</Text>
        <View style={styles.settingsGroup}>
          <View style={styles.settingRow}>
            <View style={[styles.settingIcon, { backgroundColor: "#EEF2FF" }]}>
              <Ionicons
                name="notifications-outline"
                size={19}
                color="#6366F1"
              />
            </View>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>Notifications</Text>
              <Text style={styles.rowSubtitle}>
                Show task reminders and alerts
              </Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={(value) => {
                setNotificationsEnabled(value);
                void updatePreference(NOTIFICATIONS_KEY, value);
              }}
              trackColor={{ false: "#DCE5EF", true: "#A5B4FC" }}
              thumbColor={notificationsEnabled ? "#4F46E5" : "#FFFFFF"}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.settingRow}>
            <View style={[styles.settingIcon, { backgroundColor: "#ECFDF3" }]}>
              <Ionicons
                name="checkmark-circle-outline"
                size={19}
                color="#16A34A"
              />
            </View>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>Task updates</Text>
              <Text style={styles.rowSubtitle}>
                Show due dates and task health
              </Text>
            </View>
            <Switch
              value={taskUpdatesEnabled}
              onValueChange={(value) => {
                setTaskUpdatesEnabled(value);
                void updatePreference(TASK_UPDATES_KEY, value);
              }}
              trackColor={{ false: "#DCE5EF", true: "#86EFAC" }}
              thumbColor={taskUpdatesEnabled ? "#16A34A" : "#FFFFFF"}
            />
          </View>
        </View>

        <Text style={styles.sectionLabel}>QUICK ACCESS</Text>
        <View style={styles.settingsGroup}>
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => router.push("/notifications")}
          >
            <View style={[styles.settingIcon, { backgroundColor: "#FFF7ED" }]}>
              <Ionicons name="time-outline" size={19} color="#D97706" />
            </View>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>Notifications center</Text>
              <Text style={styles.rowSubtitle}>
                Review your latest task alerts
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#A5B3C5" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.signOutButton, isSigningOut && styles.disabledButton]}
          onPress={handleSignOut}
          disabled={isSigningOut}
        >
          <Ionicons
            name={isSigningOut ? "hourglass-outline" : "log-out-outline"}
            size={19}
            color="#E11D48"
          />
          <Text style={styles.signOutText}>
            {isSigningOut ? "Signing out..." : "Sign out"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
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
  headerTitle: { color: "#FFFFFF", fontSize: 23, fontWeight: "900" },
  headerSubtitle: {
    color: "#9BA8BE",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
    marginTop: 3,
  },
  content: { padding: 20, paddingBottom: 44, gap: 12 },
  sectionLabel: {
    color: "#8292AA",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.6,
    marginTop: 12,
    marginBottom: 2,
  },
  accountRow: {
    minHeight: 76,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E6ECF4",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  accountIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  settingsGroup: {
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E6ECF4",
  },
  settingRow: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  settingIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  rowCopy: { flex: 1, gap: 4 },
  rowTitle: { color: "#1E2C45", fontSize: 13, fontWeight: "900" },
  rowSubtitle: { color: "#8292AA", fontSize: 10 },
  divider: { height: 1, backgroundColor: "#EEF2F6" },
  signOutButton: {
    minHeight: 50,
    marginTop: 18,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#FECDD3",
    backgroundColor: "#FFF1F2",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  signOutText: { color: "#E11D48", fontSize: 13, fontWeight: "900" },
  disabledButton: { opacity: 0.55 },
});
