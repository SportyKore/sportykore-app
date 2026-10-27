import type { ApiStage, SwissStageConfig } from "@/api/entities";
import type { SwissFormatFormState } from "./components/SwissFormatConfigControl";

export function hasSwissStage(stages: ApiStage[] | undefined | null): boolean {
  return (stages ?? []).some((s) => s.stageType === "swiss");
}

export function swissStages(stages: ApiStage[] | undefined | null): ApiStage[] {
  return (stages ?? [])
    .filter((s) => s.stageType === "swiss")
    .sort((a, b) => a.sequence - b.sequence);
}

export function isSwissStageConfig(config: unknown): config is SwissStageConfig {
  if (!config || typeof config !== "object") return false;
  const c = config as SwissStageConfig;
  return typeof c.format?.rounds === "number" && typeof c.qualification?.directCount === "number";
}

export function readSwissConfig(stage: ApiStage): SwissStageConfig | null {
  return isSwissStageConfig(stage.config) ? stage.config : null;
}

/** A group's qualification rule: its own override, else the stage default. */
export function qualificationRuleForGroup(
  config: SwissStageConfig,
  stageGroupId: number,
) {
  return config.qualificationByGroup?.[String(stageGroupId)] ?? config.qualification;
}

export function buildDefaultSwissConfig(overrides?: {
  rounds?: number;
  byeHandling?: SwissStageConfig["format"]["byeHandling"];
  directCount?: number;
  playoffRankFrom?: number;
  playoffRankTo?: number;
}): SwissStageConfig {
  return {
    format: {
      rounds: overrides?.rounds ?? 3,
      byeHandling: overrides?.byeHandling ?? "warn",
    },
    qualification: {
      directCount: overrides?.directCount ?? 1,
      playoffRankFrom: overrides?.playoffRankFrom ?? 2,
      playoffRankTo: overrides?.playoffRankTo ?? 5,
    },
  };
}

export function buildSwissStageConfig(state: SwissFormatFormState): SwissStageConfig {
  return buildDefaultSwissConfig({
    rounds: state.rounds,
    byeHandling: state.byeHandling,
    directCount: state.directCount,
    playoffRankFrom: state.playoffRankFrom,
    playoffRankTo: state.playoffRankTo,
  });
}
