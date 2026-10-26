import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import type { ApiGameDetail, ApiStat } from "@/api/entities";
import { useAppearance } from "@/color/appearance-context";
import { useTheme } from "@/color/use-theme";
import { Button } from "@/components/ui";
import { AuthTextField } from "@/components/ui/auth-text-field";
import { BottomSheetModal } from "@/components/ui/bottom-sheet-modal";
import { DetailTabs } from "@/components/ui/detail-tabs";
import { colors } from "@/constants";
import { iconForStatType } from "@/lib/stat-types";
import {
  showInfoToast,
  showSuccessToast,
  showThrownAsToast,
} from "@/lib/show-error-toast";

import type { LeagueRosterRow, MatchEventKey } from "../../types";
import { RosterPosition } from "../../types";
import { isGoalStat } from "../../utils/stats";
import { PlayerActionRow } from "./PlayerPickRow";
import { TeamTabs, type TeamSide } from "./TeamTabs";

type EventTab = "cards" | "saves";

type RecordingKey = {
  eventKey: MatchEventKey;
  playerId: number;
} | null;

type CardKind = "yellow" | "red";

type CardUpdateRequest = {
  stat: ApiStat;
  playerId: number;
  teamId: number;
  statTypeId: number;
  minute: number | null;
  isStoppageTime: boolean;
};

const EVENT_TABS = [
  { key: "cards" as const, label: "Cards" },
  { key: "saves" as const, label: "Saves" },
];

type Props = {
  game: ApiGameDetail;
  homeTeamId: number;
  awayTeamId: number;
  roster: LeagueRosterRow[];
  statMinute: string;
  onStatMinuteChange: (value: string) => void;
  recording: RecordingKey;
  onRecordStat: (eventKey: MatchEventKey, row: LeagueRosterRow) => void;
  onDeleteStat: (statId: number) => void;
  onUpdateCard: (payload: CardUpdateRequest) => Promise<void>;
  updatingStatId?: number | null;
};

export function MatchCenterStatsTab({
  game,
  homeTeamId,
  awayTeamId,
  roster,
  recording,
  statMinute,
  onStatMinuteChange,
  onRecordStat,
  onDeleteStat,
  onUpdateCard,
  updatingStatId,
}: Props) {
  const theme = useTheme();
  const { isDark } = useAppearance();
  const [eventTab, setEventTab] = useState<EventTab>("cards");
  const [activeSide, setActiveSide] = useState<TeamSide>("home");
  const [editingCard, setEditingCard] = useState<ApiStat | null>(null);

  const nonGoalStats = [...(game.stats ?? [])]
    .filter((s) => !isGoalStat(s))
    .sort((a, b) => (b.id ?? 0) - (a.id ?? 0));

  const activeTeamId = activeSide === "home" ? homeTeamId : awayTeamId;

  const players = useMemo(() => {
    return roster.filter((row) => {
      if (row.team?.id !== activeTeamId || row.status !== "active") return false;
      if (eventTab === "saves") {
        return row.position === RosterPosition.Goalkeeper;
      }
      return true;
    });
  }, [roster, activeTeamId, eventTab]);

  return (
    <View className="gap-6">
      <View className="w-28">
        <AuthTextField
          label="Event minute"
          value={statMinute}
          onChangeText={onStatMinuteChange}
          keyboardType="number-pad"
          placeholder="0"
        />
      </View>

      <View
        className="gap-4 rounded-[24px] border px-4 py-4"
        style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}
      >
        <DetailTabs
          tabs={EVENT_TABS}
          activeTab={eventTab}
          onTabChange={setEventTab}
        />

        <TeamTabs
          homeLabel={game.homeTeam?.name ?? "Home"}
          awayLabel={game.awayTeam?.name ?? "Away"}
          activeSide={activeSide}
          onSideChange={setActiveSide}
        />

        <Text className="text-xs" style={{ color: theme.textSubtle }}>
          {eventTab === "cards"
            ? "Tap yellow or red beside a player to record a card."
            : "Tap the save icon beside a goalkeeper."}
        </Text>

        {players.length === 0 ? (
          <Text className="text-sm" style={{ color: theme.textSubtle }}>
            {eventTab === "saves"
              ? "No goalkeepers on this team."
              : "No active players on this team."}
          </Text>
        ) : (
          players.map((row) => {
            const playerId = row.player.id;

            if (eventTab === "saves") {
              const isRecording =
                recording?.eventKey === "Save" && recording.playerId === playerId;
              return (
                <PlayerActionRow
                  key={row.id}
                  name={row.player.name}
                  jersey={row.jerseyNumber}
                  actions={[
                    {
                      key: "save",
                      icon: "hand-left-outline",
                      color: colors.accent,
                      loading: isRecording,
                      onPress: () => onRecordStat("Save", row),
                      accessibilityLabel: `Record save for ${row.player.name}`,
                    },
                  ]}
                />
              );
            }

            return (
              <PlayerActionRow
                key={row.id}
                name={row.player.name}
                jersey={row.jerseyNumber}
                actions={[
                  {
                    key: "yellow",
                    icon: "document-text",
                    color: colors.accent,
                    loading:
                      recording?.eventKey === "Yellow" &&
                      recording.playerId === playerId,
                    onPress: () => onRecordStat("Yellow", row),
                    accessibilityLabel: `Yellow card for ${row.player.name}`,
                  },
                  {
                    key: "red",
                    icon: "document-text",
                    color: colors.liveRed,
                    loading:
                      recording?.eventKey === "Red" &&
                      recording.playerId === playerId,
                    onPress: () => onRecordStat("Red", row),
                    accessibilityLabel: `Red card for ${row.player.name}`,
                  },
                ]}
              />
            );
          })
        )}
      </View>

      <View className="gap-3">
        <Text
          className="text-xs uppercase tracking-wide"
          style={{ color: theme.textMuted }}
        >
          Recorded events
        </Text>
        {nonGoalStats.length === 0 ? (
          <Text className="text-sm" style={{ color: theme.textSubtle }}>
            No cards, saves, or other events yet.
          </Text>
        ) : (
          nonGoalStats.map((stat) => (
            <StatRow
              key={stat.id}
              stat={stat}
              theme={theme}
              onEdit={
                getCardKind(stat) ? () => setEditingCard(stat) : undefined
              }
              onDelete={() => {
                Alert.alert("Delete event", "Remove this stat?", [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: () => onDeleteStat(stat.id),
                  },
                ]);
              }}
            />
          ))
        )}
      </View>

      <EditCardSheet
        visible={Boolean(editingCard)}
        stat={editingCard}
        homeTeamId={homeTeamId}
        awayTeamId={awayTeamId}
        homeLabel={game.homeTeam?.name ?? "Home"}
        awayLabel={game.awayTeam?.name ?? "Away"}
        roster={roster}
        variant={isDark ? "dark" : "light"}
        saving={editingCard ? updatingStatId === editingCard.id : false}
        onClose={() => setEditingCard(null)}
        onSave={onUpdateCard}
      />
    </View>
  );
}

function StatRow({
  stat,
  onEdit,
  onDelete,
  theme,
}: {
  stat: ApiStat;
  onEdit?: () => void;
  onDelete: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  const cardKind = getCardKind(stat);
  const cardColor = cardKind === "red" ? colors.liveRed : colors.accent;
  const icon = cardKind
    ? "document-text"
    : stat.type
      ? iconForStatType(stat.type)
      : "stats-chart-outline";
  const iconColor = cardKind ? cardColor : theme.accent;
  const minute =
    stat.minute != null
      ? `${stat.minute}${stat.isStoppageTime ? "+" : ""}'`
      : "";

  return (
    <Pressable
      onLongPress={onDelete}
      className="flex-row items-center gap-3 rounded-2xl px-3 py-3 active:opacity-85"
      style={{ backgroundColor: theme.cardMuted }}
    >
      <Ionicons name={icon} size={20} color={iconColor} />
      <View className="flex-1">
        <Text className="text-sm" style={{ color: theme.text }}>
          {stat.type?.displayName ?? "Event"} - {stat.player?.name ?? "Player"}
        </Text>
        <Text className="text-xs" style={{ color: theme.textSubtle }}>
          {stat.team?.name}
          {stat.relatedPlayer ? ` · Assist: ${stat.relatedPlayer.name}` : ""}
          {minute ? ` · ${minute}` : ""}
        </Text>
      </View>
      {onEdit ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            cardKind === "red" ? "Edit red card" : "Edit yellow card"
          }
          hitSlop={8}
          onPress={onEdit}
          className="h-10 w-10 items-center justify-center rounded-full active:opacity-80"
          style={{ backgroundColor: cardKind ? `${cardColor}1A` : theme.card }}
        >
          <Ionicons
            name="document-text-outline"
            size={18}
            color={cardKind ? cardColor : theme.text}
          />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

function EditCardSheet({
  visible,
  stat,
  homeTeamId,
  awayTeamId,
  homeLabel,
  awayLabel,
  roster,
  variant,
  saving,
  onClose,
  onSave,
}: {
  visible: boolean;
  stat: ApiStat | null;
  homeTeamId: number;
  awayTeamId: number;
  homeLabel: string;
  awayLabel: string;
  roster: LeagueRosterRow[];
  variant: "light" | "dark";
  saving: boolean;
  onClose: () => void;
  onSave: (payload: CardUpdateRequest) => Promise<void>;
}) {
  const theme = useTheme();
  const [minute, setMinute] = useState("");
  const [isStoppageTime, setIsStoppageTime] = useState(false);
  const [activeSide, setActiveSide] = useState<TeamSide>("home");
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);

  const cardKind = stat ? getCardKind(stat) : null;
  const cardColor = cardKind === "red" ? colors.liveRed : colors.accent;
  const cardLabel = cardKind === "red" ? "red card" : "yellow card";
  const selectedTeamId = activeSide === "home" ? homeTeamId : awayTeamId;
  const teamPlayers = useMemo(
    () =>
      roster.filter(
        (row) => row.team?.id === selectedTeamId && row.status === "active",
      ),
    [roster, selectedTeamId],
  );
  const selectedRow =
    teamPlayers.find((row) => row.player.id === selectedPlayerId) ?? null;

  useEffect(() => {
    if (!stat) return;
    setMinute(stat.minute != null ? String(stat.minute) : "");
    setIsStoppageTime(Boolean(stat.isStoppageTime));
    setActiveSide(stat.team?.id === awayTeamId ? "away" : "home");
    setSelectedPlayerId(stat.player?.id ?? null);
  }, [awayTeamId, stat]);

  useEffect(() => {
    if (!visible || teamPlayers.length === 0) return;
    if (teamPlayers.some((row) => row.player.id === selectedPlayerId)) return;
    setSelectedPlayerId(teamPlayers[0]?.player.id ?? null);
  }, [selectedPlayerId, teamPlayers, visible]);

  const handleSave = async () => {
    if (!stat) return;
    if (!cardKind || !stat.type?.id) {
      showInfoToast("Cannot edit card", "This card event is missing its stat type.");
      return;
    }
    if (!selectedRow?.team) {
      showInfoToast("Choose player", "Select the player who received the card.");
      return;
    }

    const trimmedMinute = minute.trim();
    const parsedMinute = trimmedMinute.length > 0 ? Number(trimmedMinute) : null;
    if (
      parsedMinute != null &&
      (!Number.isInteger(parsedMinute) || parsedMinute < 0 || parsedMinute > 130)
    ) {
      showInfoToast("Check minute", "Use a match minute between 0 and 130.");
      return;
    }

    try {
      await onSave({
        stat,
        playerId: selectedRow.player.id,
        teamId: selectedRow.team.id,
        statTypeId: stat.type.id,
        minute: parsedMinute,
        isStoppageTime,
      });
      showSuccessToast(
        `${capitalize(cardLabel)} updated`,
        "The card details were saved.",
      );
      onClose();
    } catch (error) {
      showThrownAsToast(error, `Could not update ${cardLabel}`);
    }
  };

  return (
    <BottomSheetModal
      visible={visible}
      onClose={onClose}
      title={`Edit ${cardLabel}`}
      subtitle={
        stat?.player?.name
          ? `Correct the player or timing for ${stat.player.name}.`
          : "Correct the player or timing."
      }
      variant={variant}
      contentContainerStyle={{ paddingBottom: 24 }}
    >
      <View className="gap-4">
        <View
          className="gap-1 rounded-2xl border px-4 py-3"
          style={{ backgroundColor: theme.cardMuted, borderColor: theme.cardBorder }}
        >
          <View className="flex-row items-center gap-3">
            <View
              className="h-11 w-11 items-center justify-center rounded-2xl"
              style={{ backgroundColor: `${cardColor}1A` }}
            >
              <Ionicons name="document-text" size={22} color={cardColor} />
            </View>
            <View className="min-w-0 flex-1">
              <Text
                className="text-xs uppercase tracking-wide"
                style={{ color: theme.textMuted }}
              >
                Current card
              </Text>
              <Text className="text-base" style={{ color: theme.text }} numberOfLines={1}>
                {stat?.player?.name ?? "Player"}
              </Text>
              {stat?.team?.name ? (
                <Text className="text-sm" style={{ color: theme.textSubtle }} numberOfLines={1}>
                  {stat.team.name}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        <View className="gap-3">
          <Text className="text-xs uppercase tracking-wide" style={{ color: theme.textMuted }}>
            Carded player
          </Text>
          <TeamTabs
            homeLabel={homeLabel}
            awayLabel={awayLabel}
            activeSide={activeSide}
            onSideChange={setActiveSide}
          />
          {teamPlayers.length === 0 ? (
            <Text className="text-sm" style={{ color: theme.textSubtle }}>
              No active players available for this team.
            </Text>
          ) : (
            <View className="gap-1">
              {teamPlayers.map((row) => (
                <PlayerActionRow
                  key={row.id}
                  name={row.player.name}
                  jersey={row.jerseyNumber}
                  density="compact"
                  actions={[
                    {
                      key: "select",
                      icon:
                        selectedPlayerId === row.player.id
                          ? "checkmark-circle"
                          : "ellipse-outline",
                      color:
                        selectedPlayerId === row.player.id
                          ? cardColor
                          : theme.textMuted,
                      selected: selectedPlayerId === row.player.id,
                      onPress: () => setSelectedPlayerId(row.player.id),
                      accessibilityLabel: `Select ${row.player.name}`,
                    },
                  ]}
                />
              ))}
            </View>
          )}
        </View>

        <AuthTextField
          label="Minute"
          value={minute}
          onChangeText={setMinute}
          keyboardType="number-pad"
          placeholder="45"
        />

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: isStoppageTime }}
          onPress={() => setIsStoppageTime((current) => !current)}
          className="flex-row items-center justify-between rounded-2xl border px-4 py-3 active:opacity-85"
          style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}
        >
          <View className="min-w-0 flex-1">
            <Text className="text-sm" style={{ color: theme.text }}>
              Stoppage time
            </Text>
            <Text className="text-xs" style={{ color: theme.textSubtle }}>
              Show this card as added time, for example 45+.
            </Text>
          </View>
          <Ionicons
            name={isStoppageTime ? "checkmark-circle" : "ellipse-outline"}
            size={24}
            color={isStoppageTime ? theme.accent : theme.textMuted}
          />
        </Pressable>

        <View className="flex-row gap-3">
          <Button
            label="Cancel"
            variant="secondary"
            className="flex-1"
            onPress={onClose}
            disabled={saving}
          />
          <Button
            label="Save card"
            variant="accent"
            className="flex-1"
            loading={saving}
            onPress={() => void handleSave()}
          />
        </View>
      </View>
    </BottomSheetModal>
  );
}

function getCardKind(stat: ApiStat): CardKind | null {
  const name = stat.type?.name?.toLowerCase() ?? "";
  if (name === "yellow_card" || name === "yellow") return "yellow";
  if (name === "red_card" || name === "red") return "red";
  return null;
}

function capitalize(value: string): string {
  if (!value) return value;
  return value[0].toUpperCase() + value.slice(1);
}
