import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, View } from "react-native";

import { NotFound } from "@/components/not-found";
import {
  DetailTabs,
  SeasonPicker,
  type DetailTab,
  type SeasonOption,
} from "@/components/ui";
import { DetailScreenShell } from "@/components/ui/detail-screen-shell";
import { colors } from "@/constants";
import { hasGroupStage, standingStages } from "@/groups";
import { hasRoundRobinStage, knockoutStages } from "@/knockout";
import { SeasonFormatBanner } from "@/league";
import { messageForResourceLoad } from "@/lib/show-error-toast";
import { useTrackView } from "@/lib/use-track-view";
import {
  ManageActivityTab,
  ManageGamesTab,
  ManageGroupsTab,
  ManageKnockoutTab,
  ManagePlayersTab,
  ManageSettingsTab,
  ManageStandingsTab,
  ManageSwissTab,
  ManageTeamsTab,
  ManageVenuesTab,
  useLeagueTeams,
  useManageLeagueDetail,
} from "@/manage";
import { hasSwissStage } from "@/swiss";

type TabKey =
  | "games"
  | "groups"
  | "swiss"
  | "standings"
  | "knockout"
  | "teams"
  | "players"
  | "venues"
  | "settings"
  | "activity";

export default function ManageLeagueRoute() {
  const { leagueId: leagueIdParam } = useLocalSearchParams<{ leagueId: string }>();
  const leagueId = Number(leagueIdParam);
  const isValidId = Number.isFinite(leagueId) && leagueId > 0;
  const [seasonId, setSeasonId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("games");

  const query = useManageLeagueDetail(isValidId ? leagueId : 0, seasonId);
  const teamsQuery = useLeagueTeams(leagueId, isValidId);

  useTrackView(
    "manage_hub_opened",
    query.data ? leagueId : null,
    query.data
      ? {
          league_id: leagueId,
          league_name: query.data.season.league.name,
          season_id: query.data.season.id,
          format: query.data.season.stages?.[0]?.stageType,
        }
      : undefined,
  );

  useEffect(() => {
    if (query.data?.season.id != null && seasonId === null) {
      setSeasonId(query.data.season.id);
    }
  }, [query.data?.season.id, seasonId]);

  const stages = query.data?.season.stages ?? [];
  const hasRr = hasRoundRobinStage(stages);
  const hasSwiss = hasSwissStage(stages);
  // A swiss season manages everything (draw, rounds, standings, qualification)
  // from its own tab, so the generic Groups/Standings tabs would just be
  // redundant and confusing alongside it.
  const hasGroup = hasGroupStage(stages) && !hasSwiss;
  const hasStandings = !hasSwiss && standingStages(stages).length > 0;
  const knockouts = knockoutStages(stages);
  const showKnockout = knockouts.length > 0;
  const canScheduleRoundRobin = hasRr || stages.length === 0;
  // A swiss stage can be added to a brand-new, stage-less season; once any
  // other stage exists first, adding swiss alongside it isn't supported here.
  const showSwissTab = hasSwiss || stages.length === 0;

  const tabs: readonly DetailTab<TabKey>[] = useMemo(
    () => [
      { key: "games", label: "Games" },
      ...(hasGroup ? ([{ key: "groups", label: "Groups" }] as const) : []),
      ...(showSwissTab ? ([{ key: "swiss", label: "Swiss" }] as const) : []),
      ...(hasStandings
        ? ([{ key: "standings", label: "Standings" }] as const)
        : []),
      ...(showKnockout
        ? ([{ key: "knockout", label: "Knockout" }] as const)
        : []),
      { key: "teams", label: "Teams" },
      { key: "players", label: "Players" },
      { key: "venues", label: "Venues" },
      { key: "settings", label: "Settings" },
      { key: "activity", label: "Activity" },
    ],
    [hasGroup, showSwissTab, hasStandings, showKnockout],
  );

  useEffect(() => {
    if (!tabs.some((t) => t.key === activeTab)) {
      setActiveTab("games");
    }
  }, [tabs, activeTab]);

  if (!isValidId) {
    return (
      <DetailScreenShell title="Manage" tabletMaxWidth={1120}>
        <NotFound message="Invalid league id" />
      </DetailScreenShell>
    );
  }

  if (query.isLoading && !query.data) {
    return (
      <DetailScreenShell title="Manage" tabletMaxWidth={1120}>
        <View className="items-center py-20">
          <ActivityIndicator color={colors.accent} />
        </View>
      </DetailScreenShell>
    );
  }

  if (query.isError || !query.data) {
    return (
      <DetailScreenShell title="Manage" tabletMaxWidth={1120}>
        <NotFound
          message={
            query.isError
              ? messageForResourceLoad(query.error, "League")
              : "League not found."
          }
        />
      </DetailScreenShell>
    );
  }

  const { season, seasons, statTypes } = query.data;
  const seasonOptions: SeasonOption[] = seasons.map((entry) => ({
    id: entry.id,
    name: entry.name,
    status: entry.status,
  }));

  const activeSeasonId = seasonId ?? season.id;

  return (
    <DetailScreenShell
      title={season.league.name}
      subtitle="Competition admin"
      tabletMaxWidth={1120}
      headerContent={
        <>
          <SeasonPicker
            seasons={seasonOptions}
            activeSeasonId={activeSeasonId}
            onSelect={setSeasonId}
          />
          <SeasonFormatBanner stages={stages} compact />
          <DetailTabs
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            scrollable
          />
        </>
      }
    >
      {activeTab === "games" ? (
        <ManageGamesTab
          leagueId={leagueId}
          seasonId={activeSeasonId}
          games={season.games ?? []}
          statTypes={statTypes}
          canScheduleRoundRobin={canScheduleRoundRobin}
        />
      ) : null}
      {activeTab === "groups" && hasGroup ? (
        <ManageGroupsTab
          leagueId={leagueId}
          seasonId={activeSeasonId}
          stages={stages}
          teams={teamsQuery.data ?? []}
          games={season.games ?? []}
          onKnockoutGenerated={() => setActiveTab("knockout")}
        />
      ) : null}
      {activeTab === "swiss" && showSwissTab ? (
        <ManageSwissTab
          leagueId={leagueId}
          seasonId={activeSeasonId}
          stages={stages}
          teams={teamsQuery.data ?? []}
          games={season.games ?? []}
          onKnockoutGenerated={() => setActiveTab("knockout")}
        />
      ) : null}
      {activeTab === "standings" && hasStandings ? (
        <ManageStandingsTab
          leagueId={leagueId}
          seasonId={activeSeasonId}
          stages={stages}
        />
      ) : null}
      {activeTab === "knockout" && showKnockout ? (
        <ManageKnockoutTab
          leagueId={leagueId}
          seasonId={activeSeasonId}
          stages={stages}
          teams={teamsQuery.data ?? []}
        />
      ) : null}
      {activeTab === "teams" ? (
        <ManageTeamsTab
          leagueId={leagueId}
          seasonId={activeSeasonId}
          teams={teamsQuery.data ?? []}
          isLoading={teamsQuery.isLoading}
        />
      ) : null}
      {activeTab === "players" ? (
        <ManagePlayersTab
          leagueId={leagueId}
          leagueName={season.league.name}
          seasonId={activeSeasonId}
          teams={teamsQuery.data ?? []}
        />
      ) : null}
      {activeTab === "venues" ? <ManageVenuesTab leagueId={leagueId} /> : null}
      {activeTab === "settings" ? (
        <ManageSettingsTab
          leagueId={leagueId}
          league={season.league}
          seasons={seasons}
          activeSeasonId={activeSeasonId}
          onSeasonCreated={(id) => setSeasonId(id)}
        />
      ) : null}
      {activeTab === "activity" ? (
        <ManageActivityTab leagueId={leagueId} />
      ) : null}
    </DetailScreenShell>
  );
}
