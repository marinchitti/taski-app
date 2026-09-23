import { Ionicons } from "../components/icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import {
    ActivityIndicator,
    Alert,
    Image,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { supabase } from "../config/supabaseConfig";
import { useAuth } from "../context/auth";
import { useGroup } from "../context/group";
import {
    createTeam,
    deleteTeam,
    getOwnedTeams,
} from "../lib/teams";
import type { TeamRecord as OwnedTeam } from "../lib/teams";

export default function ProfileScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { activeGroup } = useGroup();
  const displayName = user?.user_metadata?.displayName as string | undefined;
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;
  const userInitial = (displayName?.trim() || user?.email || "U")
    .charAt(0)
    .toUpperCase();

  const [ownedTeams, setOwnedTeams] = useState<OwnedTeam[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [teamNameInput, setTeamNameInput] = useState("");
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [createTeamError, setCreateTeamError] = useState<string | null>(null);
  const [deletingTeamId, setDeletingTeamId] = useState<string | null>(null);

  // Load the teams the current user owns.
  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;

    getOwnedTeams(user.id)
      .then((teams) => {
        if (!cancelled) setOwnedTeams(teams);
      })
      .catch(() => {
        if (!cancelled) setOwnedTeams([]);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleCreateTeam = async () => {
    const name = teamNameInput.trim();
    if (!name || !user?.id) return;

    setIsCreatingTeam(true);
    setCreateTeamError(null);

    try {
      const team = await createTeam(user.id, name);

      // Persist the active team on the user so the Team tab can show it.
      const { error: metadataError } = await supabase.auth.updateUser({
        data: {
          teamId: team.id,
          teamName: team.name,
          teamInviteCode: team.inviteCode,
        },
      });
      if (metadataError) throw metadataError;

      setOwnedTeams((prev) => [
        team,
        ...prev.filter((t) => t.id !== team.id),
      ]);
      setIsCreateModalOpen(false);
      setTeamNameInput("");
    } catch (err) {
      setCreateTeamError(
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: unknown }).message)
          : "Failed to create team. Please try again.",
      );
    } finally {
      setIsCreatingTeam(false);
    }
  };

  const handleDeleteTeam = (team: OwnedTeam) => {
    Alert.alert(
      "Delete team?",
      `"${team.name}" will be removed for everyone on the team.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (!user?.id) return;
            setDeletingTeamId(team.id);
            try {
              await deleteTeam(team.id);
              setOwnedTeams((prev) => prev.filter((t) => t.id !== team.id));
            } catch (err) {
              Alert.alert(
                "Delete failed",
                err instanceof Error
                  ? err.message
                  : "Could not delete this team. Please try again.",
              );
            } finally {
              setDeletingTeamId(null);
            }
          },
        },
      ],
    );
  };

  const handleClose = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with Title and Close Button */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.screenTitle}>Profile</Text>
          <Text style={styles.screenSubtitle}>
            Your account and activity overview
          </Text>
        </View>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel="Close profile"
        >
          <Ionicons name="close" size={20} color="#64748B" />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >

          {/* Active Group Chip */}
          <Text style={styles.activeGroupLabel}>ACTIVE GROUP</Text>
          <View style={styles.activeGroupRow}>
            <TouchableOpacity
              style={styles.activeGroupChip}
              onPress={() => router.push("/(tabs)/team")}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Switch active group: ${activeGroup?.name ?? "No group yet"}`}
            >
              <View style={styles.activeGroupChipLeft}>
                <View style={styles.activeGroupAvatar}>
                  <Text style={styles.activeGroupAvatarText}>
                    {activeGroup?.name.charAt(0).toUpperCase() ?? "G"}
                  </Text>
                </View>
                <Text style={styles.activeGroupChipLabel} numberOfLines={1}>
                  {activeGroup?.name ?? "No group yet"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
            </TouchableOpacity>
          </View>

        {/* Main User Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarContainer}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarText}>{userInitial}</Text>
            )}
          </View>
          <View style={styles.profileDetails}>
            <Text style={styles.userName}>
              {displayName?.toUpperCase() || "CHITTI MARIN"}
            </Text>
            <View style={styles.emailRow}>
              <Ionicons name="mail-outline" size={12} color="#64748B" />
              <Text style={styles.userEmail}>
                {user?.email || "marinchitti@gmail.com"}
              </Text>
            </View>
            <View style={styles.ownerBadge}>
              <Ionicons name="shield-checkmark" size={10} color="#FBBF24" />
              <Text style={styles.ownerBadgeText}>OWNER</Text>
            </View>
          </View>
        </View>

        {/* Your Stats Header */}
        <Text style={styles.sectionHeader}>YOUR STATS</Text>

        {/* Task Proficiency Bar Card */}
        <View style={styles.proficiencyCard}>
          <View style={styles.proficiencyHeader}>
            <Text style={styles.statSubLabel}>TASK PROFICIENCY</Text>
            <Text style={styles.proficiencyPercentage}>0%</Text>
          </View>
          <View style={styles.progressBarTrack}>
            <View style={[styles.progressBarFill, { width: "0%" }]} />
          </View>
        </View>

        {/* 2x2 Grid of Stat Cards */}
        <View style={styles.gridContainer}>
          <View style={styles.gridCard}>
            <Text style={styles.statSubLabel}>TASKS</Text>
            <Text style={styles.statNumber}>0</Text>
          </View>

          <View style={styles.gridCard}>
            <Text style={styles.statSubLabel}>COMPLETED</Text>
            <Text style={styles.statNumber}>0</Text>
            <Text style={styles.positiveBadge}>↑ 0%</Text>
          </View>

          <View style={styles.gridCard}>
            <Text style={styles.statSubLabel}>ACTIVE</Text>
            <Text style={styles.statNumber}>0</Text>
          </View>

          <View style={styles.gridCard}>
            <Text style={styles.statSubLabel}>OVERDUE</Text>
            <Text style={styles.statNumber}>0</Text>
            <Text style={styles.onTrackText}>On track</Text>
          </View>
        </View>

        {/* My Owned Teams Header */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeader}>MY OWNED TEAMS</Text>
          <TouchableOpacity
            style={styles.newTeamBtn}
            onPress={() => setIsCreateModalOpen(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.newTeamBtnText}>+ NEW TEAM</Text>
          </TouchableOpacity>
        </View>

        {/* Owned Team Items */}
        {ownedTeams.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyCardText}>No teams yet</Text>
          </View>
        ) : (
          ownedTeams.map((team) => (
            <View style={styles.teamCard} key={team.id}>
              <View style={styles.teamInfo}>
                <View style={styles.teamAvatar}>
                  <Text style={styles.teamAvatarText}>
                    {team.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View>
                  <Text style={styles.teamName}>{team.name}</Text>
                  <Text style={styles.teamCode}>CODE: {team.inviteCode}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.deleteTeamBtn}
                onPress={() => handleDeleteTeam(team)}
                disabled={deletingTeamId === team.id}
              >
                {deletingTeamId === team.id ? (
                  <ActivityIndicator size="small" color="#CBD5E1" />
                ) : (
                  <Ionicons name="trash-outline" size={16} color="#CBD5E1" />
                )}
              </TouchableOpacity>
            </View>
          ))
        )}

        {/* Recent Assignments Header */}
        <Text style={styles.recentAssignmentsTitle}>Recent Assignments</Text>

        {/* Empty Assignments Card */}
        <View style={styles.emptyCard}>
          <Text style={styles.emptyCardText}>No tasks assigned</Text>
        </View>
      </ScrollView>

      {/* Create New Team Modal */}
      <Modal
        visible={isCreateModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsCreateModalOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsCreateModalOpen(false)}
        >
          <TouchableOpacity style={styles.createSheet} activeOpacity={1}>
            <View style={styles.sheetHandle} />

            <View style={styles.createSheetHeader}>
              <View>
                <Text style={styles.createSheetTitle}>Create New Team</Text>
                <Text style={styles.createSheetSubtitle}>
                  Set up a workspace to collaborate with others
                </Text>
              </View>
              <TouchableOpacity
                style={styles.closeSheetBtn}
                onPress={() => setIsCreateModalOpen(false)}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>TEAM NAME</Text>
            <TextInput
              style={styles.createTeamInput}
              placeholder="e.g. Design Team"
              placeholderTextColor="#94A3B8"
              value={teamNameInput}
              onChangeText={setTeamNameInput}
              autoFocus
              maxLength={40}
              returnKeyType="done"
              onSubmitEditing={handleCreateTeam}
            />

            {createTeamError && (
              <View style={styles.createErrorBox}>
                <Ionicons name="alert-circle" size={16} color="#E11D48" />
                <Text style={styles.createErrorText}>{createTeamError}</Text>
              </View>
            )}

            <View style={styles.createActions}>
              <TouchableOpacity
                style={styles.cancelTeamBtn}
                onPress={() => setIsCreateModalOpen(false)}
                disabled={isCreatingTeam}
              >
                <Text style={styles.cancelTeamBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.submitTeamBtn,
                  (!teamNameInput.trim() || isCreatingTeam) && { opacity: 0.5 },
                ]}
                onPress={handleCreateTeam}
                disabled={!teamNameInput.trim() || isCreatingTeam}
              >
                {isCreatingTeam ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitTeamBtnText}>Create Team</Text>
                )}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0F172A",
  },
  screenSubtitle: {
    fontSize: 12,
    color: "#94A3B8",
    fontWeight: "500",
    marginTop: 2,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  profileCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 24,
    boxShadow: [{
      offsetX: 0,
      offsetY: 2,
      blurRadius: 10,
      color: "rgba(0,0,0,0.04)",
    }],
    elevation: 2,
  },
  avatarContainer: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: "#FFD1E3",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 20,
  },
  avatarText: {
    color: "#FF007A",
    fontSize: 32,
    fontWeight: "800",
  },
  profileDetails: {
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  emailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  userEmail: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "500",
  },
  ownerBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0F172A",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: "flex-start",
    marginTop: 8,
    gap: 4,
  },
  ownerBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: "800",
    color: "#94A3B8",
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 12,
  },
  proficiencyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    boxShadow: [{
      offsetX: 0,
      offsetY: 2,
      blurRadius: 8,
      color: "rgba(0,0,0,0.03)",
    }],
    elevation: 1,
  },
  proficiencyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  statSubLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#94A3B8",
    letterSpacing: 0.5,
  },
  proficiencyPercentage: {
    fontSize: 12,
    fontWeight: "800",
    color: "#6366F1",
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: "#F1F5F9",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#6366F1",
  },
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 20,
  },
  gridCard: {
    width: "48%",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    boxShadow: [{
      offsetX: 0,
      offsetY: 2,
      blurRadius: 8,
      color: "rgba(0,0,0,0.03)",
    }],
    elevation: 1,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: "800",
    color: "#6366F1",
    marginTop: 8,
  },
  positiveBadge: {
    fontSize: 10,
    fontWeight: "700",
    color: "#22C55E",
    marginTop: 4,
  },
  onTrackText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#22C55E",
    marginTop: 4,
  },
  newTeamBtn: {
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  newTeamBtnText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#6366F1",
  },
  teamCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
    boxShadow: [{
      offsetX: 0,
      offsetY: 2,
      blurRadius: 8,
      color: "rgba(0,0,0,0.03)",
    }],
    elevation: 1,
  },
  teamInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  teamAvatar: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
  },
  teamAvatarText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#64748B",
  },
  teamName: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },
  teamCode: {
    fontSize: 9,
    fontWeight: "700",
    color: "#94A3B8",
    marginTop: 2,
  },
  deleteTeamBtn: {
    padding: 6,
  },
  recentAssignmentsTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 12,
  },
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    paddingVertical: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  emptyCardText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#94A3B8",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    justifyContent: "flex-end",
  },
  createSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 36,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E2E8F0",
    alignSelf: "center",
    marginBottom: 16,
  },
  createSheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  createSheetTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0F172A",
  },
  createSheetSubtitle: {
    fontSize: 11,
    fontWeight: "600",
    color: "#94A3B8",
    marginTop: 2,
  },
  closeSheetBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#475569",
    marginBottom: 8,
  },
  createTeamInput: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 13,
    fontWeight: "600",
    color: "#0F172A",
  },
  createErrorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFE4E6",
    borderWidth: 1,
    borderColor: "#FECDD3",
    padding: 12,
    borderRadius: 12,
    marginTop: 12,
  },
  createErrorText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    color: "#E11D48",
  },
  createActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  cancelTeamBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "#F1F5F9",
  },
  cancelTeamBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#475569",
  },
  submitTeamBtn: {
    flex: 2,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "#6366F1",
  },
  submitTeamBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  activeGroupLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#94A3B8",
    letterSpacing: 0.8,
    marginTop: 6,
    marginBottom: 6,
  },
  activeGroupRow: {
    gap: 10,
    marginBottom: 20,
  },
  activeGroupChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 10,
  },
  activeGroupChipLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  activeGroupAvatar: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#6366F1",
    justifyContent: "center",
    alignItems: "center",
  },
  activeGroupAvatarText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  activeGroupChipLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
  },
});
