import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { useGroup } from "../context/group";
import type { UserTeam } from "../lib/teams";
import { Ionicons } from "./icons";

type Props = {
  /**
   * Extra styling for the trigger. It sits on the dark tab headers by default,
   * so it keeps a translucent white look; spacing above it is built in.
   */
  style?: StyleProp<ViewStyle>;
};

/**
 * Dropdown used at the top of every tab to pick which group (team) the user is
 * working in. All five tab screens render it in the same spot and it is driven
 * by the shared `GroupProvider`, so switching from one tab updates them all.
 */
export function GroupSwitcher({ style }: Props) {
  const router = useRouter();
  const {
    groups,
    activeGroup,
    isLoading,
    switchingGroupId,
    switchGroup,
    refreshGroups,
  } = useGroup();

  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label =
    activeGroup?.name ?? (isLoading ? "Loading groups..." : "No group yet");

  const openSheet = () => {
    setError(null);
    setIsOpen(true);
    // Always show a fresh list (groups may have been created/joined elsewhere).
    void refreshGroups();
  };

  const closeSheet = () => {
    setIsOpen(false);
    setError(null);
  };

  const handleSelect = async (group: UserTeam) => {
    if (group.id === activeGroup?.id) {
      closeSheet();
      return;
    }

    setError(null);
    try {
      await switchGroup(group);
      setIsOpen(false);
    } catch {
      setError("Could not switch group. Please try again.");
    }
  };

  const openTeamTab = () => {
    setIsOpen(false);
    router.push("/team");
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.trigger, style]}
        onPress={openSheet}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`Group: ${label}. Tap to switch group.`}
      >
        <View style={styles.triggerIconBg}>
          <Ionicons name="people" size={13} color="#FFFFFF" />
        </View>
        <View style={styles.triggerTextWrap}>
          <Text style={styles.triggerLabel}>GROUP</Text>
          <Text style={styles.triggerValue} numberOfLines={1}>
            {label}
          </Text>
        </View>
        <Ionicons name="chevron-down" size={16} color="#C7D2FE" />
      </TouchableOpacity>

      <Modal
        visible={isOpen}
        transparent
        animationType="fade"
        onRequestClose={closeSheet}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={closeSheet}
        >
          <TouchableOpacity style={styles.sheet} activeOpacity={1}>
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>Switch group</Text>
                <Text style={styles.sheetSubtitle}>
                  CHOOSE WHICH GROUP TO WORK IN
                </Text>
              </View>
              <TouchableOpacity
                style={styles.sheetCloseBtn}
                onPress={closeSheet}
                accessibilityRole="button"
                accessibilityLabel="Close group switcher"
              >
                <Ionicons name="close" size={16} color="#64748B" />
              </TouchableOpacity>
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            {isLoading && groups.length === 0 ? (
              <View style={styles.stateBox}>
                <ActivityIndicator size="small" color="#6366F1" />
                <Text style={styles.stateText}>LOADING GROUPS...</Text>
              </View>
            ) : groups.length === 0 ? (
              <View style={styles.stateBox}>
                <View style={styles.stateIconBg}>
                  <Ionicons name="people-outline" size={22} color="#6366F1" />
                </View>
                <Text style={styles.stateTitle}>NO GROUPS YET</Text>
                <Text style={styles.stateText}>
                  Create a group or join one with an invite code from the Team
                  tab.
                </Text>
                <TouchableOpacity
                  style={styles.stateAction}
                  onPress={openTeamTab}
                  activeOpacity={0.85}
                >
                  <Text style={styles.stateActionText}>OPEN TEAM TAB</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.groupList}>
                {groups.map((group) => (
                  <GroupRow
                    key={group.id}
                    group={group}
                    isActive={group.id === activeGroup?.id}
                    isSwitching={switchingGroupId === group.id}
                    onSelect={handleSelect}
                  />
                ))}
              </View>
            )}

            {groups.length > 0 ? (
              <TouchableOpacity
                style={styles.manageBtn}
                onPress={openTeamTab}
                activeOpacity={0.85}
              >
                <Ionicons name="settings-outline" size={14} color="#475569" />
                <Text style={styles.manageBtnText}>MANAGE GROUPS</Text>
              </TouchableOpacity>
            ) : null}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

type GroupRowProps = {
  group: UserTeam;
  isActive: boolean;
  isSwitching: boolean;
  onSelect: (group: UserTeam) => void;
};

function GroupRow({ group, isActive, isSwitching, onSelect }: GroupRowProps) {
  return (
    <TouchableOpacity
      style={[styles.groupRow, isActive && styles.groupRowActive]}
      onPress={() => onSelect(group)}
      disabled={isSwitching}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`Switch to ${group.name}`}
    >
      <View style={[styles.groupAvatar, isActive && styles.groupAvatarActive]}>
        <Text
          style={[
            styles.groupAvatarText,
            isActive && styles.groupAvatarTextActive,
          ]}
        >
          {group.name.charAt(0).toUpperCase()}
        </Text>
      </View>

      <View style={styles.groupInfo}>
        <Text style={styles.groupName} numberOfLines={1}>
          {group.name}
        </Text>
        <Text style={styles.groupCode}>CODE: {group.inviteCode}</Text>
      </View>

      {isSwitching ? (
        <ActivityIndicator size="small" color="#6366F1" />
      ) : (
        <View style={styles.groupRight}>
          <Text
            style={[
              styles.groupBadgeText,
              isActive && styles.groupBadgeTextActive,
            ]}
          >
            {isActive ? "ACTIVE" : (group.role || "Member").toUpperCase()}
          </Text>
          {isActive ? (
            <Ionicons name="checkmark-circle" size={16} color="#10B981" />
          ) : null}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // The trigger sits on a dark header in every tab. It stretches full-width
  // to match the search bar below it.
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    width: "100%",
    gap: 10,
    marginTop: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.18)",
  },
  triggerIconBg: {
    width: 22,
    height: 22,
    borderRadius: 7,
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  triggerTextWrap: { flex: 1, flexShrink: 1 },
  triggerLabel: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1,
  },
  triggerValue: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 1,
  },

  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 26,
    gap: 14,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  sheetSubtitle: {
    fontSize: 9,
    fontWeight: "800",
    color: "#94A3B8",
    marginTop: 2,
    letterSpacing: 1,
  },
  sheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: { fontSize: 11, fontWeight: "700", color: "#E11D48" },

  groupList: { gap: 10 },
  groupRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    backgroundColor: "#FFFFFF",
  },
  groupRowActive: {
    borderColor: "#C7D2FE",
    backgroundColor: "#EEF2FF",
  },
  groupAvatar: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  groupAvatarActive: { backgroundColor: "#6366F1" },
  groupAvatarText: { fontSize: 14, fontWeight: "900", color: "#64748B" },
  groupAvatarTextActive: { color: "#FFFFFF" },
  groupInfo: { flex: 1 },
  groupName: { fontSize: 14, fontWeight: "800", color: "#0F172A" },
  groupCode: {
    fontSize: 9,
    fontWeight: "700",
    color: "#94A3B8",
    marginTop: 2,
    letterSpacing: 0.5,
  },
  groupRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  groupBadgeText: {
    fontSize: 8,
    fontWeight: "900",
    color: "#94A3B8",
    letterSpacing: 0.8,
  },
  groupBadgeTextActive: { color: "#10B981" },

  stateBox: { alignItems: "center", gap: 8, paddingVertical: 22 },
  stateIconBg: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  stateTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: 0.5,
  },
  stateText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#94A3B8",
    textAlign: "center",
    lineHeight: 16,
  },
  stateAction: {
    marginTop: 6,
    backgroundColor: "#0F172A",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 14,
  },
  stateActionText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },

  manageBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "#F1F5F9",
  },
  manageBtnText: {
    fontSize: 10,
    fontWeight: "900",
    color: "#475569",
    letterSpacing: 1,
  },
});

