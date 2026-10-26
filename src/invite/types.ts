import type { PickedImageFile } from "@/lib/picked-image";
import type { PlayerPosition } from "@/api/entities";

export type AcceptInviteResult =
  | { requiresProfile: true; token: string }
  | { requiresProfile: false; leagueId: number | null };


export type { PickedImageFile };

export type CompleteProfilePayload = {
  name: string;
  bio?: string;
  avatar?: PickedImageFile;
  countryId: number;
};

export type CompleteProfileResult = {
  leagueId: number | null;
};

export type InviteUser = {
  id: number;
  email: string;
  fullName: string | null;
};

export type GenerateInviteParams = {
  leagueId: number;
  seasonId: number;
  teamId: number | null;
  invitedUserId?: number;
};

export type GenerateInviteResult = {
  inviteLink: string;
};

export type UpdateLeaguePlayerPayload = {
  jerseyNumber?: string | null;
  position?: PlayerPosition | null;
  isCaptain?: boolean;
  status?: string;
};

export type ProcessInviteOutcome =
  | { kind: "requires_profile" }
  | { kind: "joined"; leagueId: number }
  | { kind: "auth_required" }
  | { kind: "wrong_account"; message: string }
  | { kind: "invalid"; message: string }
  | { kind: "already_joined"; message: string }
  | { kind: "error"; message: string };
