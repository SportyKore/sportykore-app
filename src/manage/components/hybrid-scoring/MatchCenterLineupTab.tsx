import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import type { ApiGameDetail, ApiPlayerAward, GameStatus } from "@/api/entities";
import { useAppearance } from "@/color/appearance-context";
import { useTheme } from "@/color/use-theme";
import { BottomSheetModal } from "@/components/ui/bottom-sheet-modal";
import { EntityLogo } from "@/components/ui/entity-logo";
import { LineupEditor } from "@/lineup/components/LineupEditor";
import { useSetMotmAward } from "@/manage/hooks";
import type { LeagueRosterRow } from "@/manage/types";

import { MatchCenterSubstitutionPanel } from "./MatchCenterSubstitutionPanel";
import { TeamTabs, type TeamSide } from "./TeamTabs";

const LIVE_SUB_STATUSES = new Set<GameStatus>([
  "first_half",
  "half_time",
  "second_half",
  "extra_time",
  "penalty_shootout",
  "paused",
  "live",
]);

type Props = {
  game: ApiGameDetail;
  leagueId: number;
  seasonId: number;
  homeTeamId: number;
  awayTeamId: number;
  roster: LeagueRosterRow[];
  onMotmSaved?: (award: ApiPlayerAward) => void;
};

type MotmCandidate = {
  playerId: number;
  name: string;
  avatarUrl?: string | null;
  teamId: number;
  teamName: string;
  jerseyNumber: number | null;
  role: "Starter" | "Substitute";
};

export function MatchCenterLineupTab({
  game,
  leagueId,
  seasonId,
  homeTeamId,
  awayTeamId,
  roster,
  onMotmSaved,
}: Props) {
  const theme = useTheme();
  const [activeSide, setActiveSide] = useState<TeamSide>("home");
  const motmMutation = useSetMotmAward(game.id, leagueId, seasonId);
  const activeTeamId = activeSide === "home" ? homeTeamId : awayTeamId;

  const teamRoster = useMemo(
    () => roster.filter((row) => row.team?.id === activeTeamId),
    [roster, activeTeamId],
  );

  const subEnabled = LIVE_SUB_STATUSES.has(game.status);
  const motmCandidates = useMemo(() => {
    const candidates: MotmCandidate[] = [];
    for (const group of game.lineups ?? []) {
      for (const entry of [...group.starters, ...group.substitutes]) {
        if (entry.status !== "starter" && entry.status !== "substitute") {
          continue;
        }
        candidates.push({
          playerId: entry.playerId,
          name: entry.player.name,
          avatarUrl: entry.player.avatarUrl,
          teamId: entry.teamId,
          teamName: group.team.name,
          jerseyNumber: entry.jerseyNumber,
          role: entry.status === "starter" ? "Starter" : "Substitute",
        });
      }
    }
    return candidates.sort((a, b) => {
      const byTeam = a.teamName.localeCompare(b.teamName);
      if (byTeam !== 0) return byTeam;
      return (a.jerseyNumber ?? 999) - (b.jerseyNumber ?? 999);
    });
  }, [game.lineups]);

  const handleSetMotm = async (playerId: number) => {
    try {
      const award = await motmMutation.mutateAsync(playerId);
      onMotmSaved?.(award);
    } catch {
      /* Toasted by hook. */
    }
  };

  return (
    <View className="gap-4">
      <MotmAwardCard
        award={game.awards?.find((row) => row.awardType === "motm") ?? null}
        candidates={motmCandidates}
        pending={motmMutation.isPending}
        onSelect={(playerId) => void handleSetMotm(playerId)}
      />

      <View
        className="gap-4 rounded-[24px] border px-4 py-4"
        style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}
      >
        <TeamTabs
          homeLabel={game.homeTeam?.name ?? "Home"}
          awayLabel={game.awayTeam?.name ?? "Away"}
          activeSide={activeSide}
          onSideChange={setActiveSide}
        />

        <MatchCenterSubstitutionPanel
          game={game}
          leagueId={leagueId}
          seasonId={seasonId}
          teamId={activeTeamId}
          enabled={subEnabled}
        />
      </View>

      <View
        className="gap-4 rounded-[24px] border px-4 py-4"
        style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}
      >
        {teamRoster.length === 0 ? (
          <Text className="text-sm" style={{ color: theme.textSubtle }}>
            No players on this team for the season.
          </Text>
        ) : (
          <LineupEditor
            gameId={game.id}
            teamId={activeTeamId}
            roster={roster}
            gameStatus={game.status}
            embedded
          />
        )}
      </View>
    </View>
  );
}

function MotmAwardCard({
  award,
  candidates,
  pending,
  onSelect,
}: {
  award: ApiPlayerAward | null;
  candidates: MotmCandidate[];
  pending: boolean;
  onSelect: (playerId: number) => void;
}) {
  const { isDark } = useAppearance();
  const theme = useTheme();
  const [pickerOpen, setPickerOpen] = useState(false);
  const currentPlayer = award?.player;
  const currentName =
    currentPlayer?.name ??
    candidates.find((candidate) => candidate.playerId === award?.playerId)?.name ??
    null;
  const hasCandidates = candidates.length > 0;

  const handlePick = (playerId: number) => {
    setPickerOpen(false);
    onSelect(playerId);
  };

  return (
    <>
      <View
        className="gap-4 rounded-[24px] border px-4 py-4"
        style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}
      >
        <View className="flex-row items-start gap-3">
          <View
            className="h-10 w-10 items-center justify-center rounded-2xl"
            style={{ backgroundColor: theme.accentMuted }}
          >
            <Ionicons name="star-outline" size={19} color={theme.accent} />
          </View>
          <View className="min-w-0 flex-1">
            <Text style={{ color: theme.text }}>
              Man of the match
            </Text>
            <Text
              className="pt-1 text-xs leading-5"
              style={{ color: theme.textSubtle }}
            >
              Pick from the submitted lineups for this game.
            </Text>
          </View>
        </View>

        <View
          className="flex-row items-center gap-3 rounded-2xl border px-3 py-3"
          style={{ backgroundColor: theme.accentMuted, borderColor: theme.accent }}
        >
          <EntityLogo
            logoUrl={currentPlayer?.avatarUrl}
            variant="player"
            size="sm"
            tone={isDark ? "dark" : "light"}
          />
          <View className="min-w-0 flex-1">
            <Text className="text-sm" style={{ color: theme.accent }}>
              {currentName ?? "Not selected yet"}
            </Text>
            <Text className="pt-0.5 text-xs" style={{ color: theme.textMuted }}>
              {currentName
                ? "Shown on the match page and player profile."
                : hasCandidates
                  ? "Choose the standout player after the match."
                  : "Submit at least one lineup before choosing MOTM."}
            </Text>
          </View>
        </View>

        <Pressable
          onPress={() => setPickerOpen(true)}
          disabled={!hasCandidates || pending}
          accessibilityRole="button"
          accessibilityLabel="Choose man of the match"
          className={`h-12 flex-row items-center justify-center gap-2 rounded-full border px-4 active:opacity-90 ${
            !hasCandidates || pending ? "opacity-45" : ""
          }`}
          style={{ backgroundColor: theme.accent, borderColor: theme.accent }}
        >
          {pending ? (
            <ActivityIndicator color={theme.textInverse} />
          ) : (
            <Ionicons name="star" size={17} color={theme.textInverse} />
          )}
          <Text className="text-sm" style={{ color: theme.textInverse }}>
            {currentName ? "Change MOTM" : "Choose MOTM"}
          </Text>
        </Pressable>
      </View>

      <BottomSheetModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Choose MOTM"
        subtitle="Only players from submitted lineups are available."
      >
        <View className="gap-2">
          {candidates.map((candidate) => {
            const selected = candidate.playerId === award?.playerId;
            return (
              <Pressable
                key={`${candidate.teamId}-${candidate.playerId}`}
                onPress={() => handlePick(candidate.playerId)}
                disabled={pending}
                accessibilityRole="button"
                accessibilityLabel={`Choose ${candidate.name} as man of the match`}
                className="flex-row items-center gap-3 rounded-2xl border px-3 py-3 active:opacity-85"
                style={{
                  backgroundColor: selected ? theme.accentMuted : theme.cardMuted,
                  borderColor: selected ? theme.accent : theme.cardBorder,
                }}
              >
                <EntityLogo
                  logoUrl={candidate.avatarUrl}
                  variant="player"
                  size="sm"
                  tone={isDark ? "dark" : "light"}
                />
                <View className="min-w-0 flex-1">
                  <Text
                    className="text-sm"
                    style={{ color: theme.text }}
                    numberOfLines={1}
                  >
                    {candidate.name}
                  </Text>
                  <Text
                    className="pt-0.5 text-xs"
                    style={{ color: theme.textSubtle }}
                    numberOfLines={1}
                  >
                    {[
                      candidate.teamName,
                      candidate.role,
                      candidate.jerseyNumber != null
                        ? `#${candidate.jerseyNumber}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                </View>
                {selected ? (
                  <Ionicons name="checkmark-circle" size={21} color={theme.accent} />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </BottomSheetModal>
    </>
  );
}
