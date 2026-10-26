import { apiRequest } from "@/api/http-client";
import { isApiError } from "@/api/errors";
import type { LeagueRosterRow } from "./types";

export type CreateRosterPlayers = {
  teamId: number | null;
  names: string[];
  confirmDuplicates?: boolean;
  requestId: string;
};
export type RosterSettings = { requiresApproval: boolean };

export function isDuplicateNamesError(error: unknown) {
  return (
    isApiError(error) &&
    error.status === 409 &&
    error.body != null &&
    !Array.isArray(error.body) &&
    error.body.code === "DUPLICATE_NAMES"
  );
}

export async function createRosterPlayers(
  leagueId: number,
  seasonId: number,
  payload: CreateRosterPlayers,
) {
  return apiRequest<{ data: LeagueRosterRow[] }>(
    `/api/v1/roster/${leagueId}/${seasonId}/players`,
    {
      auth: true,
      method: "POST",
      jsonBody: payload,
    },
  );
}
export async function assignRosterPlayers(
  leagueId: number,
  seasonId: number,
  payload: { teamId: number; rosterIds: number[] },
) {
  return apiRequest(`/api/v1/roster/${leagueId}/${seasonId}/assign`, {
    auth: true,
    method: "POST",
    jsonBody: payload,
  });
}
export async function reviewRosterPlayer(
  leagueId: number,
  seasonId: number,
  id: number,
  status: "active" | "rejected",
) {
  return apiRequest(`/api/v1/roster/${leagueId}/${seasonId}/${id}`, {
    auth: true,
    method: "PATCH",
    jsonBody: { status },
  });
}
export async function fetchRosterSettings(leagueId: number) {
  return apiRequest<RosterSettings>(`/api/v1/roster/${leagueId}/settings`, {
    auth: true,
  });
}
export async function updateRosterSettings(
  leagueId: number,
  settings: RosterSettings,
) {
  return apiRequest<RosterSettings>(`/api/v1/roster/${leagueId}/settings`, {
    auth: true,
    method: "PATCH",
    jsonBody: settings,
  });
}
export async function createPlayerClaim(
  playerId: number,
  leagueId: number,
  seasonId: number,
) {
  return apiRequest<{ claimLink: string }>("/api/v1/player-claims", {
    auth: true,
    method: "POST",
    jsonBody: { playerId, leagueId, seasonId },
  });
}
