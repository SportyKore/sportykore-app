import type { ApiGame, ApiStage } from "@/api/entities";

/** Swiss/group phases take precedence over incidental round-robin stages. */
export function matchStages(stages: ApiStage[]): ApiStage[] {
  const type = stages.some((s) => s.stageType === "swiss")
    ? "swiss"
    : stages.some((s) => s.stageType === "group")
      ? "group"
      : stages.some((s) => s.stageType === "round_robin")
        ? "round_robin"
        : "knockout";
  return Array.from(new Map(stages.map((stage) => [stage.id, stage])).values())
    .filter((stage) => stage.stageType === type)
    .sort((a, b) => a.sequence - b.sequence);
}

export function matchStageChoices(stages: ApiStage[]): ApiStage[] {
  const relevant = matchStages(stages);
  return relevant[0]?.stageType === "swiss" ? [] : relevant;
}

export function filterStageMatches<
  T extends Pick<ApiGame, "stageId" | "stageGroupId" | "tieId">,
>(games: T[], stages: ApiStage[], selectedId: number | null): T[] {
  if (!stages.length) return games;
  const relevant = matchStages(stages);
  const selected =
    relevant.find((stage) => stage.id === selectedId) ?? relevant[0];
  if (!selected) return [];
  const targets = selected.stageType === "swiss" ? relevant : [selected];
  return games.filter((game) => {
    if (game.stageId != null)
      return targets.some((stage) => stage.id === game.stageId);
    if (game.stageGroupId != null) {
      return targets.some((stage) =>
        stage.groups?.some((group) => group.id === game.stageGroupId),
      );
    }
    // Unlabelled legacy games are safe to assign only to a sole league stage.
    return (
      relevant.length === 1 &&
      selected.stageType === "round_robin" &&
      game.tieId == null
    );
  });
}
