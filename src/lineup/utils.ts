import type { ApiStat, ApiPlayerWithStats, ApiTeam, PlayerPosition } from "@/api/entities";
import { isGoalsStat, isOwnGoalStat } from "@/lib/stat-types";

import type { LeagueRosterRow } from "@/manage/types";

import type {
  Formation,
  FormationSlot,
  RosterPickerPlayer,
  SetLineupPayload,
  SlotAssignment,
  SubAssignment,
  TeamLineupGroup,
} from "./types";

export type PlayerMatchBadges = {
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
};

/** "Jules Kounde" → "J. Kounde"; single-token names stay as-is. */
export function formatPitchPlayerName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0] ?? trimmed;
  const first = parts[0] ?? "";
  const rest = parts.slice(1).join(" ");
  const initial = first.charAt(0).toUpperCase();
  return `${initial}. ${rest}`;
}

function emptyBadges(): PlayerMatchBadges {
  return { goals: 0, assists: 0, yellowCards: 0, redCards: 0 };
}

/** Aggregate this-match event counts keyed by player id. */
export function aggregatePlayerMatchBadges(
  stats: ApiStat[],
): Map<number, PlayerMatchBadges> {
  const map = new Map<number, PlayerMatchBadges>();

  const bump = (
    playerId: number | undefined,
    key: keyof PlayerMatchBadges,
    amount: number,
  ) => {
    if (playerId == null || amount <= 0) return;
    const entry = map.get(playerId) ?? emptyBadges();
    entry[key] += amount;
    map.set(playerId, entry);
  };

  for (const stat of stats) {
    const slug = stat.type?.name?.toLowerCase() ?? "";
    const amount = stat.numericValue ?? 1;
    const playerId = stat.player?.id;

    if (isGoalsStat(stat) || isOwnGoalStat(stat)) {
      bump(playerId, "goals", amount);
      continue;
    }
    if (slug === "assists" || slug === "assist") {
      bump(playerId, "assists", amount);
      continue;
    }
    if (slug === "yellow_card" || slug === "yellow") {
      bump(playerId, "yellowCards", amount);
      continue;
    }
    if (slug === "red_card" || slug === "red") {
      bump(playerId, "redCards", amount);
    }
  }

  return map;
}

const MAX_SUBSTITUTES = 9;

/** Map formation slot codes (GK, ST, …) to coarse roster positions. */
const SLOT_TO_COARSE: Record<string, PlayerPosition> = {
  GK: "goalkeeper",
  GOALKEEPER: "goalkeeper",
  CB: "defence",
  LB: "defence",
  RB: "defence",
  LWB: "defence",
  RWB: "defence",
  DEF: "defence",
  CDM: "midfield",
  CM: "midfield",
  CAM: "midfield",
  LM: "midfield",
  RM: "midfield",
  MID: "midfield",
  LW: "attack",
  RW: "attack",
  ST: "attack",
  CF: "attack",
  ATT: "attack",
};

function normalizeSlotCode(value: string): string {
  return value.trim().toUpperCase();
}

export function slotToCoarsePosition(slotPosition: string, label?: string): PlayerPosition | null {
  const fromPosition = SLOT_TO_COARSE[normalizeSlotCode(slotPosition)];
  if (fromPosition) return fromPosition;
  if (label) {
    const fromLabel = SLOT_TO_COARSE[normalizeSlotCode(label)];
    if (fromLabel) return fromLabel;
  }
  return null;
}

/** Lower rank = better match for the slot. */
export function slotPositionRank(
  slotPosition: string,
  slotLabel: string,
  playerPosition: PlayerPosition | null | undefined,
): number {
  if (!playerPosition) return 3;
  const target = slotToCoarsePosition(slotPosition, slotLabel);
  if (!target) return 2;
  if (target === playerPosition) return 0;
  return 1;
}

export function groupSlotsByLine(slots: FormationSlot[]): FormationSlot[][] {
  const byLine = new Map<number, FormationSlot[]>();
  for (const slot of slots) {
    const bucket = byLine.get(slot.line) ?? [];
    bucket.push(slot);
    byLine.set(slot.line, bucket);
  }
  return [...byLine.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, lineSlots]) => lineSlots.sort((a, b) => a.order - b.order));
}

export type SlotCoordinate = { top: number; left: number };

/** Map formation slot to percentage position on the pitch (GK bottom, attack top). */
export function slotCoordinates(
  slot: FormationSlot,
  allSlots: FormationSlot[],
): SlotCoordinate {
  const lines = groupSlotsByLine(allSlots);
  const lineIndex = lines.findIndex((row) => row.some((s) => s.key === slot.key));
  const row = lines[lineIndex] ?? [slot];
  const slotIndex = row.findIndex((s) => s.key === slot.key);

  const lineCount = lines.length;
  const top =
    lineCount <= 1
      ? 50
      : 88 - (lineIndex / (lineCount - 1)) * 76;

  const count = row.length;
  const left = count === 1 ? 50 : 12 + (slotIndex / (count - 1)) * 76;

  return { top, left };
}

export function rosterToPickerPlayers(roster: LeagueRosterRow[]): RosterPickerPlayer[] {
  return roster.filter((row) => row.status === "active" && row.team != null).map((row) => ({
    playerId: row.player.id,
    playerName: row.player.name,
    jerseyNumber: row.jerseyNumber ? Number(row.jerseyNumber) : null,
    position: row.position ?? row.player.position ?? null,
  }));
}

export function sortPlayersForSlot(
  players: RosterPickerPlayer[],
  slot: FormationSlot,
): RosterPickerPlayer[] {
  return [...players].sort((a, b) => {
    const rankA = slotPositionRank(slot.position, slot.label, a.position);
    const rankB = slotPositionRank(slot.position, slot.label, b.position);
    if (rankA !== rankB) return rankA - rankB;
    return a.playerName.localeCompare(b.playerName);
  });
}

export function parseJerseyNumber(value: string | null | undefined): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 && n <= 99 ? n : null;
}

export function hydrateEditorFromLineup(
  formation: Formation,
  group: TeamLineupGroup | undefined,
  roster: LeagueRosterRow[],
): {
  slots: Record<string, SlotAssignment>;
  subs: SubAssignment[];
} {
  const slots: Record<string, SlotAssignment> = {};
  const subs: SubAssignment[] = [];

  if (!group) return { slots, subs };

  for (const starter of group.starters) {
    if (!starter.slotKey) continue;
    const rosterRow = roster.find((r) => r.player?.id === starter.playerId);
    slots[starter.slotKey] = {
      playerId: starter.playerId,
      playerName: starter.player?.name,
      jerseyNumber:
        starter.jerseyNumber ??
        parseJerseyNumber(rosterRow?.jerseyNumber) ??
        null,
    };
  }

  for (const sub of group.substitutes) {
    const rosterRow = roster.find((r) => r.player?.id === sub.playerId);
    subs.push({
      playerId: sub.playerId,
      playerName: sub.player?.name,
      jerseyNumber:
        sub.jerseyNumber ??
        parseJerseyNumber(rosterRow?.jerseyNumber) ??
        null,
    });
  }

  return { slots, subs };
}

export function allStarterSlotsFilled(
  formation: Formation | null,
  slots: Record<string, SlotAssignment>,
): boolean {
  if (!formation) return false;
  return formation.slots.every((slot) => slots[slot.key] != null);
}

export function buildSetLineupPayload(
  teamId: number,
  formation: Formation,
  slots: Record<string, SlotAssignment>,
  subs: SubAssignment[],
): SetLineupPayload {
  const starters = formation.slots.map((slot) => {
    const assignment = slots[slot.key];
    if (!assignment) {
      throw new Error(`Missing player for slot ${slot.label}`);
    }
    return {
      playerId: assignment.playerId,
      slotKey: slot.key,
      ...(assignment.jerseyNumber != null
        ? { jerseyNumber: assignment.jerseyNumber }
        : {}),
    };
  });

  if (starters.length !== 11) {
    throw new Error("A lineup must have exactly 11 starters.");
  }

  return {
    teamId,
    formationId: formation.id,
    starters,
    substitutes: subs.slice(0, MAX_SUBSTITUTES).map((sub) => ({
      playerId: sub.playerId,
      ...(sub.jerseyNumber != null ? { jerseyNumber: sub.jerseyNumber } : {}),
    })),
  };
}

export function assignedPlayerIds(
  slots: Record<string, SlotAssignment>,
  subs: SubAssignment[],
  exceptPlayerId?: number,
): Set<number> {
  const ids = new Set<number>();
  for (const assignment of Object.values(slots)) {
    if (assignment.playerId !== exceptPlayerId) ids.add(assignment.playerId);
  }
  for (const sub of subs) {
    if (sub.playerId !== exceptPlayerId) ids.add(sub.playerId);
  }
  return ids;
}

/** Map public team-detail players into manage roster rows for the lineup editor. */
export function teamPlayersToRosterRows(
  players: ApiPlayerWithStats[],
  team: ApiTeam,
): LeagueRosterRow[] {
  return players.map((player) => ({
    id: player.id,
    status: "active",
    position: player.position ?? null,
    jerseyNumber: null,
    isCaptain: false,
    player: {
      id: player.id,
      name: player.name,
      avatarUrl: player.avatarUrl,
      position: player.position ?? null,
    },
    team,
  }));
}

export const MAX_LINEUP_SUBSTITUTES = MAX_SUBSTITUTES;
