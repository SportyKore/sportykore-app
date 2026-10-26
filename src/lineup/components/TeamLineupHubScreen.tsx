import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import type { ApiGame, GameStatus } from "@/api/entities";
import { useAppearance } from "@/color/appearance-context";
import { useTheme } from "@/color/use-theme";
import { EntityLogo } from "@/components/ui";
import { BlackPatternBackground } from "@/components/ui/black-pattern-background";
import { ErrorState } from "@/components/ui/error-state";
import { colors } from "@/constants";
import { useAdaptiveLayout } from "@/hooks/useAdaptiveLayout";
import { formatPlayedAtShortDate, formatPlayedAtTime } from "@/lib/datetime";
import { messageForResourceLoad } from "@/lib/show-error-toast";
import { ManagePlayersTab } from "@/manage";
import { useTeamDetail } from "@/team";

type Props = {
  leagueId: number;
  teamId: number;
  seasonId: number;
};

const EDITABLE_STATUSES: GameStatus[] = ["scheduled", "postponed"];

function statusLabel(status: GameStatus): string {
  if (status === "scheduled") return "Upcoming";
  if (status === "postponed") return "Postponed";
  if (
    status === "first_half" ||
    status === "second_half" ||
    status === "extra_time" ||
    status === "paused" ||
    status === "half_time" ||
    status === "live"
  ) {
    return "Live";
  }
  if (status === "full_time" || status === "completed") return "FT";
  if (status === "cancelled") return "Cancelled";
  return status;
}

function opponentFor(game: ApiGame, teamId: number) {
  if (game.homeTeam?.id === teamId) return game.awayTeam;
  if (game.awayTeam?.id === teamId) return game.homeTeam;
  return null;
}

export function TeamLineupHubScreen({ leagueId, teamId, seasonId }: Props) {
  const router = useRouter();
  const teamQuery = useTeamDetail(teamId);
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { isDark } = useAppearance();
  const { isTablet, isWideTablet } = useAdaptiveLayout();
  const tabletMaxWidth = isWideTablet ? 1120 : 920;
  const tabletFrameStyle = isTablet
    ? { alignSelf: "center" as const, width: "100%" as const, maxWidth: tabletMaxWidth }
    : undefined;
  const leagueBlock = useMemo(() => {
    const leagues = teamQuery.data?.leagues ?? [];
    return (
      leagues.find((entry) => entry.id === leagueId) ??
      leagues[0] ??
      null
    );
  }, [teamQuery.data, leagueId]);

  const seasonBlock = useMemo(() => {
    const seasons = leagueBlock?.seasons ?? [];
    if (seasonId > 0) {
      return seasons.find((entry) => entry.id === seasonId) ?? null;
    }
    return (
      seasons.find((entry) => entry.status === "active") ??
      seasons[0] ??
      null
    );
  }, [leagueBlock, seasonId]);

  const resolvedSeasonId = seasonBlock?.id ?? (seasonId > 0 ? seasonId : 0);
  const teamGames = useMemo(() => {
    const games = seasonBlock?.games ?? [];
    return [...games].sort(
      (a, b) =>
        new Date(a.playedAt).getTime() - new Date(b.playedAt).getTime(),
    );
  }, [seasonBlock]);

  const teamInfo = teamQuery.data?.team ?? null;
  const leagueName = leagueBlock?.name;

  const openLineup = (gameId: number) => {
    router.push(
      `/manage/${leagueId}/team/${teamId}/lineup/${gameId}?seasonId=${resolvedSeasonId}`,
    );
  };

  return (
    <View className="flex-1" style={{ backgroundColor: theme.background }}>
      <SafeAreaView className="flex-1" edges={["top"]}>
        <BlackPatternBackground
          baseColor={isDark ? colors.scoreboardBlack : theme.patternBase}
          stripeColor={theme.patternStripe}
        />

        <View className="px-5 pb-2">
          <View style={tabletFrameStyle}>
          <View className="flex-row items-center gap-3 pb-4 pt-2">
            <Pressable
              onPress={() => router.back()}
              accessibilityLabel="Go back"
              className="h-11 w-11 items-center justify-center rounded-full active:opacity-80"
              style={{ backgroundColor: isDark ? theme.card : theme.brandMuted }}
            >
              <Ionicons name="chevron-back" size={22} color={theme.text} />
            </Pressable>
            <View className="flex-1">
              <Text
                className="text-xl"
                style={{ color: theme.text }}
              >
                {teamInfo?.name ?? "Team"}
              </Text>
              {leagueName ? (
                <Text
                  className="text-sm"
                  style={{ color: theme.textSubtle }}
                >
                  {leagueName}
                </Text>
              ) : null}
            </View>
          </View>

          {teamInfo ? (
            <View className="mb-3 flex-row items-center gap-3">
              <EntityLogo
                logoUrl={teamInfo.logoUrl}
                variant="team"
                size="sm"
                tone={isDark ? "dark" : "light"}
              />
              <Text
                className="flex-1 text-sm"
                style={{ color: theme.textSubtle }}
              >
                Manage your squad and set lineups for fixtures.
              </Text>
            </View>
          ) : null}
          </View>
        </View>

        <ScrollView
          className="flex-1 px-5"
          contentContainerClassName="gap-6 pb-12"
          contentContainerStyle={{
            paddingBottom: insets.bottom + 90,
            ...(isTablet ? { alignItems: "center" as const } : null),
          }}
          showsVerticalScrollIndicator={false}
        >
          <View className="w-full" style={tabletFrameStyle}>
          {teamQuery.isLoading ? (
            <View className="items-center py-16">
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : teamQuery.isError || !teamQuery.data ? (
            <ErrorState
              message={
                teamQuery.isError
                  ? messageForResourceLoad(teamQuery.error, "Team")
                  : "Team not found."
              }
              onRetry={() => teamQuery.refetch()}
            />
          ) : !seasonBlock ? (
            <View
              className="rounded-[22px] border border-dashed px-5 py-8"
              style={{
                backgroundColor: theme.cardMuted,
                borderColor: theme.cardBorder,
              }}
            >
              <Text
                className="text-base"
                style={{ color: theme.text }}
              >
                No active season
              </Text>
              <Text
                className="pt-2 text-sm leading-6"
                style={{ color: theme.textSubtle }}
              >
                Ask the league admin to activate a season before setting
                lineups.
              </Text>
            </View>
          ) : (
            <View className={isTablet ? "flex-row items-start gap-5" : "gap-6"}>
              <View className="gap-3" style={isTablet ? { flex: 1.25 } : undefined}>
                <FixturesList
                  games={teamGames}
                  teamId={teamId}
                  onOpenLineup={openLineup}
                />
              </View>
              <View className="gap-3" style={isTablet ? { flex: 1 } : undefined}>
                {teamInfo ? <ManagePlayersTab leagueId={leagueId} leagueName={leagueName ?? "League"} seasonId={resolvedSeasonId} teams={[teamInfo]} adminTeamId={teamId} /> : null}
              </View>
            </View>
          )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function FixturesList({
  games,
  teamId,
  onOpenLineup,
}: {
  games: ApiGame[];
  teamId: number;
  onOpenLineup: (gameId: number) => void;
}) {
  const theme = useTheme();

  return (
    <>
      <Text
        className="text-xs uppercase tracking-[2px]"
        style={{ color: theme.textSubtle }}
      >
        Fixtures
      </Text>
      {games.length === 0 ? (
        <View
          className="rounded-[22px] border border-dashed px-5 py-8"
          style={{
            backgroundColor: theme.cardMuted,
            borderColor: theme.cardBorder,
          }}
        >
          <Text className="text-base" style={{ color: theme.text }}>
            No fixtures yet
          </Text>
          <Text
            className="pt-2 text-sm leading-6"
            style={{ color: theme.textSubtle }}
          >
            When the league admin schedules games for this team, they will show
            up here for lineup setup.
          </Text>
        </View>
      ) : (
        games.map((game) => {
          const opponent = opponentFor(game, teamId);
          const editable = EDITABLE_STATUSES.includes(game.status);
          return (
            <Pressable
              key={game.id}
              onPress={() => onOpenLineup(game.id)}
              className="flex-row items-center gap-3 rounded-[20px] px-4 py-4"
              style={({ pressed }) => ({
                backgroundColor: pressed ? theme.cardMuted : theme.card,
              })}
            >
              <View className="flex-1 gap-1">
                <Text style={{ color: theme.text }}>
                  vs {opponent?.name ?? "TBD"}
                </Text>
                <Text className="text-sm" style={{ color: theme.textSubtle }}>
                  {formatPlayedAtShortDate(game.playedAt)} ·{" "}
                  {formatPlayedAtTime(game.playedAt)}
                  {game.venueName ? ` · ${game.venueName}` : ""}
                </Text>
              </View>
              <View
                className={[
                  "rounded-full px-2.5 py-1",
                  editable ? "bg-accent-400/20" : "",
                ].join(" ")}
                style={!editable ? { backgroundColor: theme.cardMuted } : undefined}
              >
                <Text
                  className="text-xs"
                  style={{ color: editable ? theme.accent : theme.textSubtle }}
                >
                  {statusLabel(game.status)}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={theme.textSubtle}
              />
            </Pressable>
          );
        })
      )}
    </>
  );
}
