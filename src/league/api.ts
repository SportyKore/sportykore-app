import { apiRequest } from "@/api/http-client";
import type { PickedImageFile } from "@/lib/picked-image";
import type {
  CompetitionFormat,
  GroupStageConfig,
  KnockoutStageConfig,
  SwissStageConfig,
} from "@/api/entities";

import type { TiebreakerRule } from "./tiebreaker-options";
import type { LeagueDetail } from "./types";

export async function fetchLeagueDetail(
  leagueId: number,
  seasonId?: number,
  options?: { auth?: boolean; includeInactive?: boolean },
): Promise<LeagueDetail> {
  const query = new URLSearchParams();
  if (seasonId != null) query.set("seasonId", String(seasonId));
  if (options?.includeInactive) query.set("includeInactive", "true");

  const path = `/api/v1/leagues/${leagueId}${
    query.toString() ? `?${query}` : ""
  }`;
  const res = await apiRequest<{ data: LeagueDetail }>(path, {
    auth: options?.auth,
  });
  return res.data;
}

export type CreateLeagueTeamPayload = {
  name: string;
  logo?: PickedImageFile;
};

export type CreateLeagueKnockoutPayload = {
  name?: string;
  seed?: boolean;
  config: KnockoutStageConfig;
};

export type CreateLeagueGroupPayload = {
  name?: string;
  config?: GroupStageConfig;
};

export type CreateLeagueSwissPayload = {
  name?: string;
  groupNames: string[];
  config: SwissStageConfig;
};

export type CreateLeaguePayload = {
  name: string;
  seasonName: string;
  countryId: number;
  description?: string;
  gender?: string;
  logo?: PickedImageFile;
  tiebreaker?: TiebreakerRule;
  startDate?: string;
  endDate?: string;
  format?: CompetitionFormat;
  knockout?: CreateLeagueKnockoutPayload;
  group?: CreateLeagueGroupPayload;
  swiss?: CreateLeagueSwissPayload;
  teams?: CreateLeagueTeamPayload[];
};

export type CreateLeagueResult = {
  message: string;
  leagueId?: number;
  seasonId?: number;
  stageId?: number;
  format?: CompetitionFormat;
  seeded?: boolean;
};

function readCreateLeagueResult(body: unknown): CreateLeagueResult {
  if (!body || typeof body !== "object") {
    return { message: "Competition created successfully." };
  }

  const record = body as Record<string, unknown>;
  const message =
    typeof record.message === "string" && record.message.trim().length > 0
      ? record.message.trim()
      : "Competition created successfully.";

  return {
    message,
    leagueId: typeof record.leagueId === "number" ? record.leagueId : undefined,
    seasonId: typeof record.seasonId === "number" ? record.seasonId : undefined,
    stageId: typeof record.stageId === "number" ? record.stageId : undefined,
    format:
      record.format === "league" ||
      record.format === "knockout" ||
      record.format === "group" ||
      record.format === "swiss"
        ? record.format
        : undefined,
    seeded: typeof record.seeded === "boolean" ? record.seeded : undefined,
  };
}

function appendImageFile(form: FormData, key: string, file: PickedImageFile) {
  form.append(key, {
    uri: file.uri,
    name: file.name,
    type: file.type,
  } as unknown as Blob);
}

function needsMultipart(payload: CreateLeaguePayload): boolean {
  if (payload.logo) return true;
  return payload.teams?.some((team) => team.logo) ?? false;
}

function buildCreateLeagueFormData(payload: CreateLeaguePayload): FormData {
  const form = new FormData();
  form.append("name", payload.name);
  form.append("seasonName", payload.seasonName);
  form.append("countryId", String(payload.countryId));

  if (payload.description) {
    form.append("description", payload.description);
  }
  if (payload.gender) {
    form.append("gender", payload.gender);
  }
  if (payload.tiebreaker) {
    form.append("tiebreaker", payload.tiebreaker);
  }
  if (payload.startDate) {
    form.append("startDate", payload.startDate);
  }
  if (payload.endDate) {
    form.append("endDate", payload.endDate);
  }
  if (payload.format) {
    form.append("format", payload.format);
  }
  if (payload.knockout) {
    form.append("knockout", JSON.stringify(payload.knockout));
  }
  if (payload.group) {
    form.append("group", JSON.stringify(payload.group));
  }
  if (payload.swiss) {
    form.append("swiss", JSON.stringify(payload.swiss));
  }
  if (payload.logo) {
    appendImageFile(form, "logo", payload.logo);
  }

  payload.teams?.forEach((team, index) => {
    form.append(`teams.${index}.name`, team.name);
    if (team.logo) {
      appendImageFile(form, `teams.${index}.logo`, team.logo);
    }
  });

  return form;
}

export async function createLeague(
  payload: CreateLeaguePayload,
): Promise<CreateLeagueResult> {
  const res = await apiRequest<unknown>("/api/v1/leagues", {
    method: "POST",
    auth: true,
    idempotencyKey: true,
    jsonBody: needsMultipart(payload) ? buildCreateLeagueFormData(payload) : payload,
  });

  return readCreateLeagueResult(res);
}
