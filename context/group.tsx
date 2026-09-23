import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabase } from "../config/supabaseConfig";
import { getUserTeams, type UserTeam } from "../lib/teams";
import { useAuth } from "./auth";

/**
 * App-wide "active group" state. A group is a team the user belongs to (see
 * `lib/teams.ts`); the selected one is shared by every tab so the group switcher
 * shows the same value everywhere and switching from any tab updates the rest.
 */
type GroupContextType = {
  /** Every group the signed-in user belongs to. */
  groups: UserTeam[];
  /** Group currently selected in the switcher (null when the user has none). */
  activeGroup: UserTeam | null;
  /** True while the membership list is being fetched. */
  isLoading: boolean;
  /** Id of the group a switch is currently in flight for. */
  switchingGroupId: string | null;
  /** Makes `group` active in every tab and persists it on the account. */
  switchGroup: (group: UserTeam) => Promise<void>;
  /** Re-fetches the membership list (e.g. after creating or joining a group). */
  refreshGroups: () => Promise<void>;
};

const GroupContext = createContext<GroupContextType>({
  groups: [],
  activeGroup: null,
  isLoading: true,
  switchingGroupId: null,
  switchGroup: async () => {},
  refreshGroups: async () => {},
});

export function useGroup() {
  return useContext(GroupContext);
}

/**
 * Stores the active group on the account the same way the Team tab and the
 * profile screen do, so screens that read `user.user_metadata` directly (Team
 * tab "ACTIVE" badge, invite code card) stay in sync with the switcher.
 */
async function persistActiveGroup(group: UserTeam): Promise<void> {
  const { error } = await supabase.auth.updateUser({
    data: {
      teamId: group.id,
      teamName: group.name,
      teamInviteCode: group.inviteCode,
      role: group.role,
    },
  });

  if (error) throw error;
}

export function GroupProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const storedGroupId = user?.user_metadata?.teamId ?? null;

  const [groups, setGroups] = useState<UserTeam[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(
    storedGroupId,
  );
  const [switchingGroupId, setSwitchingGroupId] = useState<string | null>(null);
  // The account is reconciled with the resolved group once per signed-in user.
  const reconciledUserId = useRef<string | null>(null);
  // Reset selection when the signed-in user changes (including sign-out).
  // Adjusted during render (not in an effect) so the reset re-renders once
  // instead of cascading via useEffect -> setState.
  const [lastUserId, setLastUserId] = useState(userId);
  if (lastUserId !== userId) {
    setLastUserId(userId);
    setGroups([]);
    setSelectedGroupId(null);
    setIsLoading(true);
  }

  // Follow the stored group when it changes elsewhere (Team tab / profile).
  // Adjusted during render (not in an effect) so a stored-group change
  // re-renders once instead of cascading via useEffect -> setState.
  const [lastStoredGroupId, setLastStoredGroupId] = useState(storedGroupId);
  if (storedGroupId !== lastStoredGroupId) {
    setLastStoredGroupId(storedGroupId);
    if (storedGroupId) {
      setSelectedGroupId(storedGroupId);
    }
  }

  const fetchGroups = useCallback(async (id: string): Promise<UserTeam[]> => {
    try {
      return await getUserTeams(id);
    } catch (error) {
      console.error("Error loading groups:", error);
      return [];
    }
  }, []);

  // Keeps the selection valid whenever the list changes: keep the current group
  // if it is still a member, otherwise fall back to the first one.
  const applyGroups = useCallback((teams: UserTeam[]) => {
    setGroups(teams);
    setSelectedGroupId((previous) =>
      previous && teams.some((team) => team.id === previous)
        ? previous
        : (teams[0]?.id ?? null),
    );
  }, []);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    void fetchGroups(userId).then((teams) => {
      if (cancelled) return;
      applyGroups(teams);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [userId, fetchGroups, applyGroups]);

  const refreshGroups = useCallback(async () => {
    if (!userId) return;
    applyGroups(await fetchGroups(userId));
  }, [userId, fetchGroups, applyGroups]);

  const activeGroup = useMemo(
    () =>
      groups.find((group) => group.id === selectedGroupId) ?? groups[0] ?? null,
    [groups, selectedGroupId],
  );

  // Reset the once-per-user reconcile marker when the account changes
  // (no setState, so no cascading render).
  useEffect(() => {
    reconciledUserId.current = null;
  }, [userId, reconciledUserId]);

  // Accounts that joined/created a group before the switcher existed have no
  // group stored on them. Store the resolved one so every screen agrees.
  useEffect(() => {
    if (!userId || isLoading || !activeGroup) return;
    if (reconciledUserId.current === userId) return;
    reconciledUserId.current = userId;
    if (storedGroupId === activeGroup.id) return;

    void persistActiveGroup(activeGroup).catch((error) =>
      console.error("Error storing the active group:", error),
    );
  }, [userId, isLoading, activeGroup, storedGroupId]);

  const switchGroup = useCallback(
    async (group: UserTeam) => {
      if (group.id === activeGroup?.id) return;

      // Optimistic so every tab re-renders immediately.
      setSelectedGroupId(group.id);
      setSwitchingGroupId(group.id);

      try {
        await persistActiveGroup(group);
      } catch (error) {
        setSelectedGroupId(storedGroupId);
        throw error;
      } finally {
        setSwitchingGroupId(null);
      }
    },
    [activeGroup?.id, storedGroupId],
  );

  const value = useMemo(
    () => ({
      groups,
      activeGroup,
      isLoading,
      switchingGroupId,
      switchGroup,
      refreshGroups,
    }),
    [
      groups,
      activeGroup,
      isLoading,
      switchingGroupId,
      switchGroup,
      refreshGroups,
    ],
  );

  return (
    <GroupContext.Provider value={value}>{children}</GroupContext.Provider>
  );
}
