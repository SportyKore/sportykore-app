import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import type { ApiGameDetail } from "@/api/entities";
import { useTheme } from "@/color/use-theme";
import { Button } from "@/components/ui/Button";
import { AuthTextField } from "@/components/ui/auth-text-field";
import { colors } from "@/constants";
import { useAdaptiveLayout } from "@/hooks/useAdaptiveLayout";

import type { LeagueRosterRow } from "../../types";
import { AdvancedTrackingPanel } from "./AdvancedTrackingPanel";
import { PlayerActionRow } from "./PlayerPickRow";
import { TeamTabs, type TeamSide } from "./TeamTabs";

type Props = {
  game: ApiGameDetail;
  leagueId: number;
  seasonId: number;
  homeTeamId: number;
  awayTeamId: number;
  roster: LeagueRosterRow[];
  liveMinute: number;
  pendingTeam: "home" | "away" | null;
  scorerId: number | null;
  assistId: number | null;
  isOwnGoal: boolean;
  isPenalty: boolean;
  minute: string;
  scorePending: boolean;
  accreditPending: boolean;
  onIncrement: (team: "home" | "away") => void;
  onDecrement: (team: "home" | "away") => void;
  onSelectScorer: (playerId: number) => void;
  onSelectAssist: (playerId: number) => void;
  onToggleOwnGoal: () => void;
  onTogglePenalty: () => void;
  onMinuteChange: (value: string) => void;
  onLogGoal: () => void;
  onSkip: () => void;
};

export function HybridScoringPanel({
  game,
  leagueId,
  seasonId,
  homeTeamId,
  awayTeamId,
  roster,
  liveMinute,
  pendingTeam,
  scorerId,
  assistId,
  isOwnGoal,
  isPenalty,
  minute,
  scorePending,
  accreditPending,
  onIncrement,
  onDecrement,
  onSelectScorer,
  onSelectAssist,
  onToggleOwnGoal,
  onTogglePenalty,
  onMinuteChange,
  onLogGoal,
  onSkip,
}: Props) {
  const theme = useTheme();
  const { isTablet } = useAdaptiveLayout();
  const [activeSide, setActiveSide] = useState<TeamSide>("home");
  const accreditActive = pendingTeam != null;

  useEffect(() => {
    if (pendingTeam) setActiveSide(pendingTeam);
  }, [pendingTeam]);

  const activeTeamId = activeSide === "home" ? homeTeamId : awayTeamId;
  const players = useMemo(
    () =>
      roster.filter(
        (row) => row.team?.id === activeTeamId && row.status === "active",
      ),
    [roster, activeTeamId],
  );

  const scoreControls = (
      <View
        className="flex-row justify-between gap-4 rounded-[24px] border px-4 py-4"
        style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}
      >
        <ScoreSide
          label="Home"
          onMinus={() => onDecrement("home")}
          onPlus={() => onIncrement("home")}
          disabled={scorePending}
          theme={theme}
        />
        <ScoreSide
          label="Away"
          onMinus={() => onDecrement("away")}
          onPlus={() => onIncrement("away")}
          disabled={scorePending}
          theme={theme}
        />
      </View>
  );

  const accreditationCard = (
      <View
        className={`gap-3 rounded-[22px] border px-3 py-3 ${
          accreditActive ? "" : "opacity-60"
        }`}
        style={{
          backgroundColor: accreditActive ? theme.brandMuted : theme.cardMuted,
          borderColor: accreditActive ? theme.brand : theme.cardBorder,
        }}
        pointerEvents={accreditActive ? "auto" : "none"}
      >
        <View className="flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1">
            <Text
              className="text-xs uppercase tracking-[1.4px]"
              style={{ color: theme.textMuted }}
            >
              Select scorer and assist
            </Text>
            <Text
              className="pt-1 text-xs leading-5"
              style={{ color: theme.textSubtle }}
            >
              Choose a scorer, then optional assist.
            </Text>
          </View>
          {accreditActive ? (
            <View
              className="rounded-full px-2.5 py-1"
              style={{ backgroundColor: theme.accentMuted }}
            >
              <Text
                className="text-[10px] uppercase"
                style={{ color: theme.accent }}
              >
                Goal pending
              </Text>
            </View>
          ) : null}
        </View>

        <TeamTabs
          homeLabel={game.homeTeam?.name ?? "Home"}
          awayLabel={game.awayTeam?.name ?? "Away"}
          activeSide={activeSide}
          onSideChange={setActiveSide}
        />

        {players.length === 0 ? (
          <Text className="text-sm" style={{ color: theme.textSubtle }}>
            No active players on this team.
          </Text>
        ) : (
          <View
            className="overflow-hidden rounded-2xl border"
            style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}
          >
            <View
              className="flex-row items-center justify-end gap-2 border-b px-2.5 py-2"
              style={{ borderColor: theme.cardBorder }}
            >
              <Text
                className="w-16 text-center text-[10px] uppercase"
                style={{ color: theme.textSubtle }}
              >
                Goal
              </Text>
              <Text
                className="w-16 text-center text-[10px] uppercase"
                style={{ color: theme.textSubtle }}
              >
                Assist
              </Text>
            </View>
            <ScrollView
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
              style={{ maxHeight: 260 }}
              contentContainerClassName="px-2 py-2"
            >
              {players.map((row) => {
                const playerId = row.player.id;
                const assistDisabled =
                  !scorerId || isOwnGoal || playerId === scorerId;

                return (
                  <PlayerActionRow
                    key={row.id}
                    name={row.player.name}
                    jersey={row.jerseyNumber}
                    density="compact"
                    actions={[
                      {
                        key: "goal",
                        icon: "football-outline",
                        label: "Goal",
                        color: colors.accent,
                        selected: scorerId === playerId,
                        onPress: () => onSelectScorer(playerId),
                        accessibilityLabel: `Select ${row.player.name} as scorer`,
                      },
                      {
                        key: "assist",
                        icon: "git-merge-outline",
                        label: "Assist",
                        color: colors.accent,
                        selected: assistId === playerId,
                        disabled: assistDisabled,
                        onPress: () => onSelectAssist(playerId),
                        accessibilityLabel: `Select ${row.player.name} as assist`,
                      },
                    ]}
                  />
                );
              })}
            </ScrollView>
          </View>
        )}

        <View className="flex-row items-end justify-between gap-2">
          <View className="min-w-0 flex-1 flex-row flex-wrap gap-1.5">
            <Pressable
              onPress={onToggleOwnGoal}
              disabled={isPenalty}
              className={`h-9 flex-row items-center gap-1.5 rounded-full px-2.5 ${
                isPenalty ? "opacity-40" : ""
              }`}
              style={{ backgroundColor: theme.card }}
            >
              <Ionicons
                name={isOwnGoal ? "checkbox" : "square-outline"}
                size={16}
                color={isOwnGoal ? theme.accent : theme.textSubtle}
              />
              <Text className="text-xs" style={{ color: theme.text }}>
                Own goal
              </Text>
            </Pressable>

            <Pressable
              onPress={onTogglePenalty}
              disabled={isOwnGoal}
              className={`h-9 flex-row items-center gap-1.5 rounded-full px-2.5 ${
                isOwnGoal ? "opacity-40" : ""
              }`}
              style={{ backgroundColor: theme.card }}
            >
              <Ionicons
                name={isPenalty ? "checkbox" : "square-outline"}
                size={16}
                color={isPenalty ? theme.accent : theme.textSubtle}
              />
              <Text className="text-xs" style={{ color: theme.text }}>
                Penalty
              </Text>
            </Pressable>
          </View>

          <View className="w-20">
            <AuthTextField
              label="Min"
              value={minute}
              onChangeText={onMinuteChange}
              keyboardType="number-pad"
              editable={accreditActive}
            />
          </View>
        </View>

        <View className="flex-row gap-2 pt-1">
          <Button
            variant="authPurple"
            label="Log goal"
            className="h-11 flex-1 px-3"
            disabled={!accreditActive || scorerId == null}
            loading={accreditPending}
            onPress={onLogGoal}
          />
          <Button
            variant="secondary"
            label="Score only"
            className="h-11 flex-1 px-3"
            disabled={!accreditActive}
            onPress={onSkip}
          />
        </View>
      </View>
  );

  const tracker = (
    <AdvancedTrackingPanel
      game={game}
      leagueId={leagueId}
      seasonId={seasonId}
      roster={roster}
      liveMinute={liveMinute}
    />
  );

  if (isTablet) {
    return (
      <View className="flex-row items-start gap-5">
        <View className="min-w-0 flex-1 gap-5">
          {scoreControls}
          {accreditationCard}
        </View>
        <View className="min-w-0 flex-1">
          {tracker}
        </View>
      </View>
    );
  }

  return (
    <View className="gap-5">
      {scoreControls}
      {accreditationCard}
      {tracker}
    </View>
  );
}

function ScoreSide({
  label,
  onMinus,
  onPlus,
  disabled,
  theme,
}: {
  label: string;
  onMinus: () => void;
  onPlus: () => void;
  disabled?: boolean;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View className="flex-1 items-center gap-2">
      <Text
        className="text-xs uppercase tracking-wide"
        style={{ color: theme.textMuted }}
      >
        {label}
      </Text>
      <View className="flex-row items-center gap-3">
        <Pressable
          onPress={onMinus}
          disabled={disabled}
          className="h-12 w-12 items-center justify-center rounded-full"
          style={{ backgroundColor: theme.cardMuted }}
        >
          <Ionicons name="remove" size={24} color={theme.text} />
        </Pressable>
        <Pressable
          onPress={onPlus}
          disabled={disabled}
          className="h-12 w-12 items-center justify-center rounded-full"
          style={{ backgroundColor: theme.accent }}
        >
          <Ionicons name="add" size={24} color={theme.textInverse} />
        </Pressable>
      </View>
    </View>
  );
}
