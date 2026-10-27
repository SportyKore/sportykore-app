import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { manageKeys } from "@/manage/queryKeys";
import { knockoutKeys } from "@/knockout/queryKeys";
import { groupsKeys } from "@/groups/queryKeys";
import { showThrownAsToast } from "@/lib/show-error-toast";

import {
  assignSwissTeams,
  confirmSwissPlayoff,
  confirmSwissRound,
  createSwissStage,
  fetchSwissKnockoutPreview,
  fetchSwissPlayoffProposal,
  fetchSwissQualification,
  generateKnockoutFromSwiss,
  proposeSwissRound,
  updateSwissConfig,
  type AssignSwissTeamsPayload,
  type ConfirmSwissPlayoffPayload,
  type ConfirmSwissRoundPayload,
  type GenerateKnockoutFromSwissPayload,
  type ProposeSwissRoundPayload,
} from "./api";
import { swissKeys } from "./queryKeys";
import type { SwissStageConfig } from "@/api/entities";

function invalidateSwissStage(
  queryClient: ReturnType<typeof useQueryClient>,
  leagueId: number,
  seasonId: number,
  stageId: number,
) {
  void queryClient.invalidateQueries({ queryKey: groupsKeys.standings(stageId) });
  void queryClient.invalidateQueries({ queryKey: swissKeys.all });
  void queryClient.invalidateQueries({ queryKey: manageKeys.league(leagueId, seasonId) });
  void queryClient.invalidateQueries({ queryKey: ["league-detail", leagueId] });
  void queryClient.invalidateQueries({ queryKey: knockoutKeys.seasonStages(seasonId) });
}

export function useCreateSwissStage(leagueId: number, seasonId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Omit<Parameters<typeof createSwissStage>[1], "seasonId" | "stageType">) =>
      createSwissStage(leagueId, { ...payload, seasonId, stageType: "swiss" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: knockoutKeys.seasonStages(seasonId) });
      void queryClient.invalidateQueries({ queryKey: manageKeys.league(leagueId, seasonId) });
    },
    onError: (err) => showThrownAsToast(err, "Could not create swiss stage"),
  });
}

export function useUpdateSwissConfig(leagueId: number, seasonId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ stageId, config }: { stageId: number; config: SwissStageConfig }) =>
      updateSwissConfig(stageId, config),
    onSuccess: (_data, vars) => invalidateSwissStage(queryClient, leagueId, seasonId, vars.stageId),
    onError: (err) => showThrownAsToast(err, "Could not update qualification rules"),
  });
}

export function useAssignSwissTeams(leagueId: number, seasonId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ stageId, payload }: { stageId: number; payload: AssignSwissTeamsPayload }) =>
      assignSwissTeams(stageId, payload),
    onSuccess: (_data, vars) => invalidateSwissStage(queryClient, leagueId, seasonId, vars.stageId),
    onError: (err) => showThrownAsToast(err, "Could not assign teams"),
  });
}

export function useProposeSwissRound(leagueId: number, seasonId: number) {
  return useMutation({
    mutationFn: ({
      stageId,
      stageGroupId,
      roundNumber,
      payload,
    }: {
      stageId: number;
      stageGroupId: number;
      roundNumber: number;
      payload: ProposeSwissRoundPayload;
    }) => proposeSwissRound(stageId, stageGroupId, roundNumber, payload),
    onError: (err) => showThrownAsToast(err, "Could not generate pairings"),
    // leagueId/seasonId reserved for future invalidation if a propose preview gets cached
    meta: { leagueId, seasonId },
  });
}

export function useConfirmSwissRound(leagueId: number, seasonId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      stageId,
      stageGroupId,
      roundNumber,
      payload,
    }: {
      stageId: number;
      stageGroupId: number;
      roundNumber: number;
      payload: ConfirmSwissRoundPayload;
    }) => confirmSwissRound(stageId, stageGroupId, roundNumber, payload),
    onSuccess: (_data, vars) => invalidateSwissStage(queryClient, leagueId, seasonId, vars.stageId),
    onError: (err) => showThrownAsToast(err, "Could not confirm round"),
  });
}

export function useSwissQualification(
  stageId: number,
  stageGroupId: number,
  enabled = true,
) {
  return useQuery({
    queryKey: swissKeys.qualification(stageId, stageGroupId),
    queryFn: () => fetchSwissQualification(stageId, stageGroupId),
    enabled: stageId > 0 && stageGroupId > 0 && enabled,
    staleTime: 10 * 1000,
  });
}

export function useSwissPlayoffProposal(
  stageId: number,
  stageGroupId: number,
  enabled = true,
) {
  return useQuery({
    queryKey: swissKeys.playoffProposal(stageId, stageGroupId),
    queryFn: () => fetchSwissPlayoffProposal(stageId, stageGroupId),
    enabled: stageId > 0 && stageGroupId > 0 && enabled,
    staleTime: 10 * 1000,
  });
}

export function useSwissKnockoutPreview(stageId: number, enabled = true) {
  return useQuery({
    queryKey: swissKeys.knockoutPreview(stageId),
    queryFn: () => fetchSwissKnockoutPreview(stageId),
    enabled: stageId > 0 && enabled,
    staleTime: 10 * 1000,
  });
}

export function useConfirmSwissPlayoff(leagueId: number, seasonId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      stageId,
      stageGroupId,
      payload,
    }: {
      stageId: number;
      stageGroupId: number;
      payload: ConfirmSwissPlayoffPayload;
    }) => confirmSwissPlayoff(stageId, stageGroupId, payload),
    onSuccess: (_data, vars) => invalidateSwissStage(queryClient, leagueId, seasonId, vars.stageId),
    onError: (err) => showThrownAsToast(err, "Could not confirm playoff fixtures"),
  });
}

export function useGenerateKnockoutFromSwiss(leagueId: number, seasonId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      stageId,
      payload,
    }: {
      stageId: number;
      payload: GenerateKnockoutFromSwissPayload;
    }) => generateKnockoutFromSwiss(stageId, payload),
    onSuccess: (_data, vars) => {
      invalidateSwissStage(queryClient, leagueId, seasonId, vars.stageId);
      void queryClient.invalidateQueries({ queryKey: knockoutKeys.brackets() });
    },
    onError: (err) => showThrownAsToast(err, "Could not generate knockout"),
  });
}
