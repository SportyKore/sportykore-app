import type { ApiStage, GroupStageConfig } from "@/api/entities";

export function hasGroupStage(stages: ApiStage[] | undefined | null): boolean {
  return (stages ?? []).some((s) => s.stageType === "group");
}

export function groupStages(stages: ApiStage[] | undefined | null): ApiStage[] {
  return (stages ?? [])
    .filter((s) => s.stageType === "group")
    .sort((a, b) => a.sequence - b.sequence);
}

export function standingStages(
  stages: ApiStage[] | undefined | null,
): ApiStage[] {
  return (stages ?? [])
    .filter(
      (s) =>
        s.stageType === "round_robin" ||
        s.stageType === "group" ||
        s.stageType === "swiss",
    )
    .sort((a, b) => a.sequence - b.sequence);
}

/** Prefer latest active stage, else highest sequence among candidates. */
export function pickPreferredStage(
  stages: ApiStage[] | undefined | null,
): ApiStage | null {
  const list = stages ?? [];
  if (!list.length) return null;
  const active = [...list]
    .filter((s) => s.status === "active")
    .sort((a, b) => b.sequence - a.sequence);
  if (active[0]) return active[0];
  return [...list].sort((a, b) => b.sequence - a.sequence)[0] ?? null;
}

export function isGroupStageConfig(
  config: unknown,
): config is GroupStageConfig {
  if (!config || typeof config !== "object") return false;
  const c = config as GroupStageConfig;
  return (
    typeof c.format?.group_count === "number" &&
    typeof c.advancement?.per_group === "number"
  );
}

export function readGroupConfig(stage: ApiStage): GroupStageConfig | null {
  return isGroupStageConfig(stage.config) ? stage.config : null;
}

export function estimatedGamesPerGroup(
  teamCount: number,
  doubleRoundRobin: boolean,
): number {
  if (teamCount < 2) return 0;
  const single = (teamCount * (teamCount - 1)) / 2;
  return doubleRoundRobin ? single * 2 : single;
}

export function buildDefaultGroupConfig(overrides?: {
  groupCount?: number;
  doubleRoundRobin?: boolean;
  perGroup?: number;
}): GroupStageConfig {
  return {
    format: {
      group_count: overrides?.groupCount ?? 2,
      double_round_robin: overrides?.doubleRoundRobin ?? false,
    },
    advancement: {
      per_group: overrides?.perGroup ?? 2,
    },
  };
}

export function cohortKey(points: number, played: number): string {
  return `${points}:${played}`;
}

/** Rows that share points+played with at least one other row. */
export function tiedCohorts<
  T extends { points: number; played: number; team?: { id: number } },
>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = cohortKey(row.points, row.played);
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  for (const [key, list] of map) {
    if (list.length < 2) map.delete(key);
  }
  return map;
}
