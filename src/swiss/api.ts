import type {
  ApiStage,
  ApiStageGroup,
  ApiSwissKnockoutPreview,
  ApiSwissPlayoffProposal,
  ApiSwissProposeResult,
  ApiSwissQualificationResult,
  SwissProposedFixture,
  SwissStageConfig,
} from "@/api/entities";
import { apiRequest } from "@/api/http-client";

export type CreateSwissStagePayload = {
  seasonId: number;
  name: string;
  stageType: "swiss";
  sequence?: number;
  groupNames: string[];
  config: SwissStageConfig;
};

export type CreateSwissStageResult = {
  message: string;
  id: number;
  groups: ApiStageGroup[];
};

export type AssignSwissTeamsPayload =
  | { mode: "manual"; assignments: { teamId: number; stageGroupId: number }[] }
  | { mode: "auto"; teamIds: number[]; shuffle?: boolean };

export type AssignSwissTeamsResult = {
  message: string;
  assignments: { teamId: number; stageGroupId: number }[];
};

export type ProposeSwissRoundPayload =
  | { mode: "auto"; allowIncompleteRounds?: boolean }
  | { mode: "manual"; fixtures: SwissProposedFixture[]; allowIncompleteRounds?: boolean };

export type ConfirmSwissRoundPayload = {
  fixtures: SwissProposedFixture[];
  playedAt?: string;
  venueName?: string | null;
  venueId?: number | null;
  byeTeamId?: number | null;
  forceOverride?: boolean;
};

export type ConfirmSwissPlayoffPayload = {
  fixtures: SwissProposedFixture[];
  playedAt?: string;
  venueName?: string | null;
  venueId?: number | null;
};

export type GenerateKnockoutFromSwissPayload = {
  name?: string;
  groupOrder?: number[];
};

export type GenerateKnockoutFromSwissResult = {
  stage: ApiStage;
  ties: unknown[];
  qualifiers: number[];
};

export async function createSwissStage(
  leagueId: number,
  payload: CreateSwissStagePayload,
): Promise<CreateSwissStageResult> {
  return apiRequest<CreateSwissStageResult>(`/api/v1/leagues/${leagueId}/stages`, {
    method: "POST",
    auth: true,
    idempotencyKey: true,
    jsonBody: payload,
  });
}

export async function updateSwissConfig(
  stageId: number,
  config: SwissStageConfig,
): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/api/v1/leagues/stages/${stageId}/swiss/config`, {
    method: "PUT",
    auth: true,
    idempotencyKey: true,
    jsonBody: { config },
  });
}

export async function assignSwissTeams(
  stageId: number,
  payload: AssignSwissTeamsPayload,
): Promise<AssignSwissTeamsResult> {
  return apiRequest<AssignSwissTeamsResult>(`/api/v1/leagues/stages/${stageId}/swiss/assign`, {
    method: "POST",
    auth: true,
    idempotencyKey: true,
    jsonBody: payload,
  });
}

export async function proposeSwissRound(
  stageId: number,
  stageGroupId: number,
  roundNumber: number,
  payload: ProposeSwissRoundPayload,
): Promise<ApiSwissProposeResult> {
  return apiRequest<{ data: ApiSwissProposeResult }>(
    `/api/v1/leagues/stages/${stageId}/swiss/groups/${stageGroupId}/rounds/${roundNumber}/propose`,
    { method: "POST", auth: true, idempotencyKey: true, jsonBody: payload },
  ).then((r) => r.data);
}

export async function confirmSwissRound(
  stageId: number,
  stageGroupId: number,
  roundNumber: number,
  payload: ConfirmSwissRoundPayload,
): Promise<{ message: string; count: number }> {
  return apiRequest<{ message: string; count: number }>(
    `/api/v1/leagues/stages/${stageId}/swiss/groups/${stageGroupId}/rounds/${roundNumber}/confirm`,
    { method: "POST", auth: true, idempotencyKey: true, jsonBody: payload },
  );
}

export async function fetchSwissQualification(
  stageId: number,
  stageGroupId: number,
): Promise<ApiSwissQualificationResult> {
  return apiRequest<{ data: ApiSwissQualificationResult }>(
    `/api/v1/leagues/stages/${stageId}/swiss/groups/${stageGroupId}/qualification`,
    { auth: true },
  ).then((r) => r.data);
}

export async function fetchSwissPlayoffProposal(
  stageId: number,
  stageGroupId: number,
): Promise<ApiSwissPlayoffProposal> {
  return apiRequest<{ data: ApiSwissPlayoffProposal }>(
    `/api/v1/leagues/stages/${stageId}/swiss/groups/${stageGroupId}/playoff/propose`,
    { auth: true },
  ).then((r) => r.data);
}

export async function confirmSwissPlayoff(
  stageId: number,
  stageGroupId: number,
  payload: ConfirmSwissPlayoffPayload,
): Promise<{ message: string; count: number }> {
  return apiRequest<{ message: string; count: number }>(
    `/api/v1/leagues/stages/${stageId}/swiss/groups/${stageGroupId}/playoff/confirm`,
    { method: "POST", auth: true, idempotencyKey: true, jsonBody: payload },
  );
}

export async function fetchSwissKnockoutPreview(
  stageId: number,
): Promise<ApiSwissKnockoutPreview> {
  return apiRequest<{ data: ApiSwissKnockoutPreview }>(
    `/api/v1/leagues/stages/${stageId}/swiss/generate-knockout/preview`,
    { auth: true },
  ).then((r) => r.data);
}

export async function generateKnockoutFromSwiss(
  stageId: number,
  payload: GenerateKnockoutFromSwissPayload,
): Promise<GenerateKnockoutFromSwissResult> {
  return apiRequest<GenerateKnockoutFromSwissResult>(
    `/api/v1/leagues/stages/${stageId}/swiss/generate-knockout`,
    { method: "POST", auth: true, idempotencyKey: true, jsonBody: payload },
  );
}
