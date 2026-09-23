import { getUserTeams } from "./teams";

// Returns the name of the first team the current user belongs to, used by the
// home screen header. Because a user can belong to several teams this no longer
// relies on a single-row query (which used to throw and always fall back to
// "NO TEAM" for multi-team users) - it just reuses the full membership list.
export async function getUserTeam(userId: string): Promise<string> {
  try {
    const teams = await getUserTeams(userId);
    return teams[0]?.name || "NO TEAM";
  } catch {
    return "NO TEAM"; // Fallback placeholder
  }
}

