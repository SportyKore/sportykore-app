import { useRouter } from "expo-router";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";

import type { ApiSeasonDetail } from "@/api/entities";
import { useTheme } from "@/color/use-theme";
import { useAdaptiveLayout } from "@/hooks/useAdaptiveLayout";
import { formatPlayedAt } from "@/lib/datetime";
import { isLiveGameStatus } from "@/lib/general-utils";
import { isGoalsStat } from "@/lib/stat-types";
import { SeasonFormatBanner } from "../SeasonFormatBanner";

type Props = {
  season: ApiSeasonDetail;
};

export function LeagueOverviewTab({ season }: Props) {
  const router = useRouter();
  const theme = useTheme();
  const { isTablet } = useAdaptiveLayout();
  const counts = useMemo(() => deriveCounts(season), [season]);
  const topScorer = useMemo(() => deriveTopScorer(season), [season]);
  const recentResults = useMemo(
    () =>
      season.games
        .filter((g) => g.status === "full_time" || g.status === "completed")
        .sort(
          (a, b) =>
            new Date(b.playedAt).valueOf() - new Date(a.playedAt).valueOf(),
        )
        .slice(0, 5),
    [season.games],
  );

  const introContent = (
    <>
      {season.league.description ? (
        <View className="flex-row items-center gap-3">
          <Text className="text-[16px]" style={{ color: theme.textMuted }}>
            {season.league.description}
          </Text>
        </View>
      ) : null}

      <View className="flex-row gap-3">
        <StatCard label="Teams" value={counts.teams} />
        <StatCard label="Matches" value={counts.matches} />
        <StatCard label="Live" value={counts.live} />
      </View>
    </>
  );

  const topScorerContent = topScorer ? (
    <Section title="Player Of The Season">
      <Pressable
        onPress={() => router.push(`/player/${topScorer.player.id}`)}
        className="rounded-[24px] border px-5 py-5 active:opacity-85"
        style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}
      >
        <View className="flex-row items-center gap-4">
          <View
            className="h-16 w-16 items-center justify-center rounded-full"
            style={{ backgroundColor: theme.brand }}
          >
            <Text className="text-xl" style={{ color: theme.textInverse }}>
              {initials(topScorer.player.name)}
            </Text>
          </View>
          <View className="flex-1">
            <Text className="text-[20px]" style={{ color: theme.text }}>
              {topScorer.player.name}
            </Text>
            <Text className="pt-2 text-sm" style={{ color: theme.accent }}>
              {topScorer.goals} goals · {topScorer.assists} assists
            </Text>
          </View>
        </View>
      </Pressable>
    </Section>
  ) : null;

  const recentResultsContent = (
    <Section title="Recent Results">
      {recentResults.length ? (
        recentResults.map((game) => (
          <Pressable
            key={game.id}
            onPress={() => router.push(`/match/${game.id}`)}
            className="rounded-[22px] border px-4 py-4 active:opacity-85"
            style={{
              backgroundColor: theme.card,
              borderColor: theme.cardBorder,
            }}
          >
            <Text style={{ color: theme.text }}>
              {game.homeTeam?.name ?? "TBD"} {game.homeScore ?? "-"} -{" "}
              {game.awayScore ?? "-"} {game.awayTeam?.name ?? "TBD"}
            </Text>
            <Text className="pt-2 text-sm" style={{ color: theme.textSubtle }}>
              {formatPlayedAt(game.playedAt)}
            </Text>
          </Pressable>
        ))
      ) : (
        <EmptyText>No recent results yet.</EmptyText>
      )}
    </Section>
  );

  if (isTablet) {
    return (
      <View className="gap-6">
        <View className="gap-6">{introContent}</View>
        <View className="flex-row items-start gap-6">
          <View className="min-w-0 flex-1">{topScorerContent}</View>
          <View className="min-w-0 flex-1">{recentResultsContent}</View>
        </View>
        <SeasonFormatBanner stages={season.stages ?? []} />
      </View>
    );
  }

  return (
    <View className="gap-6">
      {introContent}
      {topScorerContent}
      {recentResultsContent}
      <SeasonFormatBanner stages={season.stages ?? []} />
    </View>
  );
}

function deriveCounts(season: ApiSeasonDetail) {
  const teamIds = new Set<number>();
  for (const standing of season.standings) {
    if (standing.team?.id != null) teamIds.add(standing.team.id);
  }
  for (const game of season.games) {
    if (game.homeTeam?.id != null) teamIds.add(game.homeTeam.id);
    if (game.awayTeam?.id != null) teamIds.add(game.awayTeam.id);
  }
  return {
    teams: teamIds.size,
    matches: season.games.length,
    live: season.games.filter((g) => isLiveGameStatus(g.status)).length,
  };
}

function deriveTopScorer(season: ApiSeasonDetail) {
  const totals = new Map<
    number,
    { player: { id: number; name: string }; goals: number; assists: number }
  >();
  for (const stat of season.stats) {
    if (!stat.player) continue;
    const key = stat.player.id;
    const entry = totals.get(key) ?? {
      player: stat.player,
      goals: 0,
      assists: 0,
    };
    if (isGoalsStat(stat)) entry.goals += stat.numericValue ?? 1;
    const display = stat.type?.displayName?.toLowerCase() ?? "";
    if (display.includes("assist")) entry.assists += stat.numericValue ?? 1;
    totals.set(key, entry);
  }
  const ranked = Array.from(totals.values()).sort(
    (a, b) => b.goals - a.goals || b.assists - a.assists,
  );
  return ranked[0] ?? null;
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function StatCard({ label, value }: { label: string; value: number }) {
  const theme = useTheme();

  return (
    <View
      className="flex-1 rounded-[22px] border px-3 py-4"
      style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}
    >
      <Text style={{ color: theme.accent }} className="text-center text-[24px]">
        {value}
      </Text>
      <Text
        className="pt-1 text-center text-xs"
        style={{ color: theme.textSubtle }}
      >
        {label}
      </Text>
    </View>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: import("react").ReactNode;
}) {
  const theme = useTheme();

  return (
    <View className="gap-3">
      <Text
        className="text-[12px] uppercase tracking-[2px]"
        style={{ color: theme.textSubtle }}
      >
        {title}
      </Text>
      <View className="gap-3">{children}</View>
    </View>
  );
}

function EmptyText({ children }: { children: string }) {
  const theme = useTheme();

  return (
    <Text className="text-sm" style={{ color: theme.textSubtle }}>
      {children}
    </Text>
  );
}
