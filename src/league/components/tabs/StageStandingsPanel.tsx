import { ActivityIndicator, Text, View } from "react-native";

import type { ApiStage } from "@/api/entities";
import { useTheme } from "@/color/use-theme";
import { colors } from "@/constants";
import { useStageStandings, useZones } from "@/groups";
import { messageForResourceLoad } from "@/lib/show-error-toast";
import {
  GroupStandingsView,
  LeagueStandingsTab,
} from "@/league/components/tabs/StandingsTab";

type Props = {
  stage: ApiStage;
  highlightTeamId?: number;
  /** Fallback when stage standings endpoint fails / empty (legacy season.standings). */
  fallbackStandings?: Parameters<typeof LeagueStandingsTab>[0]["standings"];
};

export function LeagueStageStandingsPanel({
  stage,
  highlightTeamId,
  fallbackStandings,
}: Props) {
  const theme = useTheme();
  const query = useStageStandings(stage.id, true);
  const zonesQuery = useZones(stage.id, true);
  const zones = zonesQuery.data ?? [];

  if (query.isLoading && !query.data) {
    return (
      <View className="items-center py-10">
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (query.isError) {
    if (fallbackStandings?.length) {
      return (
        <LeagueStandingsTab
          standings={fallbackStandings}
          highlightTeamId={highlightTeamId}
          zones={zones}
        />
      );
    }
    return (
      <Text className="text-sm" style={{ color: theme.textSubtle }}>
        {messageForResourceLoad(query.error, "Standings")}
      </Text>
    );
  }

  if (!query.data?.tables?.length) {
    if (fallbackStandings?.length) {
      return (
        <LeagueStandingsTab
          standings={fallbackStandings}
          highlightTeamId={highlightTeamId}
          zones={zones}
        />
      );
    }
    return (
      <Text className="text-sm" style={{ color: theme.textSubtle }}>
        Standings not available yet.
      </Text>
    );
  }

  if (stage.stageType === "group" || stage.stageType === "swiss") {
    return (
      <GroupStandingsView
        tables={query.data.tables}
        highlightTeamId={highlightTeamId}
        zones={zones}
      />
    );
  }

  const table = query.data.tables[0];
  return (
    <LeagueStandingsTab
      standings={table?.rows ?? []}
      highlightTeamId={highlightTeamId}
      zones={zones}
    />
  );
}
