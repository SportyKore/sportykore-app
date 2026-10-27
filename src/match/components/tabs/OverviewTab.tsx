import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import MapView, { Marker } from "react-native-maps";

import { fonts } from "@/theme/fonts";
import { useTheme } from "@/color/use-theme";
import { EntityLogo } from "@/components/ui";
import { Button } from "@/components/ui/Button";
import { useAdaptiveLayout } from "@/hooks/useAdaptiveLayout";
import { useGamePhaseLabel } from "@/hooks/useGamePhaseLabel";
import { formatPlayedAt } from "@/lib/datetime";
import { isActivePlayStatus, isLiveGameStatus } from "@/lib/general-utils";
import { openDirections } from "@/lib/maps";
import { showThrownAsToast } from "@/lib/show-error-toast";
import { MatchEventsTimeline } from "@/match/components/MatchEventsTimeline";
import type { MatchDetail } from "@/match/types";

type Props = {
  detail: MatchDetail;
};

export function MatchOverviewTab({ detail }: Props) {
  const router = useRouter();
  const theme = useTheme();
  const { isTablet } = useAdaptiveLayout();
  const isLive = isLiveGameStatus(detail.status);
  const phase = useGamePhaseLabel(detail);
  const showScore =
    isActivePlayStatus(detail.status) ||
    detail.status === "half_time" ||
    detail.status === "break" ||
    detail.status === "full_time" ||
    detail.status === "completed";

  const venueLabel = detail.venue?.name ?? detail.venueName ?? "-";
  const lat = detail.venue?.latitude;
  const lng = detail.venue?.longitude;
  const hasCoords =
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng);
  const motm =
    detail.awards?.find((award) => award.awardType === "motm") ?? null;

  const handleDirections = async () => {
    if (!hasCoords || lat == null || lng == null) return;
    try {
      await openDirections(lat, lng);
    } catch (err) {
      showThrownAsToast(err, "Could not open maps");
    }
  };

  const scoreCard = (
    <View
      className="rounded-[28px] border px-5 py-6"
      style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}
    >
      <View className="flex-row items-center justify-between gap-4 ">
        <TeamColumn
          name={detail.homeTeam?.name ?? "TBD"}
          logoUrl={detail.homeTeam?.logoUrl}
          onPress={
            detail.homeTeam
              ? () => router.push(`/team/${detail.homeTeam?.id}`)
              : undefined
          }
        />
        <View className="items-center">
          <Text className="text-[32px]" style={{ color: theme.text }}>
            {showScore
              ? `${detail.homeScore ?? "0"} - ${detail.awayScore ?? "0"}`
              : "vs"}
          </Text>
          {phase ? (
            <Text
              className={
                isLive
                  ? "pt-2 text-sm text-[#ba0c2f]"
                  : "pt-2 text-sm text-[#E6A817]"
              }
            >
              {phase}
            </Text>
          ) : null}
        </View>
        <TeamColumn
          name={detail.awayTeam?.name ?? "TBD"}
          logoUrl={detail.awayTeam?.logoUrl}
          onPress={
            detail.awayTeam
              ? () => router.push(`/team/${detail.awayTeam?.id}`)
              : undefined
          }
        />
      </View>
    </View>
  );

  const league = detail.league;
  const leagueLink = league?.id ? (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`View league: ${league.name ?? "league"}`}
      onPress={() => router.push(`/league/${league.id}`)}
      className="min-h-14 flex-row items-center justify-center gap-3 rounded-2xl border px-5 py-4"
      style={({ pressed }) => ({
        backgroundColor: pressed ? theme.cardMuted : theme.surfaceRaised,
        borderColor: theme.inputBorder,
      })}
    >
      <Ionicons name="trophy-outline" size={20} color={theme.accent} />
      <Text
        className="flex-shrink text-center text-base"
        style={{ color: theme.text, fontFamily: fonts.bodySemibold }}
      >
        View {league.name ?? "league"}
      </Text>
      <Ionicons name="chevron-forward" size={18} color={theme.text} />
    </Pressable>
  ) : null;

  const factsSection = (
    <Section title="Match Facts">
      <View
        className="rounded-[24px] border px-4 py-5"
        style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}
      >
        <FactRow label="Kickoff" value={formatPlayedAt(detail.playedAt)} />
        <FactRow label="Venue" value={venueLabel} />
        {detail.venue?.address ? (
          <FactRow label="Address" value={detail.venue.address} />
        ) : null}
      </View>
    </Section>
  );

  const motmSection = motm?.player ? (
    <Section title="Man of the match">
      <Pressable
        onPress={() =>
          motm.player?.id && router.push(`/player/${motm.player.id}`)
        }
        accessibilityRole="button"
        accessibilityLabel={`Open ${motm.player.name} profile`}
        className="flex-row items-center gap-3 rounded-[24px] border px-4 py-4 active:opacity-90"
        style={{
          backgroundColor: theme.accentMuted,
          borderColor: theme.accent,
        }}
      >
        <EntityLogo
          logoUrl={motm.player.avatarUrl}
          variant="player"
          size="md"
          tone="dark"
        />
        <View className="min-w-0 flex-1">
          <Text style={{ color: theme.text }} numberOfLines={1}>
            {motm.player.name}
          </Text>
          <Text className="pt-1 text-xs" style={{ color: theme.textMuted }}>
            Man of the match
          </Text>
        </View>
        <Ionicons name="star" size={20} color={theme.accent} />
      </Pressable>
    </Section>
  ) : null;

  const locationSection =
    hasCoords && lat != null && lng != null ? (
      <Section title="Location">
        <View
          className="overflow-hidden rounded-[24px] border"
          style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}
        >
          <MapView
            style={{ width: "100%", height: 180 }}
            pointerEvents="none"
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
            initialRegion={{
              latitude: lat,
              longitude: lng,
              latitudeDelta: 0.02,
              longitudeDelta: 0.02,
            }}
          >
            <Marker coordinate={{ latitude: lat, longitude: lng }} />
          </MapView>
          <View className="px-4 py-4">
            <Button
              variant="authPurple"
              label="Get directions"
              onPress={() => void handleDirections()}
            />
          </View>
        </View>
      </Section>
    ) : null;

  const eventsSection = (
    <Section title="Events">
      <MatchEventsTimeline
        stats={detail.stats}
        homeTeamId={detail.homeTeam?.id}
        awayTeamId={detail.awayTeam?.id}
        onPlayerPress={(id) => router.push(`/player/${id}`)}
      />
    </Section>
  );

  if (isTablet) {
    return (
      <View className="gap-6">
        {scoreCard}
        {leagueLink}
        <View className="flex-row items-start gap-6">
          <View className="min-w-0 flex-1 gap-6">
            {factsSection}
            {motmSection}
            {locationSection}
          </View>
          <View className="min-w-0 flex-1">{eventsSection}</View>
        </View>
      </View>
    );
  }

  return (
    <View className="gap-6">
      {scoreCard}
      {leagueLink}
      {factsSection}
      {motmSection}
      {locationSection}
      {eventsSection}
    </View>
  );
}

function TeamColumn({
  name,
  logoUrl,
  onPress,
}: {
  name: string;
  logoUrl?: string | null;
  onPress?: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      className="max-w-[120px] flex-1 items-center gap-2"
    >
      <EntityLogo logoUrl={logoUrl} variant="team" size="md" tone="dark" />
      <Text className="text-center" style={{ color: theme.text }}>
        {name}
      </Text>
    </Pressable>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  const theme = useTheme();

  return (
    <View className="flex-row items-center justify-between py-2">
      <Text className="text-sm" style={{ color: theme.textSubtle }}>
        {label}
      </Text>
      <Text
        className="ml-4 flex-1 text-right text-sm"
        style={{ color: theme.text }}
        numberOfLines={2}
      >
        {value}
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
