import type { ApiPlayerAward, ApiVenue } from "@/api/entities";
import { apiRequest } from "@/api/http-client";
import type { PickedImageFile } from "@/lib/picked-image";

import type { UpdateLeaguePlayerPayload } from "@/invite/types";

import type {
  CreateGamePayload,
  CreateSeasonPayload,
  CreateStatPayload,
  CreateVenuePayload,
  CreatedSeason,
  LeagueRosterRow,
  ManagedHub,
  ManagedTeam,
  OwnedLeague,
  RecordSubstitutionsPayload,
  RecordSubstitutionsResult,
  RecordTrackingEventsPayload,
  RecordTrackingEventsResult,
  UpdateGamePayload,
  UpdateLeaguePayload,
  UpdateSeasonPayload,
  UpdateStatPayload,
  UpdateVenuePayload,
} from "./types";

export type CreateTeamPayload = {
  name: string;
  logo?: PickedImageFile;
};

export type UpdateTeamPayload = {
  name?: string;
  logo?: PickedImageFile;
};

function appendImageFile(form: FormData, key: string, file: PickedImageFile) {
  form.append(key, {
    uri: file.uri,
    name: file.name,
    type: file.type,
  } as unknown as Blob);
}

function buildCreateTeamFormData(
  leagueId: number,
  payload: CreateTeamPayload,
): FormData {
  const form = new FormData();
  form.append("leagueId", String(leagueId));
  form.append("name", payload.name);
  if (payload.logo) {
    appendImageFile(form, "logo", payload.logo);
  }
  return form;
}

function buildUpdateTeamFormData(payload: UpdateTeamPayload): FormData {
  const form = new FormData();
  if (payload.name != null) {
    form.append("name", payload.name);
  }
  if (payload.logo) {
    appendImageFile(form, "logo", payload.logo);
  }
  return form;
}

export async function createTeam(
  leagueId: number,
  payload: CreateTeamPayload,
): Promise<void> {
  await apiRequest<{ message: string }>(`/api/v1/leagues/${leagueId}/teams`, {
    method: "POST",
    auth: true,
    idempotencyKey: true,
    jsonBody: payload.logo
      ? buildCreateTeamFormData(leagueId, payload)
      : { leagueId, name: payload.name },
  });
}

export async function updateTeam(
  leagueId: number,
  teamId: number,
  payload: UpdateTeamPayload,
): Promise<void> {
  await apiRequest<{ message: string }>(
    `/api/v1/leagues/${leagueId}/teams/${teamId}`,
    {
      method: "PUT",
      auth: true,
      idempotencyKey: true,
      jsonBody: payload.logo
        ? buildUpdateTeamFormData(payload)
        : payload,
    },
  );
}

export async function deleteTeam(leagueId: number, teamId: number): Promise<void> {
  await apiRequest<{ message: string }>(
    `/api/v1/leagues/${leagueId}/teams/${teamId}`,
    {
      method: "DELETE",
      auth: true,
      idempotencyKey: true,
    },
  );
}

export async function fetchManagedHub(): Promise<ManagedHub> {
  const res = await apiRequest<{ data: ManagedHub }>(
    "/api/v1/auth/users/managed",
    { auth: true },
  );
  return {
    ownedLeagues: res.data?.ownedLeagues ?? [],
    adminTeams: res.data?.adminTeams ?? [],
  };
}

/** @deprecated Prefer `fetchManagedHub` - kept for call sites that only need owned leagues. */
export async function fetchOwnedLeagues(): Promise<OwnedLeague[]> {
  const hub = await fetchManagedHub();
  return hub.ownedLeagues;
}

export async function fetchLeagueTeams(leagueId: number): Promise<ManagedTeam[]> {
  const res = await apiRequest<{ data: ManagedTeam[] }>(
    `/api/v1/auth/users/leagues/${leagueId}/teams`,
    { auth: true },
  );
  return (res.data ?? []).map((team) => ({
    ...team,
    admins: team.admins ?? [],
  }));
}

export async function assignTeamAdmin(
  leagueId: number,
  teamId: number,
  userId: number,
): Promise<void> {
  await apiRequest<{ message: string }>(
    `/api/v1/leagues/${leagueId}/teams/${teamId}/admins`,
    {
      method: "POST",
      auth: true,
      idempotencyKey: true,
      jsonBody: { userId },
    },
  );
}

export async function removeTeamAdmin(
  leagueId: number,
  teamId: number,
  userId: number,
): Promise<void> {
  await apiRequest<{ message: string }>(
    `/api/v1/leagues/${leagueId}/teams/${teamId}/admins/${userId}`,
    {
      method: "DELETE",
      auth: true,
      idempotencyKey: true,
    },
  );
}

export async function fetchSeasonRoster(
  leagueId: number,
  seasonId: number,
  teamId?: number,
): Promise<LeagueRosterRow[]> {
  const res = await apiRequest<{ data: LeagueRosterRow[] }>(
    `/api/v1/roster/${leagueId}/${seasonId}${teamId == null ? "" : `?teamId=${teamId}`}`,
    { auth: true },
  );
  return res.data;
}

export async function updateLeaguePlayer(
  leaguePlayerId: number,
  payload: UpdateLeaguePlayerPayload,
): Promise<void> {
  await apiRequest<{ message: string }>(
    `/api/v1/leagues/league-players/${leaguePlayerId}`,
    {
      method: "PUT",
      auth: true,
      idempotencyKey: true,
      jsonBody: payload,
    },
  );
}

export async function removeLeaguePlayer(leaguePlayerId: number): Promise<void> {
  await apiRequest<{ message: string }>(
    `/api/v1/leagues/league-players/${leaguePlayerId}`,
    {
      method: "DELETE",
      auth: true,
      idempotencyKey: true,
    },
  );
}

export async function createGame(payload: CreateGamePayload): Promise<void> {
  await apiRequest<{ message: string }>("/api/v1/leagues/games", {
    method: "POST",
    auth: true,
    idempotencyKey: true,
    jsonBody: payload,
  });
}

export async function updateGame(
  gameId: number,
  payload: UpdateGamePayload,
): Promise<void> {
  await apiRequest<{ message: string }>(`/api/v1/leagues/games/${gameId}`, {
    method: "PUT",
    auth: true,
    idempotencyKey: true,
    jsonBody: payload,
  });
}

export async function deleteGame(gameId: number): Promise<void> {
  await apiRequest<{ message: string }>(`/api/v1/leagues/games/${gameId}`, {
    method: "DELETE",
    auth: true,
    idempotencyKey: true,
  });
}

export async function fetchLeagueVenues(leagueId: number): Promise<ApiVenue[]> {
  return apiRequest<{ data: ApiVenue[] }>(
    `/api/v1/leagues/${leagueId}/venues`,
    { auth: true },
  ).then((r) => r.data);
}

export async function createVenue(
  leagueId: number,
  payload: CreateVenuePayload,
): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(
    `/api/v1/leagues/${leagueId}/venues`,
    {
      method: "POST",
      auth: true,
      idempotencyKey: true,
      jsonBody: payload,
    },
  );
}

export async function updateVenue(
  venueId: number,
  payload: UpdateVenuePayload,
): Promise<void> {
  await apiRequest<{ message: string }>(
    `/api/v1/leagues/venues/${venueId}`,
    {
      method: "PUT",
      auth: true,
      idempotencyKey: true,
      jsonBody: payload,
    },
  );
}

export async function deleteVenue(venueId: number): Promise<void> {
  await apiRequest<{ message: string }>(
    `/api/v1/leagues/venues/${venueId}`,
    {
      method: "DELETE",
      auth: true,
      idempotencyKey: true,
    },
  );
}

export async function createStat(payload: CreateStatPayload): Promise<void> {
  await apiRequest<{ message: string }>("/api/v1/leagues/stats", {
    method: "POST",
    auth: true,
    idempotencyKey: true,
    jsonBody: payload,
  });
}

export async function updateStat(
  statId: number,
  payload: UpdateStatPayload,
): Promise<void> {
  await apiRequest<{ message: string }>(`/api/v1/leagues/stats/${statId}`, {
    method: "PUT",
    auth: true,
    idempotencyKey: true,
    jsonBody: payload,
  });
}

export async function recordSubstitutions(
  payload: RecordSubstitutionsPayload,
): Promise<RecordSubstitutionsResult> {
  return apiRequest<RecordSubstitutionsResult>(
    "/api/v1/leagues/stats/substitutions",
    {
      method: "POST",
      auth: true,
      idempotencyKey: true,
      jsonBody: payload,
    },
  );
}

export async function recordTrackingEvents(
  gameId: number,
  payload: RecordTrackingEventsPayload,
): Promise<RecordTrackingEventsResult> {
  return apiRequest<RecordTrackingEventsResult>(
    `/api/v1/games/${gameId}/tracking-events`,
    {
      method: "POST",
      auth: true,
      idempotencyKey: true,
      jsonBody: payload,
    },
  );
}

export async function deleteStat(statId: number): Promise<void> {
  await apiRequest<{ message: string }>(`/api/v1/leagues/stats/${statId}`, {
    method: "DELETE",
    auth: true,
    idempotencyKey: true,
  });
}

export async function updateLeague(
  leagueId: number,
  payload: UpdateLeaguePayload,
): Promise<void> {
  await apiRequest<{ message: string }>(`/api/v1/leagues/${leagueId}`, {
    method: "PUT",
    auth: true,
    idempotencyKey: true,
    jsonBody: payload,
  });
}

export async function deleteLeague(
  leagueId: number,
  confirmationName: string,
): Promise<void> {
  await apiRequest<{ message: string }>(`/api/v1/leagues/${leagueId}`, {
    method: "DELETE",
    auth: true,
    idempotencyKey: true,
    jsonBody: { confirmationName },
  });
}

export async function softDeleteLeague(leagueId: number): Promise<void> {
  await apiRequest<{ message: string }>(
    `/api/v1/leagues/${leagueId}/soft-delete`,
    {
      method: "PATCH",
      auth: true,
      idempotencyKey: true,
    },
  );
}

export async function reactivateLeague(leagueId: number): Promise<void> {
  await apiRequest<{ message: string }>(
    `/api/v1/leagues/${leagueId}/reactivate`,
    {
      method: "PATCH",
      auth: true,
      idempotencyKey: true,
    },
  );
}

export async function createSeason(
  leagueId: number,
  payload: Omit<CreateSeasonPayload, "leagueId">,
): Promise<CreatedSeason> {
  return apiRequest<CreatedSeason>(`/api/v1/leagues/${leagueId}/seasons`, {
    method: "POST",
    auth: true,
    idempotencyKey: true,
    jsonBody: { ...payload, leagueId },
  });
}

export async function updateSeason(
  leagueId: number,
  seasonId: number,
  payload: UpdateSeasonPayload,
): Promise<void> {
  await apiRequest<{ message: string }>(
    `/api/v1/leagues/${leagueId}/seasons/${seasonId}`,
    {
      method: "PUT",
      auth: true,
      idempotencyKey: true,
      jsonBody: payload,
    },
  );
}

export async function startFirstHalf(gameId: number): Promise<void> {
  await apiRequest<{ message: string }>(
    `/api/v1/games/${gameId}/start-first-half`,
    { method: "POST", auth: true, idempotencyKey: true },
  );
}

export async function startHalfTime(gameId: number): Promise<void> {
  await apiRequest<{ message: string }>(`/api/v1/games/${gameId}/half-time`, {
    method: "POST",
    auth: true,
    idempotencyKey: true,
  });
}

export async function startSecondHalf(gameId: number): Promise<void> {
  await apiRequest<{ message: string }>(
    `/api/v1/games/${gameId}/start-second-half`,
    { method: "POST", auth: true, idempotencyKey: true },
  );
}

export async function startExtraTime(gameId: number): Promise<void> {
  await apiRequest<{ message: string }>(`/api/v1/games/${gameId}/extra-time`, {
    method: "POST",
    auth: true,
    idempotencyKey: true,
  });
}

export type FullTimePayload = {
  homeScore: number;
  awayScore: number;
};

export async function endGameFullTime(
  gameId: number,
  payload: FullTimePayload,
): Promise<void> {
  await apiRequest<{ message: string }>(`/api/v1/games/${gameId}/full-time`, {
    method: "POST",
    auth: true,
    idempotencyKey: true,
    jsonBody: payload,
  });
}

export async function pauseGame(gameId: number): Promise<void> {
  await apiRequest<{ message: string }>(`/api/v1/games/${gameId}/pause`, {
    method: "POST",
    auth: true,
    idempotencyKey: true,
  });
}

export async function resumeGame(gameId: number): Promise<void> {
  await apiRequest<{ message: string }>(`/api/v1/games/${gameId}/resume`, {
    method: "POST",
    auth: true,
    idempotencyKey: true,
  });
}

export type GameScoreAction = "increment" | "decrement";

export type GameScorePayload = {
  team: "home" | "away";
  action: GameScoreAction;
};

export type GameScoreResponse = {
  message: string;
  homeScore?: number;
  awayScore?: number;
  statId?: number;
};

export async function updateGameScore(
  gameId: number,
  payload: GameScorePayload,
): Promise<GameScoreResponse> {
  return apiRequest<GameScoreResponse>(`/api/v1/games/${gameId}/score`, {
    method: "POST",
    auth: true,
    idempotencyKey: true,
    jsonBody: payload,
  });
}

export type AccreditStatPayload = {
  playerId: number;
  assistPlayerId?: number | null;
  isOwnGoal: boolean;
  isPenalty?: boolean;
  minute: number;
};

export async function accreditStat(
  gameId: number,
  statId: number,
  payload: AccreditStatPayload,
): Promise<void> {
  await apiRequest<{ message: string }>(
    `/api/v1/games/${gameId}/stats/${statId}/accredit`,
    {
      method: "PATCH",
      auth: true,
      idempotencyKey: true,
      jsonBody: payload,
    },
  );
}

export async function setMotmAward(
  gameId: number,
  playerId: number,
): Promise<ApiPlayerAward> {
  const res = await apiRequest<{ data: ApiPlayerAward }>(
    `/api/v1/games/${gameId}/awards/motm`,
    {
      method: "PUT",
      auth: true,
      idempotencyKey: true,
      jsonBody: { playerId },
    },
  );
  return res.data;
}
