export const manageKeys = {
  rosterSettings: (leagueId: number) => ["manage", "roster-settings", leagueId] as const,
  all: ["manage"] as const,
  managed: () => [...manageKeys.all, "managed"] as const,
  leagues: () => [...manageKeys.all, "leagues"] as const,
  league: (leagueId: number, seasonId?: number | null) =>
    [...manageKeys.all, "league", leagueId, seasonId ?? null] as const,
  teams: (leagueId: number) => [...manageKeys.all, "teams", leagueId] as const,
  roster: (leagueId: number, seasonId: number) =>
    [...manageKeys.all, "roster", leagueId, seasonId] as const,
  venues: (leagueId: number) =>
    [...manageKeys.all, "venues", leagueId] as const,
};
