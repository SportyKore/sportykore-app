import { apiRequest } from "@/api/http-client";

import type {
  AcceptInviteResult,
  CompleteProfilePayload,
  CompleteProfileResult,
  GenerateInviteParams,
  GenerateInviteResult,
  InviteUser,
} from "./types";

export async function acceptInvite(token: string): Promise<AcceptInviteResult> {
  return apiRequest<AcceptInviteResult>(
    `/api/v1/invites/accept/${encodeURIComponent(token)}`,
    { auth: true, muteGlobalUnauthorized: true },
  );
}

export async function completeProfileAndAccept(
  token: string,
  payload: CompleteProfilePayload,
): Promise<CompleteProfileResult> {
  const path = `/api/v1/invites/complete-profile-and-accept/${encodeURIComponent(token)}`;

  if (payload.avatar) {
    const form = new FormData();
    form.append("name", payload.name);
    form.append("countryId", String(payload.countryId));
    if (payload.bio) {
      form.append("bio", payload.bio);
    }
    form.append("avatar", {
      uri: payload.avatar.uri,
      name: payload.avatar.name,
      type: payload.avatar.type,
    } as unknown as Blob);

    return apiRequest<CompleteProfileResult>(path, {
      method: "POST",
      auth: true,
      muteGlobalUnauthorized: true,
      idempotencyKey: true,
      jsonBody: form,
    });
  }

  return apiRequest<CompleteProfileResult>(path, {
    method: "POST",
    auth: true,
    muteGlobalUnauthorized: true,
    idempotencyKey: true,
    jsonBody: {
      name: payload.name,
      countryId: payload.countryId,
      bio: payload.bio,
    },
  });
}

export async function searchLeagueUsers(
  leagueId: number,
  query: string,
): Promise<InviteUser[]> {
  const params = new URLSearchParams({
    q: query.trim(),
    leagueId: String(leagueId),
  });
  const res = await apiRequest<{ data: InviteUser[] }>(
    `/api/v1/auth/users/search?${params}`,
    { auth: true },
  );
  return res.data;
}

export async function generateInvite(
  params: GenerateInviteParams,
): Promise<GenerateInviteResult> {
  const query = new URLSearchParams({
    leagueId: String(params.leagueId),
    seasonId: String(params.seasonId),
  });
  if (params.teamId != null) query.set("teamId", String(params.teamId));
  if (params.invitedUserId != null) {
    query.set("invitedUserId", String(params.invitedUserId));
  }
  return apiRequest<GenerateInviteResult>(`/api/v1/invites/generate?${query}`, {
    auth: true,
  });
}
