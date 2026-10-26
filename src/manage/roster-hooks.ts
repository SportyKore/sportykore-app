import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { manageKeys } from "./queryKeys";
import { invalidateManageLeagueData } from "./invalidate-queries";
import {
  assignRosterPlayers,
  createRosterPlayers,
  fetchRosterSettings,
  reviewRosterPlayer,
  updateRosterSettings,
  type CreateRosterPlayers,
} from "./roster-api";

export function useRosterActions(leagueId: number, seasonId: number) {
  const client = useQueryClient();
  const onSuccess = async () => {
    invalidateManageLeagueData(client, leagueId);
    await Promise.all([
      client.invalidateQueries({
        queryKey: manageKeys.roster(leagueId, seasonId),
      }),
      client.invalidateQueries({ queryKey: ["team"] }),
      client.invalidateQueries({ queryKey: ["player"] }),
    ]);
  };
  const create = useMutation({
    mutationFn: (payload: CreateRosterPlayers) =>
      createRosterPlayers(leagueId, seasonId, payload),
    onSuccess,
  });
  const assign = useMutation({
    mutationFn: (payload: { teamId: number; rosterIds: number[] }) =>
      assignRosterPlayers(leagueId, seasonId, payload),
    onSuccess,
  });
  const review = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: number;
      status: "active" | "rejected";
    }) => reviewRosterPlayer(leagueId, seasonId, id, status),
    onSuccess,
  });
  return { create, assign, review };
}
export function useRosterSettings(leagueId: number, enabled: boolean) {
  return useQuery({
    queryKey: manageKeys.rosterSettings(leagueId),
    queryFn: () => fetchRosterSettings(leagueId),
    enabled: enabled && leagueId > 0,
  });
}
export function useUpdateRosterSettings(leagueId: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (requiresApproval: boolean) =>
      updateRosterSettings(leagueId, { requiresApproval }),
    onSuccess: () =>
      client.invalidateQueries({
        queryKey: manageKeys.rosterSettings(leagueId),
      }),
  });
}
