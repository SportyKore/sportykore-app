import type {
  GameStatus as ApiGameStatus,
  ApiPlayer,
  ApiSeason,
  ApiTeam,
  CompetitionFormat,
  GroupStageConfig,
  KnockoutStageConfig,
  PlayerPosition,
  SeasonStatus,
} from "@/api/entities";
import type { TiebreakerRule } from "@/league/tiebreaker-options";

export type LeagueStatus = "active" | "inactive";

export type OwnedLeague = {
  id: number;
  name: string;
  logoUrl: string | null;
  status?: LeagueStatus;
  countryId: number;
  startDate?: string | null;
  endDate?: string | null;
  activeSeason?: {
    id: number;
    name: string;
    status: SeasonStatus;
  } | null;
  role?: "owner";
};

export type AdminTeamManaged = {
  id: number;
  name: string;
  logoUrl: string | null;
  league: {
    id: number;
    name: string;
    logoUrl: string | null;
    status?: LeagueStatus;
    startDate?: string | null;
    endDate?: string | null;
  };
  activeSeason: {
    id: number;
    name: string;
    status: SeasonStatus;
  } | null;
  role: "team_admin";
};

export type ManagedHub = {
  ownedLeagues: OwnedLeague[];
  adminTeams: AdminTeamManaged[];
};

export type TeamAdminUser = {
  id: number;
  email: string;
  fullName: string | null;
};

/** Active team manager row from `GET /api/v1/auth/users/leagues/:leagueId/teams`. */
export type TeamAdmin = {
  id: number;
  teamId: number;
  userId: number;
  leagueId: number;
  user: TeamAdminUser;
};

export type ManagedTeam = ApiTeam & {
  admins?: TeamAdmin[];
};

export type LeagueRosterRow = {
  id: number;
  status: string;
  position: PlayerPosition | null;
  jerseyNumber: string | null;
  isCaptain: boolean;
  player: ApiPlayer & { userId?: number | null };
  team: ApiTeam | null;
};

export type CreateGamePayload = {
  leagueId: number;
  seasonId: number;
  homeTeamId: number;
  awayTeamId: number;
  playedAt: string;
  venueName?: string;
  venueId?: number;
  status?: ApiGameStatus;
  homeScore?: number | null;
  awayScore?: number | null;
  firstHalfDuration?: number;
  secondHalfDuration?: number;
};

export type UpdateGamePayload = {
  homeScore?: number | null;
  awayScore?: number | null;
  currentMinute?: number;
  status?: ApiGameStatus;
  playedAt?: string;
  venueName?: string | null;
  venueId?: number | null;
};

export type CreateVenuePayload = {
  name: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  googlePlaceId?: string | null;
  capacity?: number | null;
  city?: string | null;
  notes?: string | null;
};

export type UpdateVenuePayload = {
  name?: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  googlePlaceId?: string | null;
  capacity?: number | null;
  city?: string | null;
  notes?: string | null;
};

export type CreateStatPayload = {
  gameId: number;
  leagueId: number;
  seasonId: number;
  teamId: number;
  playerId: number;
  statTypeId: number;
  relatedPlayerId?: number;
  minute?: number;
  isStoppageTime?: boolean;
};

export type UpdateStatPayload = {
  relatedPlayerId?: number | null;
  minute?: number | null;
  isStoppageTime?: boolean;
  isPenalty?: boolean;
  value?: string | null;
  numericValue?: number;
};

export type RecordSubstitutionItem = {
  playerOffId: number;
  playerOnId: number;
  minute: number;
  isStoppageTime?: boolean;
};

export type RecordSubstitutionsPayload = {
  gameId: number;
  leagueId: number;
  seasonId: number;
  teamId: number;
  substitutions: RecordSubstitutionItem[];
};

export type RecordSubstitutionsResult = {
  message: string;
  statIds: number[];
};

export type TrackingEventType = "pass" | "shot";

export type TrackingEventPayload = {
  clientEventId: string;
  type: TrackingEventType;
  teamId: number;
  playerId: number;
  minute?: number | null;
  isStoppageTime?: boolean;
  completed?: boolean;
  onTarget?: boolean;
};

export type RecordTrackingEventsPayload = {
  events: TrackingEventPayload[];
};

export type RecordTrackingEventsResult = {
  message: string;
  accepted: number;
  skipped: number;
};

export type UpdateLeaguePayload = {
  name?: string;
  description?: string | null;
  gender?: string | null;
  tiebreaker?: TiebreakerRule;
  startDate?: string | null;
  endDate?: string | null;
};

export type CreateSeasonPayload = {
  leagueId: number;
  name: string;
  status: SeasonStatus;
  format?: CompetitionFormat;
  knockout?: {
    name?: string;
    config: KnockoutStageConfig;
  };
  group?: {
    name?: string;
    config?: GroupStageConfig;
  };
};

export type UpdateSeasonPayload = {
  name?: string;
  status?: SeasonStatus;
};

export type CreatedSeason = ApiSeason & {
  leagueId: number;
  createdAt?: string;
  updatedAt?: string;
  stageId?: number;
  format?: CompetitionFormat;
  seeded?: boolean;
};

export const GameStatus = {
  Scheduled: "scheduled",
  FirstHalf: "first_half",
  HalfTime: "half_time",
  SecondHalf: "second_half",
  ExtraTime: "extra_time",
  PenaltyShootout: "penalty_shootout",
  FullTime: "full_time",
  Paused: "paused",
  Postponed: "postponed",
  Cancelled: "cancelled",
  /** @deprecated */
  Live: "live",
  /** @deprecated */
  Break: "break",
  /** @deprecated */
  Completed: "completed",
} as const;

export const SeasonStatusEnum = {
  Inactive: "inactive",
  Active: "active",
  Completed: "completed",
} as const;

export const RosterPosition = {
  Attack: "attack",
  Defence: "defence",
  Midfield: "midfield",
  Goalkeeper: "goalkeeper",
} as const;

/** Map statTypes[].name to Match Center actions. */
export const MatchEventStatName = {
  Goal: "goals",
  Assist: "assists",
  OwnGoal: "own_goal",
  Yellow: "yellow_card",
  Red: "red_card",
  Save: "saves",
} as const;

export type MatchEventKey = keyof typeof MatchEventStatName;
