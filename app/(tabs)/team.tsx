import * as Clipboard from "expo-clipboard";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
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
import { Feather, Ionicons } from "../../components/icons";
import { supabase } from "../../config/supabaseConfig";
import { useAuth } from "../../context/auth";
import { useGroup } from "../../context/group";
import { loadTasks, subscribeToTasks, Task } from "../../lib/tasks";
import type { TeamMemberProfile, UserTeam } from "../../lib/teams";
import {
  createTeam as createTeamRecord,
  getTeamMembers,
  getUserTeams,
  joinTeamByCode,
} from "../../lib/teams";

const ROLES = { MEMBER: "Member", ADMIN: "Admin" };
type TeamUser = {
  email?: string;
  teamId?: string;
  teamName?: string;
  teamInviteCode?: string;
  role?: string;
};
type TeamMember = {
  id: string;
  name: string;
  role: string;
  status: string;
  uid?: string;
  photoURL?: string;
  avatar?: string;
};
type Invitation = { id: string; email: string; role: string };
type TeamRecord = { id: string; name: string; inviteCode: string };

const createInvitation = async (email: string, role: string) => ({
  token: `${email}-${role}-${Date.now()}`,
});

const cancelInvitation = async (_id: string, _email: string) => undefined;

const teamService = {
  joinTeam: (userId: string, code: string): Promise<TeamRecord> =>
    joinTeamByCode(userId, code),
  createTeam: (userId: string, name: string): Promise<TeamRecord> =>
    createTeamRecord(userId, name),
};

export default function TeamView() {
  const { user: authUser } = useAuth();
  const { activeGroup, switchGroup } = useGroup();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [initialModalTab, setInitialModalTab] = useState("invite"); // 'invite' | 'join' | 'create'
  const [pendingInvites, setPendingInvites] = useState<Invitation[]>([]);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [inviteToCancel, setInviteToCancel] = useState<Invitation | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [userTeams, setUserTeams] = useState<UserTeam[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [switchingTeamId, setSwitchingTeamId] = useState<string | null>(null);
  const [teamMembersByTeamId, setTeamMembersByTeamId] = useState<
    Record<string, TeamMemberProfile[]>
  >({});
  const [loadingTeamMembers, setLoadingTeamMembers] = useState(false);
  const [teamMembersError, setTeamMembersError] = useState<string | null>(null);
  const user: TeamUser = {
    ...(authUser?.user_metadata ?? {}),
    email: authUser?.email ?? undefined,
  };
  // The group picked in the switcher is the active one; the account metadata is
  // only a fallback for the brief moment before the group list has loaded.
  const activeTeamId = activeGroup?.id ?? user.teamId ?? null;
  // Members of the active team live only in the Members section below. Profiles
  // come from the team directory; task assignees fill in when a directory row
  // has no profile yet.
  const activeMembers: TeamMemberProfile[] = activeTeamId
    ? (teamMembersByTeamId[activeTeamId] ?? [])
    : [];
  const activeTeamDirectoryLoaded =
    activeTeamId ? teamMembersByTeamId.hasOwnProperty(activeTeamId) : false;
  const directoryNames = new Set(
    activeMembers.map((member) => member.displayName),
  );
  const teamMembers: TeamMember[] = [
    ...activeMembers.map((member) => ({
      id: member.userId,
      name: member.displayName,
      role: member.role,
      status: member.status,
      avatar: member.avatarUrl ?? undefined,
    })),
    ...(activeTeamDirectoryLoaded
      ? Array.from(
          new Set(tasks.map((task) => task.assignee).filter(Boolean)),
        )
            .filter((name) => !directoryNames.has(name))
            .map((name) => ({
              id: name,
              name,
              role: "Member",
              status: "offline",
            }))
      : []),
  ];

  // Fetches the members of every team the user belongs to so the Members section
  // below can list the active group's members. A team whose members cannot be
  // resolved keeps an empty list instead of hiding the whole section.
  const loadTeamMembers = React.useCallback(
    async (teams: UserTeam[], isActive: () => boolean = () => true) => {
      if (teams.length === 0) {
        if (!isActive()) return;
        setTeamMembersByTeamId({});
        setTeamMembersError(null);
        return;
      }

      setLoadingTeamMembers(true);

      let failed = false;
      const entries = await Promise.all(
        teams.map(async (team) => {
          try {
            return [team.id, await getTeamMembers(team.id)] as const;
          } catch (err) {
            failed = true;
            console.error("Error loading team members:", err);
            return [team.id, [] as TeamMemberProfile[]] as const;
          }
        }),
      );

      if (!isActive()) return;

      setTeamMembersByTeamId(Object.fromEntries(entries));
      setTeamMembersError(
        failed
          ? "Some member lists could not be loaded. Apply the latest supabase/schema.sql so team_member_directory exists."
          : null,
      );
      setLoadingTeamMembers(false);
    },
    [],
  );

  // Reset local task state without cascading renders when the user signs out.
  if (!authUser && tasks.length > 0) {
    setTasks([]);
  }

  // Reset local team state without cascading renders when the user signs out.
  if (!authUser && (userTeams.length > 0 || !loadingTeams)) {
    setUserTeams([]);
    setLoadingTeams(true);
  }

  // Reset the per-team member directory when the user signs out.
  if (!authUser && Object.keys(teamMembersByTeamId).length > 0) {
    setTeamMembersByTeamId({});
  }

  React.useEffect(() => {
    if (!authUser) return;

    const refreshTasks = async () => {
      const { data, error } = await loadTasks(authUser.id);
      if (!error) setTasks(data);
    };

    void refreshTasks();
    return subscribeToTasks(authUser.id, activeTeamId ?? undefined, () =>
      void refreshTasks(),
    );
  }, [activeTeamId, authUser]);

  // Load every team the user belongs to so the tab can list them all.
  React.useEffect(() => {
    if (!authUser) return;

    let cancelled = false;

    getUserTeams(authUser.id)
      .then(async (teams) => {
        if (cancelled) return;
        setUserTeams(teams);
        await loadTeamMembers(teams, () => !cancelled);
        if (!cancelled) setLoadingTeams(false);
      })
      .catch(() => {
        if (!cancelled) {
          setUserTeams([]);
          setLoadingTeams(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authUser, activeTeamId, loadTeamMembers]);

  const confirmAndExecuteCancel = async () => {
    if (!inviteToCancel) return;
    const { id, email } = inviteToCancel;
    setCancelingId(id);

    // Optimistic UI update
    setPendingInvites((prev) => prev.filter((inv) => inv.id !== id));

    try {
      await cancelInvitation(id, email);
      showToast(`Invitation for ${email || "user"} has been cancelled.`);
    } catch (err) {
      console.error("Error canceling invitation:", err);
      showToast("Failed to cancel invitation. Please try again.");
    } finally {
      setCancelingId(null);
      setInviteToCancel(null);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const refreshTeams = async () => {
    if (!authUser) return;
    try {
      const teams = await getUserTeams(authUser.id);
      setUserTeams(teams);
      // Teams created/joined from the modal need their member list too.
      await loadTeamMembers(teams);
    } catch {
      // Keep the current list on failure.
    }
  };

  const handleSwitchTeam = async (team: UserTeam) => {
    if (team.id === activeTeamId) return;
    setSwitchingTeamId(team.id);
    try {
      await switchGroup(team);
      showToast(`Switched to ${team.name}.`);
    } catch (err) {
      console.error("Error switching team:", err);
      showToast("Failed to switch team. Please try again.");
    } finally {
      setSwitchingTeamId(null);
    }
  };

  const openModalWithTab = (tab: string) => {
    setInitialModalTab(tab);
    setIsModalOpen(true);
  };

  const handleCopyCode = async () => {
    if (user?.teamInviteCode) {
      await Clipboard.setStringAsync(user.teamInviteCode);
      showToast("Invite code copied to clipboard!");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header Section */}
        <View style={styles.headerCard}>
          <View style={styles.headerTopRow}>
            <View style={styles.headerIconBg}>
              <Ionicons name="people" size={26} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>TEAM</Text>
              <Text style={styles.headerSubtitle}>
                {activeGroup?.name || user?.teamName || "Main Workspace"}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.addMemberBtn}
              onPress={() => openModalWithTab("invite")}
              activeOpacity={0.8}
            >
              <Feather name="user-plus" size={16} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <View style={{ height: 0 }} />
        </View>

        <View style={styles.bodySection}>
          {/* Your Teams Section - shows every team the user belongs to */}
          <View style={styles.teamsSection}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleWithDot}>
                <Feather name="users" size={12} color="#6366F1" />
                <Text style={styles.sectionTitle}>YOUR TEAMS</Text>
                {userTeams.length > 0 && (
                  <View style={styles.teamCountBadge}>
                    <Text style={styles.teamCountText}>{userTeams.length}</Text>
                  </View>
                )}
              </View>
              {userTeams.length > 0 && (
                <TouchableOpacity
                  style={styles.joinQuickBtn}
                  onPress={() => openModalWithTab("join")}
                  activeOpacity={0.8}
                >
                  <Feather name="plus" size={12} color="#6366F1" />
                  <Text style={styles.joinQuickBtnText}>JOIN</Text>
                </TouchableOpacity>
              )}
            </View>

            {loadingTeams ? (
              <View style={styles.teamsLoadingCard}>
                <ActivityIndicator size="small" color="#6366F1" />
                <Text style={styles.teamsLoadingText}>LOADING TEAMS...</Text>
              </View>
            ) : userTeams.length === 0 ? (
              <View style={styles.emptyMembersCard}>
                <Ionicons name="people-outline" size={32} color="#CBD5E1" />
                <Text style={styles.emptyMembersText}>
                  {"YOU'RE NOT IN ANY TEAM YET"}
                </Text>
                <View style={styles.emptyTeamActions}>
                  <TouchableOpacity
                    style={styles.inviteFirstBtn}
                    onPress={() => openModalWithTab("join")}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.inviteFirstBtnText}>
                      JOIN WITH CODE
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.createTeamOutlineBtn}
                    onPress={() => openModalWithTab("create")}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.createTeamOutlineBtnText}>
                      CREATE TEAM
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.teamsList}>
                {userTeams.map((team) => {
                  const isActive = team.id === activeTeamId;

                  return (
                    <View
                      key={team.id}
                      style={[
                        styles.teamRowCard,
                        isActive && styles.teamRowCardActive,
                      ]}
                    >
                      {/* Tapping the row makes this group the active team */}
                      <TouchableOpacity
                        style={styles.teamRowMain}
                        onPress={() => handleSwitchTeam(team)}
                        disabled={switchingTeamId === team.id}
                        activeOpacity={0.8}
                      >
                        <View
                          style={[
                            styles.teamAvatar,
                            isActive && styles.teamAvatarActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.teamAvatarText,
                              isActive && styles.teamAvatarActiveText,
                            ]}
                          >
                            {team.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>

                        <View style={styles.teamInfo}>
                          <Text style={styles.teamRowName} numberOfLines={1}>
                            {team.name}
                          </Text>
                          <Text style={styles.teamRowCode}>
                            CODE: {team.inviteCode}
                          </Text>
                        </View>

                        <View
                          style={[
                            styles.teamRight,
                            isActive ? styles.activeBadge : styles.roleBadge,
                          ]}
                        >
                          {switchingTeamId === team.id ? (
                            <ActivityIndicator size="small" color="#6366F1" />
                          ) : (
                            <>
                              <Ionicons
                                name={
                                  isActive
                                    ? "checkmark-circle"
                                    : "shield-checkmark"
                                }
                                size={10}
                                color={isActive ? "#10B981" : "#94A3B8"}
                              />
                              <Text
                                style={
                                  isActive
                                    ? styles.activeBadgeText
                                    : styles.roleBadgeText
                                }
                              >
                                {isActive
                                  ? "ACTIVE"
                                  : (team.role || "Member").toUpperCase()}
                              </Text>
                            </>
                          )}
                        </View>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}
            {teamMembersError ? (
              <Text style={styles.teamsErrorText}>{teamMembersError}</Text>
            ) : null}
          </View>

          {/* Workspace Code Card */}
          {user?.teamInviteCode && (
            <View style={styles.inviteCodeCard}>
              <View>
                <Text style={styles.codeCardLabel}>TEAM INVITE CODE</Text>
                <Text style={styles.codeCardValue}>{user.teamInviteCode}</Text>
              </View>
              <TouchableOpacity
                style={styles.copyCodeBtn}
                onPress={handleCopyCode}
                activeOpacity={0.8}
              >
                <Text style={styles.copyCodeBtnText}>Copy Code</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Members of the active team (moved out of the group cards above) */}
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionTitleWithDot}>
              <View style={styles.greenPulseDot} />
              <Text style={styles.sectionTitle}>
                MEMBERS{activeGroup?.name ? ` — ${activeGroup.name}` : ""}
              </Text>
            </View>
            <View style={styles.activeCountBadge}>
              <Text style={styles.activeCountText}>
                {teamMembers.filter((m) => m.status === "online").length} ACTIVE
                NOW
              </Text>
            </View>
          </View>

          <View style={styles.membersList}>
            {loadingTeamMembers && teamMembers.length === 0 ? (
              <View style={styles.emptyMembersCard}>
                <ActivityIndicator size="small" color="#6366F1" />
                <Text style={styles.emptyMembersText}>LOADING MEMBERS...</Text>
              </View>
            ) : teamMembers.length === 0 ? (
              <View style={styles.emptyMembersCard}>
                <Ionicons name="people-outline" size={32} color="#CBD5E1" />
                <Text style={styles.emptyMembersText}>NO TEAM MEMBERS YET</Text>
                <TouchableOpacity
                  style={styles.inviteFirstBtn}
                  onPress={() => openModalWithTab("invite")}
                >
                  <Text style={styles.inviteFirstBtnText}>
                    Invite First Member
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              teamMembers.map((member) => {
                const isOnline = member.status === "online";
                const isAway = member.status === "away";

                // Basic task count stats for progress bar representation
                const memberTasks = tasks.filter(
                  (t) => t.assignee === member.id,
                );
                const doneTasks = memberTasks.filter(
                  (t) => t.status === "Done",
                ).length;
                const totalTasks = memberTasks.length;
                const pct =
                  totalTasks > 0
                    ? Math.round((doneTasks / totalTasks) * 100)
                    : 0;

                return (
                  <View key={member.uid || member.id} style={styles.memberCard}>
                    <View style={styles.avatarWrapper}>
                      {member.photoURL ? (
                        <Image
                          source={{ uri: member.photoURL }}
                          style={styles.avatarImage}
                        />
                      ) : (
                        <View style={styles.avatarFallback}>
                          <Text style={styles.avatarText}>
                            {member.avatar ||
                              (member.name ? member.name[0] : "?")}
                          </Text>
                        </View>
                      )}
                      <View
                        style={[
                          styles.statusDotBorder,
                          {
                            backgroundColor: isOnline
                              ? "#10B981"
                              : isAway
                                ? "#F59E0B"
                                : "#CBD5E1",
                          },
                        ]}
                      />
                    </View>

                    <View style={styles.memberInfo}>
                      <View style={styles.memberNameRow}>
                        <Text style={styles.memberName} numberOfLines={1}>
                          {member.name}
                        </Text>
                        <View
                          style={[
                            styles.statusTag,
                            isOnline
                              ? styles.onlineTag
                              : isAway
                                ? styles.awayTag
                                : styles.offlineTag,
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusTagText,
                              isOnline
                                ? styles.onlineTagText
                                : isAway
                                  ? styles.awayTagText
                                  : styles.offlineTagText,
                            ]}
                          >
                            {isOnline ? "Active" : isAway ? "Away" : "Offline"}
                          </Text>
                        </View>
                      </View>

                      <Text style={styles.memberRole}>
                        {member.role || "Member"}
                      </Text>

                      {/* Custom Inline Progress Tracker */}
                      <View style={styles.progressContainer}>
                        <View style={styles.progressHeader}>
                          <Text style={styles.progressLabel}>Progress</Text>
                          <Text style={styles.progressValue}>
                            {doneTasks}/{totalTasks} ({pct}%)
                          </Text>
                        </View>
                        <View style={styles.progressTrack}>
                          <View
                            style={[styles.progressFill, { width: `${pct}%` }]}
                          />
                        </View>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>

          {/* Pending Invites Section */}
          {pendingInvites.length > 0 && (
            <View style={{ marginTop: 24 }}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionTitleWithDot}>
                  <Feather name="mail" size={12} color="#94A3B8" />
                  <Text style={styles.sectionTitle}>PENDING INVITES</Text>
                </View>
              </View>

              <View style={{ gap: 10, marginTop: 12 }}>
                {pendingInvites.map((invite) => (
                  <View key={invite.id} style={styles.inviteRowCard}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                        flex: 1,
                      }}
                    >
                      <View style={styles.mailIconBox}>
                        <Feather name="mail" size={16} color="#94A3B8" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.inviteEmail} numberOfLines={1}>
                          {invite.email}
                        </Text>
                        <Text style={styles.inviteRole}>{invite.role}</Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      style={styles.cancelInviteBtn}
                      onPress={() => setInviteToCancel(invite)}
                      disabled={cancelingId === invite.id}
                      activeOpacity={0.8}
                    >
                      {cancelingId === invite.id ? (
                        <ActivityIndicator size="small" color="#E11D48" />
                      ) : (
                        <>
                          <Ionicons name="close" size={14} color="#E11D48" />
                          <Text style={styles.cancelInviteBtnText}>Cancel</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* CONFIRMATION MODAL (CANCEL INVITE) */}
      <Modal
        visible={!!inviteToCancel}
        transparent
        animationType="fade"
        onRequestClose={() => setInviteToCancel(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setInviteToCancel(null)}
        >
          <TouchableOpacity style={styles.confirmModalBox} activeOpacity={1}>
            <View style={styles.alertIconBg}>
              <Ionicons name="alert-circle" size={24} color="#E11D48" />
            </View>

            <Text style={styles.confirmModalTitle}>Cancel Invitation?</Text>
            <Text style={styles.confirmModalText}>
              Are you sure you want to cancel the invitation sent to{" "}
              <Text style={{ fontWeight: "800", color: "#0F172A" }}>
                {inviteToCancel?.email}
              </Text>
              ? They will no longer be able to join your workspace using this
              link.
            </Text>

            <View style={styles.confirmModalActions}>
              <TouchableOpacity
                style={styles.keepBtn}
                onPress={() => setInviteToCancel(null)}
                disabled={cancelingId === inviteToCancel?.id}
              >
                <Text style={styles.keepBtnText}>Keep Invite</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.executeCancelBtn}
                onPress={confirmAndExecuteCancel}
                disabled={cancelingId === inviteToCancel?.id}
              >
                {cancelingId === inviteToCancel?.id ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.executeCancelBtnText}>Yes, Cancel</Text>
                )}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* TOAST NOTIFICATION */}
      {toastMessage && (
        <View style={styles.toastContainer}>
          <Ionicons name="checkmark-circle" size={16} color="#34D399" />
          <Text style={styles.toastText}>{toastMessage}</Text>
          <TouchableOpacity onPress={() => setToastMessage(null)}>
            <Ionicons name="close" size={14} color="#94A3B8" />
          </TouchableOpacity>
        </View>
      )}

      {/* TEAM MANAGE MODAL */}
      <Modal
        visible={isModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsModalOpen(false)}
      >
        <TeamManageModal
          initialTab={initialModalTab}
          user={user}
          userId={authUser?.id ?? ""}
          onClose={() => setIsModalOpen(false)}
          onUpdateUser={(updates) => {
            // Persist the active team on the user so the team screen reflects it.
            void supabase.auth
              .updateUser({
                data: {
                  teamId: updates.teamId,
                  teamName: updates.teamName,
                  teamInviteCode: updates.teamInviteCode,
                  role: updates.role,
                },
              })
              .then(() => {
                // Refresh the "Your Teams" list after joining/creating.
                void refreshTeams();
              });
          }}
          onSwitchTeam={() => undefined}
          showToast={showToast}
        />
      </Modal>
    </SafeAreaView>
  );
}

const TeamManageModal = ({
  initialTab = "invite",
  user: _user,
  userId,
  onClose,
  onUpdateUser,
  showToast,
}: {
  initialTab?: string;
  user: TeamUser;
  userId: string;
  onClose: () => void;
  onUpdateUser: (updates: Record<string, string>) => void;
  onSwitchTeam: () => void;
  showToast: (message: string) => void;
}) => {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(ROLES?.MEMBER || "Member");
  const [inviteCodeInput, setInviteCodeInput] = useState("");
  const [teamNameInput, setTeamNameInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteResult, setInviteResult] = useState<{ token: string } | null>(
    null,
  );

  const handleInvite = async () => {
    if (!email) return;
    setLoading(true);
    setError(null);
    try {
      const res = await createInvitation(email, role);
      setInviteResult(res);
    } catch (err) {
      console.error("Error creating invitation:", err);
      setError(
        "Failed to create invitation. Please check database permissions.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleJoinByCode = async () => {
    if (!inviteCodeInput.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const team = await teamService.joinTeam(userId, inviteCodeInput.trim());
      if (team) {
        if (onUpdateUser) {
          onUpdateUser({
            teamId: team.id,
            teamName: team.name,
            teamInviteCode: team.inviteCode,
            role: "Member",
          });
        }
        onClose();
      }
    } catch (err) {
      setError(
        err &&
          typeof err === "object" &&
          "message" in err &&
          (err as { message?: unknown }).message
          ? String((err as { message?: unknown }).message)
          : "Invalid invite code. Please verify and try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTeam = async () => {
    if (!teamNameInput.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const team = await teamService.createTeam(userId, teamNameInput.trim());
      if (team) {
        if (onUpdateUser) {
          onUpdateUser({
            teamId: team.id,
            teamName: team.name,
            teamInviteCode: team.inviteCode,
            role: "Owner",
          });
        }
        onClose();
      }
    } catch (err) {
      setError(
        err &&
          typeof err === "object" &&
          "message" in err &&
          (err as { message?: unknown }).message
          ? String((err as { message?: unknown }).message)
          : "Failed to create team. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    if (inviteResult?.token) {
      const link = `https://taski.app/join?token=${inviteResult.token}`;
      await Clipboard.setStringAsync(link);
      if (showToast) showToast("Invite link copied!");
    }
  };

  return (
    <TouchableOpacity
      style={styles.modalOverlay}
      activeOpacity={1}
      onPress={onClose}
    >
      <TouchableOpacity style={styles.sheetModalContent} activeOpacity={1}>
        <View style={styles.sheetHandle} />

        {/* Modal Header */}
        <View style={styles.sheetHeader}>
          <View>
            <Text style={styles.sheetTitle}>Team Operations</Text>
            <Text style={styles.sheetSubtitle}>
              Invite, join, or create workspace
            </Text>
          </View>
          <TouchableOpacity style={styles.closeSheetBtn} onPress={onClose}>
            <Ionicons name="close" size={18} color="#64748B" />
          </TouchableOpacity>
        </View>

        {/* Modal Navigation Tabs */}
        <View style={styles.modalTabsContainer}>
          <TouchableOpacity
            style={[
              styles.modalTabBtn,
              activeTab === "invite" && styles.modalTabActive,
            ]}
            onPress={() => {
              setActiveTab("invite");
              setError(null);
            }}
          >
            <Text
              style={[
                styles.modalTabText,
                activeTab === "invite" && styles.modalTabActiveText,
              ]}
            >
              Invite
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.modalTabBtn,
              activeTab === "join" && styles.modalTabActive,
            ]}
            onPress={() => {
              setActiveTab("join");
              setError(null);
            }}
          >
            <Text
              style={[
                styles.modalTabText,
                activeTab === "join" && styles.modalTabActiveText,
              ]}
            >
              Join Team
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.modalTabBtn,
              activeTab === "create" && styles.modalTabActive,
            ]}
            onPress={() => {
              setActiveTab("create");
              setError(null);
            }}
          >
            <Text
              style={[
                styles.modalTabText,
                activeTab === "create" && styles.modalTabActiveText,
              ]}
            >
              Create Team
            </Text>
          </TouchableOpacity>
        </View>

        {error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={16} color="#E11D48" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* TAB 1: INVITE */}
        {activeTab === "invite" &&
          (!inviteResult ? (
            <View style={{ gap: 16 }}>
              <View>
                <Text style={styles.inputLabel}>Member Email</Text>
                <View style={styles.inputWithIconWrapper}>
                  <Feather
                    name="mail"
                    size={16}
                    color="#94A3B8"
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.textInputWithIcon}
                    placeholder="colleague@company.com"
                    placeholderTextColor="#94A3B8"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
              </View>

              <View>
                <Text style={styles.inputLabel}>Role & Permissions</Text>
                <View style={{ gap: 8 }}>
                  {Object.values(
                    ROLES || { MEMBER: "Member", ADMIN: "Admin" },
                  ).map((r) => (
                    <TouchableOpacity
                      key={r}
                      style={[
                        styles.roleSelectBtn,
                        role === r && styles.roleSelectActive,
                      ]}
                      onPress={() => setRole(r)}
                      activeOpacity={0.8}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <Feather
                          name="shield"
                          size={16}
                          color={role === r ? "#6366F1" : "#94A3B8"}
                        />
                        <Text
                          style={[
                            styles.roleSelectText,
                            role === r && styles.roleSelectActiveText,
                          ]}
                        >
                          {r}
                        </Text>
                      </View>
                      {role === r && (
                        <Ionicons name="checkmark" size={18} color="#6366F1" />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <TouchableOpacity
                style={[
                  styles.primaryActionBtn,
                  (!email || loading) && { opacity: 0.5 },
                ]}
                onPress={handleInvite}
                disabled={!email || loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Feather name="mail" size={16} color="#FFFFFF" />
                    <Text style={styles.primaryActionBtnText}>SEND INVITE</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ gap: 16 }}>
              <View style={styles.successResultCard}>
                <View style={styles.successIconBadge}>
                  <Ionicons name="checkmark" size={24} color="#FFFFFF" />
                </View>
                <Text style={styles.successTitle}>Invite Generated</Text>
                <Text style={styles.successSubtitle}>
                  Share the link below with your teammate
                </Text>
              </View>

              <View>
                <Text style={styles.inputLabel}>Invitation Link</Text>
                <View style={styles.copyLinkRow}>
                  <Text style={styles.linkDisplay} numberOfLines={1}>
                    https://taski.app/join?token={inviteResult.token}
                  </Text>
                  <TouchableOpacity
                    style={styles.copyLinkBtn}
                    onPress={copyLink}
                  >
                    <Text style={styles.copyLinkBtnText}>Copy</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                style={styles.secondaryDoneBtn}
                onPress={onClose}
              >
                <Text style={styles.secondaryDoneBtnText}>DONE</Text>
              </TouchableOpacity>
            </View>
          ))}

        {/* TAB 2: JOIN TEAM */}
        {activeTab === "join" && (
          <View style={{ gap: 16 }}>
            <View>
              <Text style={styles.inputLabel}>Team Invite Code</Text>
              <TextInput
                style={styles.codeTextInput}
                placeholder="E.G. ABC123"
                placeholderTextColor="#94A3B8"
                value={inviteCodeInput}
                onChangeText={(val) => setInviteCodeInput(val.toUpperCase())}
                autoCapitalize="characters"
                maxLength={8}
              />
              <Text style={styles.fieldNoteText}>
                Ask your team admin for their workspace invite code.
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.primaryActionBtn,
                (!inviteCodeInput.trim() || loading) && { opacity: 0.5 },
              ]}
              onPress={handleJoinByCode}
              disabled={!inviteCodeInput.trim() || loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Feather name="log-in" size={16} color="#FFFFFF" />
                  <Text style={styles.primaryActionBtnText}>JOIN TEAM NOW</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* TAB 3: CREATE TEAM */}
        {activeTab === "create" && (
          <View style={{ gap: 16 }}>
            <View>
              <Text style={styles.inputLabel}>New Team Name</Text>
              <TextInput
                style={styles.standardTextInput}
                placeholder="e.g. Marketing Team, Product Design"
                placeholderTextColor="#94A3B8"
                value={teamNameInput}
                onChangeText={setTeamNameInput}
              />
              <Text style={styles.fieldNoteText}>
                Creating a team will generate a unique invite code so you can
                invite others anytime.
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.primaryActionBtn,
                (!teamNameInput.trim() || loading) && { opacity: 0.5 },
              ]}
              onPress={handleCreateTeam}
              disabled={!teamNameInput.trim() || loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Feather name="plus" size={16} color="#FFFFFF" />
                  <Text style={styles.primaryActionBtnText}>
                    CREATE TEAM WORKSPACE
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  scrollContent: {
    paddingBottom: 40,
  },
  headerCard: {
    backgroundColor: "#0F172A",
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 28,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  headerIconBg: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#AAB4C7",
    marginTop: 2,
  },
  addMemberBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "#6366F1",
    justifyContent: "center",
    alignItems: "center",
  },
  bodySection: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  teamsSection: {
    marginBottom: 20,
  },
  teamCountBadge: {
    minWidth: 18,
    paddingHorizontal: 6,
    backgroundColor: "#EEF2FF",
    borderRadius: 8,
    alignItems: "center",
  },
  teamCountText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#6366F1",
  },
  joinQuickBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  joinQuickBtnText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#6366F1",
  },
  teamsLoadingCard: {
    backgroundColor: "#FFFFFF",
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  teamsLoadingText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#94A3B8",
    letterSpacing: 0.8,
  },
  teamsErrorText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#D97706",
    marginTop: 8,
  },
  emptyTeamActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  createTeamOutlineBtn: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  createTeamOutlineBtnText: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "800",
  },
  teamsList: {
    gap: 10,
  },
  teamRowCard: {
    backgroundColor: "#FFFFFF",
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 10,
  },
  teamRowMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  teamRowCardActive: {
    borderColor: "#6366F1",
    backgroundColor: "#EEF2FF",
  },
  teamAvatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#EEF2FF",
    justifyContent: "center",
    alignItems: "center",
  },
  teamAvatarActive: {
    backgroundColor: "#6366F1",
  },
  teamAvatarText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#6366F1",
  },
  teamAvatarActiveText: {
    color: "#FFFFFF",
  },
  teamInfo: {
    flex: 1,
  },
  teamRowName: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0F172A",
  },
  teamRowCode: {
    fontSize: 9,
    fontWeight: "700",
    color: "#94A3B8",
    letterSpacing: 0.5,
    marginTop: 2,
  },
  teamRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  activeBadge: {
    backgroundColor: "#ECFDF5",
  },
  activeBadgeText: {
    fontSize: 8,
    fontWeight: "900",
    color: "#059669",
  },
  roleBadge: {
    backgroundColor: "#F1F5F9",
  },
  roleBadgeText: {
    fontSize: 8,
    fontWeight: "800",
    color: "#64748B",
  },
  inviteCodeCard: {
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  codeCardLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: "#94A3B8",
    letterSpacing: 0.5,
  },
  codeCardValue: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: 1.5,
    marginTop: 2,
  },
  copyCodeBtn: {
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  copyCodeBtnText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#6366F1",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitleWithDot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  greenPulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#10B981",
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: "#94A3B8",
    letterSpacing: 0.8,
  },
  activeCountBadge: {
    backgroundColor: "#E2E8F0",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  activeCountText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#64748B",
  },
  membersList: {
    gap: 10,
  },
  emptyMembersCard: {
    backgroundColor: "#FFFFFF",
    padding: 32,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
  },
  emptyMembersText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#94A3B8",
    letterSpacing: 0.8,
    marginTop: 8,
  },
  inviteFirstBtn: {
    marginTop: 14,
    backgroundColor: "#6366F1",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  inviteFirstBtnText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },
  memberCard: {
    backgroundColor: "#FFFFFF",
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatarWrapper: {
    position: "relative",
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: 12,
  },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  avatarText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#475569",
  },
  statusDotBorder: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  memberInfo: {
    flex: 1,
  },
  memberNameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  memberName: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0F172A",
    flex: 1,
  },
  statusTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusTagText: {
    fontSize: 8,
    fontWeight: "800",
  },
  onlineTag: { backgroundColor: "#ECFDF5" },
  onlineTagText: { color: "#059669" },
  awayTag: { backgroundColor: "#FEF3C7" },
  awayTagText: { color: "#D97706" },
  offlineTag: { backgroundColor: "#F1F5F9" },
  offlineTagText: { color: "#94A3B8" },
  memberRole: {
    fontSize: 10,
    fontWeight: "600",
    color: "#94A3B8",
    marginTop: 1,
  },
  progressContainer: {
    marginTop: 8,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  progressLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: "#94A3B8",
  },
  progressValue: {
    fontSize: 8,
    fontWeight: "800",
    color: "#64748B",
  },
  progressTrack: {
    height: 4,
    backgroundColor: "#F1F5F9",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#6366F1",
    borderRadius: 2,
  },
  inviteRowCard: {
    backgroundColor: "#FFFFFF",
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  mailIconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  inviteEmail: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0F172A",
  },
  inviteRole: {
    fontSize: 9,
    fontWeight: "800",
    color: "#6366F1",
    letterSpacing: 0.5,
    marginTop: 2,
  },
  cancelInviteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FFE4E6",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  cancelInviteBtnText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#E11D48",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    justifyContent: "flex-end",
  },
  confirmModalBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    padding: 24,
    margin: 20,
    alignItems: "center",
  },
  alertIconBg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#FFE4E6",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  confirmModalTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0F172A",
    marginBottom: 6,
  },
  confirmModalText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#64748B",
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 20,
  },
  confirmModalActions: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },
  keepBtn: {
    flex: 1,
    backgroundColor: "#F1F5F9",
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
  },
  keepBtnText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#475569",
  },
  executeCancelBtn: {
    flex: 1,
    backgroundColor: "#E11D48",
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
  },
  executeCancelBtnText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  toastContainer: {
    position: "absolute",
    bottom: 24,
    left: 20,
    right: 20,
    backgroundColor: "#0F172A",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    boxShadow: [{
      offsetX: 0,
      offsetY: 4,
      blurRadius: 10,
      color: "rgba(0,0,0,0.1)",
    }],
    elevation: 5,
  },
  toastText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  sheetModalContent: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    paddingTop: 12,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: "#E2E8F0",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0F172A",
  },
  sheetSubtitle: {
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
  modalTabsContainer: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    padding: 4,
    borderRadius: 14,
    marginBottom: 20,
  },
  modalTabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 10,
  },
  modalTabActive: {
    backgroundColor: "#FFFFFF",
  },
  modalTabText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#64748B",
  },
  modalTabActiveText: {
    color: "#0F172A",
  },
  errorBox: {
    backgroundColor: "#FFE4E6",
    borderWidth: 1,
    borderColor: "#FECDD3",
    padding: 12,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  errorText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    color: "#E11D48",
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#475569",
    marginBottom: 8,
  },
  inputWithIconWrapper: {
    position: "relative",
    justifyContent: "center",
  },
  inputIcon: {
    position: "absolute",
    left: 14,
    zIndex: 1,
  },
  textInputWithIcon: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingVertical: 12,
    paddingLeft: 42,
    paddingRight: 14,
    fontSize: 13,
    fontWeight: "600",
    color: "#0F172A",
  },
  roleSelectBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  roleSelectActive: {
    borderColor: "#6366F1",
    backgroundColor: "#EEF2FF",
  },
  roleSelectText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#475569",
  },
  roleSelectActiveText: {
    color: "#6366F1",
  },
  primaryActionBtn: {
    backgroundColor: "#0F172A",
    paddingVertical: 14,
    borderRadius: 14,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  primaryActionBtnText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  successResultCard: {
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    padding: 20,
    borderRadius: 20,
    alignItems: "center",
  },
  successIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#10B981",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  successTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#065F46",
  },
  successSubtitle: {
    fontSize: 10,
    fontWeight: "600",
    color: "#047857",
    marginTop: 2,
  },
  copyLinkRow: {
    flexDirection: "row",
    gap: 8,
  },
  linkDisplay: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 12,
    fontSize: 11,
    fontWeight: "600",
    color: "#64748B",
  },
  copyLinkBtn: {
    backgroundColor: "#0F172A",
    paddingHorizontal: 16,
    borderRadius: 12,
    justifyContent: "center",
  },
  copyLinkBtnText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },
  secondaryDoneBtn: {
    backgroundColor: "#F1F5F9",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  secondaryDoneBtnText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#475569",
  },
  codeTextInput: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingVertical: 14,
    fontSize: 18,
    fontWeight: "900",
    color: "#0F172A",
    textAlign: "center",
    letterSpacing: 2,
  },
  standardTextInput: {
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
  fieldNoteText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#94A3B8",
    marginTop: 6,
  },
});
