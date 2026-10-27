import type { ApiStage, ApiTie, BracketRound } from "@/api/entities";

export const BRACKET_ROUND_ORDER: readonly BracketRound[] = [
  "r256",
  "r128",
  "r64",
  "r32",
  "r16",
  "qf",
  "sf",
  "final",
] as const;

export const ROUND_LABELS: Record<BracketRound, string> = {
  r256: "Round of 256",
  r128: "Round of 128",
  r64: "Round of 64",
  r32: "Round of 32",
  r16: "Round of 16",
  qf: "Quarter-finals",
  sf: "Semi-finals",
  final: "Final",
  third_place: "Third place",
};

export function roundLabel(round: BracketRound): string {
  return ROUND_LABELS[round] ?? round;
}

export function groupTiesByRound(ties: ApiTie[]): {
  rounds: { round: BracketRound; ties: ApiTie[] }[];
  thirdPlace: ApiTie | null;
} {
  const byRound = new Map<BracketRound, ApiTie[]>();
  for (const tie of ties) {
    const list = byRound.get(tie.round) ?? [];
    list.push(tie);
    byRound.set(tie.round, list);
  }

  for (const list of byRound.values()) {
    list.sort((a, b) => a.bracketPosition - b.bracketPosition);
  }

  const rounds = BRACKET_ROUND_ORDER.filter((r) => byRound.has(r)).map(
    (round) => ({
      round,
      ties: byRound.get(round)!,
    }),
  );

  const thirdPlaceList = byRound.get("third_place") ?? [];
  return {
    rounds,
    thirdPlace: thirdPlaceList[0] ?? null,
  };
}

/** Split a round's ties into left/right halves by bracket position. */
export function splitTiesSides(ties: ApiTie[]): {
  left: ApiTie[];
  right: ApiTie[];
} {
  const sorted = [...ties].sort(
    (a, b) => a.bracketPosition - b.bracketPosition,
  );
  if (sorted.length <= 1) {
    return { left: sorted, right: [] };
  }
  const mid = Math.ceil(sorted.length / 2);
  return { left: sorted.slice(0, mid), right: sorted.slice(mid) };
}

export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

export function byeCountForTeamCount(n: number): number {
  if (n < 2) return 0;
  return nextPow2(n) - n;
}

export function pickPrimaryStage(
  stages: ApiStage[] | undefined | null,
): ApiStage | null {
  if (!stages?.length) return null;
  const ordered = [...stages].sort((a, b) => a.sequence - b.sequence);
  const active = [...ordered]
    .filter((s) => s.status === "active")
    .sort((a, b) => b.sequence - a.sequence);
  if (active[0]) return active[0];
  return (
    ordered.find((s) => s.stageType === "knockout") ??
    ordered.find((s) => s.stageType === "swiss") ??
    ordered.find((s) => s.stageType === "group") ??
    ordered.find((s) => s.stageType === "round_robin") ??
    ordered[0] ??
    null
  );
}

export function hasRoundRobinStage(stages: ApiStage[] | undefined | null): boolean {
  return Boolean(stages?.some((s) => s.stageType === "round_robin"));
}

export function hasGroupStage(stages: ApiStage[] | undefined | null): boolean {
  return Boolean(stages?.some((s) => s.stageType === "group"));
}

export function knockoutStages(stages: ApiStage[] | undefined | null): ApiStage[] {
  return (stages ?? []).filter((s) => s.stageType === "knockout");
}

export function isRoundComplete(ties: ApiTie[], round: BracketRound): boolean {
  const roundTies = ties.filter((t) => t.round === round);
  if (roundTies.length === 0) return false;
  return roundTies.every(
    (t) => t.status === "completed" && t.winnerTeam != null,
  );
}

export function latestIncompleteRound(ties: ApiTie[]): BracketRound | null {
  for (let i = BRACKET_ROUND_ORDER.length - 1; i >= 0; i -= 1) {
    const round = BRACKET_ROUND_ORDER[i]!;
    const roundTies = ties.filter((t) => t.round === round);
    if (roundTies.length === 0) continue;
    if (!roundTies.every((t) => t.status === "completed")) {
      return round;
    }
  }
  return null;
}

/** Round that can feed next-round generation (fully complete, next not created). */
export function completedRoundReadyForNext(ties: ApiTie[]): BracketRound | null {
  for (let i = 0; i < BRACKET_ROUND_ORDER.length - 1; i += 1) {
    const round = BRACKET_ROUND_ORDER[i]!;
    const next = BRACKET_ROUND_ORDER[i + 1]!;
    if (!isRoundComplete(ties, round)) continue;
    const nextExists = ties.some((t) => t.round === next);
    if (!nextExists) return round;
  }
  // Final complete may still need "final" next-round to mark stage done
  if (isRoundComplete(ties, "final")) {
    return "final";
  }
  return null;
}

export function seriesScoreLabel(tie: ApiTie): string {
  if (tie.isBye) return "BYE";
  const home = tie.homeScoreAgg;
  const away = tie.awayScoreAgg;
  if (home != null && away != null) {
    if (tie.tieFormat === "best_of") {
      return `${home}–${away}`;
    }
    return `${home}–${away}`;
  }
  const games = tie.games ?? [];
  const last = games[games.length - 1];
  if (last?.homeScore != null && last.awayScore != null) {
    if (
      last.homePenaltyScore != null &&
      last.awayPenaltyScore != null &&
      last.homeScore === last.awayScore
    ) {
      return `${last.homeScore}–${last.awayScore} (${last.homePenaltyScore}–${last.awayPenaltyScore} pens)`;
    }
    return `${last.homeScore}–${last.awayScore}`;
  }
  return "vs";
}
