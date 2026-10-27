import type {
  ApiStage,
  CompetitionFormat,
  GroupStageConfig,
  KnockoutStageConfig,
  SwissStageConfig,
  TieFormat,
} from "@/api/entities";

export type CompetitionFormatCopy = {
  label: string;
  shortLabel: string;
  description: string;
  lockedHint: string;
};

export const COMPETITION_FORMAT_COPY: Record<
  CompetitionFormat,
  CompetitionFormatCopy
> = {
  league: {
    label: "League table",
    shortLabel: "League",
    description:
      "Every team plays fixtures and the season is decided by standings.",
    lockedHint:
      "This format is chosen when the season is created. Use Settings to create a new season with a different format.",
  },
  knockout: {
    label: "Knockout cup",
    shortLabel: "Cup",
    description:
      "Teams play through a bracket. Team order during setup becomes the seed order.",
    lockedHint:
      "Cup format is set when the season is created. Seed or adjust the bracket from the Knockout tab.",
  },
  group: {
    label: "Group stage",
    shortLabel: "Groups",
    description:
      "Teams are split into groups first, then qualifiers can move into a knockout.",
    lockedHint:
      "Group format is set when the season is created. Assign teams from the Groups tab.",
  },
  swiss: {
    label: "Swiss stage",
    shortLabel: "Swiss",
    description:
      "Teams are split into groups and play a fixed number of rounds, paired by standings each round, before qualifiers move into a knockout.",
    lockedHint:
      "Swiss format is set when the season is created. Everything else happens from the Swiss tab.",
  },
};

export function competitionFormatLabel(format: CompetitionFormat): string {
  return COMPETITION_FORMAT_COPY[format].label;
}

export function inferSeasonFormat(stages: ApiStage[] = []): CompetitionFormat {
  if (stages.some((stage) => stage.stageType === "swiss")) return "swiss";
  if (stages.some((stage) => stage.stageType === "group")) return "group";
  if (stages.some((stage) => stage.stageType === "knockout")) return "knockout";
  return "league";
}

export function describeSeasonFormat(stages: ApiStage[] = []): CompetitionFormatCopy {
  const inferred = inferSeasonFormat(stages);
  const base = COMPETITION_FORMAT_COPY[inferred];

  const groupStage = stages.find((stage) => stage.stageType === "group");
  if (groupStage) {
    const config = groupStage.config as GroupStageConfig | undefined;
    const groupCount = config?.format?.group_count;
    const perGroup = config?.advancement?.per_group;
    const roundRobin = config?.format?.double_round_robin
      ? "double round-robin"
      : "single round-robin";
    return {
      ...base,
      description: [
        groupCount ? `${groupCount} groups` : "Group stage",
        roundRobin,
        perGroup ? `${perGroup} advance per group` : null,
      ]
        .filter(Boolean)
        .join(", "),
    };
  }

  const swissStage = stages.find((stage) => stage.stageType === "swiss");
  if (swissStage) {
    const config = swissStage.config as SwissStageConfig | undefined;
    const groupCount = swissStage.groups?.length;
    const rounds = config?.format?.rounds;
    return {
      ...base,
      description: [
        groupCount ? `${groupCount} groups` : "Swiss stage",
        rounds ? `${rounds} rounds` : null,
      ]
        .filter(Boolean)
        .join(", "),
    };
  }

  const knockoutStage = stages.find((stage) => stage.stageType === "knockout");
  if (knockoutStage) {
    const config = knockoutStage.config as KnockoutStageConfig | undefined;
    const tieFormat = config?.ties?.default?.tie_format;
    return {
      ...base,
      description: `Bracket with ${tieFormatLabel(tieFormat)} ties.`,
    };
  }

  return base;
}

export function tieFormatLabel(tieFormat?: TieFormat | null): string {
  if (tieFormat === "two_legged") return "two-legged";
  if (tieFormat === "best_of") return "best-of";
  return "single-match";
}
