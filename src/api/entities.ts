/**
 * Shared API entity shapes mirroring `documentations/ROUTES.md` transformers.
 * Detail screens (league, team, player, match) consume these as the single
 * source of truth for response types.
 */

import type { TiebreakerRule } from "@/league/tiebreaker-options";
import type { TeamLineupGroup } from "@/lineup/types";

export type ApiCountry = {
  id: number;
  name: string;
  code: string;
};

export type ApiLeague = {
  id: number;
  name: string;
  logoUrl: string | null;
  status?: "active" | "inactive";
  games?: ApiGame[];
  description: string;
  tiebreaker?: TiebreakerRule | null;
  startDate: string | null;
  endDate: string | null;
};

export type ApiTeam = {
  id: number;
  name: string;
  logoUrl: string | null;
};

export type ApiVenue = {
  id: number;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  googlePlaceId: string | null;
  capacity: number | null;
  city: string | null;
  notes: string | null;
};

/** Nested venue on game serializers (subset of full Venue). */
export type ApiGameVenue = {
  id: number;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  capacity: number | null;
};

export type PlayerPosition = "attack" | "defence" | "midfield" | "goalkeeper";

export type ApiPlayer = {
  id: number;
  name: string;
  avatarUrl?: string | null;
  position?: PlayerPosition | null;
  bio?: string | null;
  primaryPosition?: PlayerPosition | null;
  secondaryPosition?: PlayerPosition | null;
  preferredFoot?: "left" | "right" | "both" | null;
  heightCm?: number | null;
  city?: string | null;
  state?: string | null;
  nationality?: string | null;
  socialLinks?: ApiPlayerSocialLink[];
  visibility?: "active" | "private";
  age?: number | null;
  country?: ApiCountry | null;
  highlights?: ApiPlayerHighlight[];
  awards?: ApiPlayerAward[];
};

export type PlayerSocialPlatform =
  | "instagram"
  | "tiktok"
  | "youtube"
  | "x"
  | "facebook"
  | "website";

export type ApiPlayerSocialLink = {
  id: number;
  platform: PlayerSocialPlatform;
  url: string;
  handle?: string | null;
};

export type CoachAvailability = "open" | "not_open" | "consulting";

export type ApiCoachProfile = {
  id: number;
  displayName: string;
  photoUrl?: string | null;
  bio?: string | null;
  experience?: string | null;
  qualifications?: string | null;
  philosophy?: string | null;
  city?: string | null;
  state?: string | null;
  availability?: CoachAvailability;
  visibility?: "public" | "private";
  country?: ApiCountry | null;
  socialLinks?: ApiPlayerSocialLink[];
  leagues?: ApiCoachLeagueHistory[];
};

export type ApiCoachLeagueHistory = {
  id: number;
  role: "team_admin";
  active: boolean;
  assignedAt?: string | null;
  removedAt?: string | null;
  league: {
    id: number;
    name: string;
    logoUrl?: string | null;
  };
  team: ApiTeam;
};

export type ApiPlayerHighlight = {
  id: number;
  videoId: string;
  title?: string | null;
  sortOrder: number;
  thumbnailUrl?: string | null;
};

export type PlayerAwardType = "motm";

export type ApiPlayerAward = {
  id: number;
  gameId: number;
  playerId: number | null;
  awardType: PlayerAwardType;
  awardedBy?: number | null;
  player?: ApiPlayer;
  game?: ApiGame;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type ApiStatType = {
  id: number;
  name: string;
  displayName: string;
  iconName: string | null;
  category: string | null;
};

export type ApiStat = {
  id: number;
  minute: number | null;
  isStoppageTime: boolean | null;
  numericValue: number | null;
  clientEventId?: string | null;
  qualifiers?: Record<string, unknown>;
  /** True when a goal stat has no accredited player yet. */
  isUnaccredited?: boolean;
  /** True when a `goals` stat was scored from a penalty kick in regular play. */
  isPenalty?: boolean;
  type?: ApiStatType;
  team?: ApiTeam;
  player?: ApiPlayer;
  relatedPlayer?: ApiPlayer;
};

export type ApiTrackingTeamMetrics = {
  teamId: number;
  passesAttempted: number;
  passesCompleted: number;
  passCompletionPct: number;
  possessionPct: number;
  shotsAttempted: number;
  shotsOnTarget: number;
  shotAccuracyPct: number;
};

export type ApiMatchTrackingMetrics = {
  possessionTracked: boolean;
  teams: {
    home: ApiTrackingTeamMetrics;
    away: ApiTrackingTeamMetrics;
  };
};

export type ApiPlayerWithStats = ApiPlayer & {
  stats: ApiStat[];
};

export type StandingZoneType =
  | "promotion"
  | "promotion_playoff"
  | "playoff"
  | "relegation_playoff"
  | "relegation"
  | "qualified";

export type ApiStandingZoneTag = {
  type: StandingZoneType;
  label?: string | null;
};

export type ApiStanding = {
  id: number;
  position: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  form: string | null;
  team?: ApiTeam;
  pointsAdjustment?: number | null;
  adjustmentReasons?: string[];
  manuallyAdjusted?: boolean;
  overrideReason?: string | null;
  zone?: ApiStandingZoneTag | null;
};

export type ApiStageGroup = {
  id: number;
  stageId: number;
  name: string;
  sequence: number;
};

export type ApiStandingAdjustment = {
  id: number;
  stageId: number;
  teamId: number;
  stageGroupId?: number | null;
  pointsDelta: number;
  reason: string;
  team?: ApiTeam;
};

export type ApiStandingOverride = {
  id: number;
  stageId: number;
  teamId: number;
  stageGroupId?: number | null;
  manualRank: number;
  reason: string;
  cohortSignature: string;
  stale?: boolean;
  team?: ApiTeam;
};

export type ApiStandingZone = {
  id: number;
  stageId: number;
  stageGroupId?: number | null;
  zoneType: StandingZoneType;
  fromPosition: number;
  toPosition: number;
  label?: string | null;
};

export type ApiStageStandingsTable = {
  stageGroupId: number | null;
  stageGroupName: string | null;
  sequence: number | null;
  rows: ApiStanding[];
  staleOverrides: ApiStandingOverride[];
};

export type ApiStageStandings = {
  stage: ApiStage;
  tables: ApiStageStandingsTable[];
};

export type ApiAdminAuditLog = {
  id: number;
  leagueId: number;
  action: string;
  actorId?: number | null;
  actorName?: string | null;
  targetType?: string | null;
  targetId?: number | null;
  targetLabel?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
};

export type GameStatus =
  | "scheduled"
  | "first_half"
  | "half_time"
  | "second_half"
  | "extra_time"
  | "penalty_shootout"
  | "full_time"
  | "paused"
  | "postponed"
  | "cancelled"
  /** @deprecated Use `first_half` / `second_half` / `extra_time` */
  | "live"
  /** @deprecated Use `half_time` */
  | "break"
  /** @deprecated Use `full_time` */
  | "completed";

/** Period status stored when a match is paused. */
export type PausedFromStatus =
  | "first_half"
  | "second_half"
  | "extra_time"
  | "penalty_shootout"
  | "live";

export type StageType = "round_robin" | "group" | "knockout" | "playoff" | "swiss";
export type StageStatus = "upcoming" | "active" | "completed";
export type TieFormat = "single" | "two_legged" | "best_of";
export type TieStatus = "pending" | "in_progress" | "completed";
export type BracketRound =
  | "r256"
  | "r128"
  | "r64"
  | "r32"
  | "r16"
  | "qf"
  | "sf"
  | "final"
  | "third_place";

export type CompetitionFormat = "league" | "knockout" | "group" | "swiss";

export type KnockoutTieConfig = {
  tie_format: TieFormat;
  best_of?: number;
  away_goals?: boolean;
};

export type KnockoutStageConfig = {
  format?: {
    starting_round?: BracketRound;
    has_third_place?: boolean;
  };
  ties: {
    default: KnockoutTieConfig;
    rounds?: Partial<Record<BracketRound, KnockoutTieConfig>>;
  };
};

export type GroupStageConfig = {
  format: {
    group_count: number;
    double_round_robin: boolean;
  };
  advancement: {
    per_group: number;
  };
};

export type SwissByeHandling = "warn" | "award_points" | "exclude";
export type SwissPlayoffPairing = "rank_cross" | "seeded";

export type SwissQualificationRule = {
  directCount: number;
  playoffRankFrom: number;
  playoffRankTo: number;
  playoffPairing?: SwissPlayoffPairing;
};

export type SwissStageConfig = {
  format: {
    rounds: number;
    byeHandling: SwissByeHandling;
    seed?: number;
  };
  qualification: SwissQualificationRule;
  /** Per-group override, keyed by stageGroupId (as a string key). */
  qualificationByGroup?: Record<string, SwissQualificationRule>;
  constraints?: {
    noPair?: { teamIds: number[] }[];
  };
};

export type ApiStage = {
  id: number;
  seasonId: number;
  name: string;
  stageType: StageType;
  sequence: number;
  status: StageStatus;
  sourceStageId?: number | null;
  config:
    | KnockoutStageConfig
    | GroupStageConfig
    | SwissStageConfig
    | Record<string, unknown>;
  groups?: ApiStageGroup[];
};

export type SwissProposedFixture = { homeTeamId: number; awayTeamId: number };

export type SwissPairingConflict =
  | { type: "rematch"; teamIds: [number, number] }
  | { type: "no_pair_violation"; teamIds: [number, number] }
  | { type: "unresolved_team"; teamIds: number[] };

export type ApiSwissProposeResult = {
  fixtures: SwissProposedFixture[];
  conflicts: SwissPairingConflict[];
  unresolvedTeamIds: number[];
  byeTeamId: number | null;
};

export type ApiSwissQualificationResult = {
  stageGroupId: number;
  stageGroupName: string;
  direct: ApiStanding[];
  playoffCandidates: ApiStanding[];
  eliminated: ApiStanding[];
  rule: SwissQualificationRule;
};

export type ApiSwissPlayoffProposal = {
  fixtures: SwissProposedFixture[];
  byeTeamId: number | null;
};

export type ApiSwissKnockoutPreviewGroup = {
  stageGroupId: number;
  stageGroupName: string;
  ready: boolean;
  reason?: string;
  qualifierTeamIds: number[];
};

export type ApiSwissKnockoutPreview = {
  groups: ApiSwissKnockoutPreviewGroup[];
  ready: boolean;
  qualifierTeamIds: number[];
};

export type ApiTie = {
  id: number;
  stageId: number;
  round: BracketRound;
  bracketPosition: number;
  tieFormat: TieFormat;
  bestOf: number | null;
  targetWins: number | null;
  awayGoals: boolean;
  isBye: boolean;
  homeScoreAgg: number | null;
  awayScoreAgg: number | null;
  status: TieStatus;
  homeTeam?: ApiTeam | null;
  awayTeam?: ApiTeam | null;
  winnerTeam?: ApiTeam | null;
  games?: ApiGame[];
};

export type ApiGame = {
  id: number;
  status: GameStatus;
  playedAt: string;
  homeScore: number | null;
  awayScore: number | null;
  venueName: string | null;
  venueId?: number | null;
  venue?: ApiGameVenue | null;
  currentMinute: number;
  firstHalfDuration?: number;
  secondHalfDuration?: number;
  extraTimeDuration?: number | null;
  firstHalfStartedAt?: string | null;
  secondHalfStartedAt?: string | null;
  extraTimeStartedAt?: string | null;
  pausedAt?: string | null;
  pausedFromStatus?: PausedFromStatus | null;
  stageId?: number | null;
  stageGroupId?: number | null;
  roundNumber?: number | null;
  tieId?: number | null;
  leg?: number | null;
  round?: BracketRound | null;
  bracketPosition?: number | null;
  homePenaltyScore?: number | null;
  awayPenaltyScore?: number | null;
  homeTeam?: ApiTeam;
  awayTeam?: ApiTeam;
  winnerTeam?: ApiTeam | null;
  awards?: ApiPlayerAward[];
};

export type ApiGameDetail = ApiGame & {
  league?: ApiLeague;
  stats: ApiStat[];
  tracking?: ApiMatchTrackingMetrics;
  lineups?: TeamLineupGroup[];
};

export type SeasonStatus = "inactive" | "active" | "completed";

export type ApiSeason = {
  id: number;
  name: string;
  status: SeasonStatus;
};

export type ApiSeasonDetail = ApiSeason & {
  league: ApiLeague;
  games: ApiGame[];
  standings: ApiStanding[];
  stats: ApiStat[];
  stages?: ApiStage[];
};

/** Wire shape of `GET /api/v1/leagues/:leagueId` - the available seasons plus the active season detail. */
export type ApiLeagueDetail = {
  seasons: ApiSeason[];
  season: ApiSeasonDetail;
  statTypes: ApiStatType[];
};

export type ApiTeamSeason = {
  id: number;
  name: string;
  status: SeasonStatus;
  // Backend may omit these arrays when empty, so consumers must default to `[]`.
  games?: ApiGame[];
  standings?: ApiStanding[];
  players?: ApiPlayerWithStats[];
};

export type ApiTeamLeague = {
  id: number;
  name: string;
  logoUrl: string | null;
  seasons: ApiTeamSeason[];
};

/** Wire shape of `GET /api/v1/teams/:id`. Mirrors player detail: league → season grouping. */
export type ApiTeamDetail = {
  team: ApiTeam;
  statTypes: ApiStatType[];
  leagues: ApiTeamLeague[];
};

export type ApiPlayerSeason = {
  id: number;
  name: string;
  status: SeasonStatus;
  team: ApiTeam;
  // The backend may omit these arrays when empty, so consumers must default to `[]`.
  games?: ApiGame[];
  stats?: ApiStat[];
};

export type ApiPlayerLeague = {
  id: number;
  name: string;
  logoUrl: string | null;
  seasons: ApiPlayerSeason[];
};

/** Wire shape of `GET /api/v1/players/:id`. Stats and games are grouped per league → season. */
export type ApiPlayerDetail = {
  player: ApiPlayer & { country?: ApiCountry | null };
  statTypes: ApiStatType[];
  leagues: ApiPlayerLeague[];
};
