import { Ionicons } from "@expo/vector-icons";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { ApiGameDetail } from "@/api/entities";
import { useTheme } from "@/color/use-theme";
import { BottomSheetModal } from "@/components/ui/bottom-sheet-modal";
import { colors } from "@/constants";
import { useNetworkStatus } from "hooks/useNetworkStatus";
import { useRecordTrackingEvents } from "@/manage/hooks";
import {
  clearQueuedTrackingEvents,
  createClientEventId,
  enqueueTrackingEvent,
  loadQueuedTrackingEvents,
  loadTrackingPitchLayout,
  saveTrackingPitchLayout,
  type QueuedTrackingEvent,
  type TrackingPitchLayout,
} from "@/manage/tracking-queue";
import type {
  LeagueRosterRow,
  TrackingEventPayload,
  TrackingEventType,
} from "@/manage/types";
import {
  messageFromThrown,
  showErrorToast,
  showInfoToast,
  showSuccessToast,
  showThrownAsToast,
} from "@/lib/show-error-toast";

type Props = {
  game: ApiGameDetail;
  leagueId: number;
  seasonId: number;
  roster: LeagueRosterRow[];
  liveMinute: number;
};

type PitchSide = "home" | "away";

type PitchPlayer = {
  key: string;
  playerId: number;
  teamId: number;
  side: PitchSide;
  teamName: string;
  name: string;
  jerseyNumber: number | null;
  role: "Starter" | "Sub";
};

type TrackingOutcome = "pass_complete" | "pass_missed" | "shot_on" | "shot_off";

type PlayerTrackingCount = {
  passesAttempted: number;
  passesCompleted: number;
  shotsAttempted: number;
  shotsOnTarget: number;
};

type SyncNotice = {
  tone: "success" | "error" | "info";
  message: string;
} | null;

type FlushReason = "manual" | "interval" | "half_time";

const MIN_SERVER_FLUSH_INTERVAL_MS = 8000;

const HOME_COORDS = [
  { top: 92, left: 50 },
  { top: 82, left: 16 },
  { top: 82, left: 38 },
  { top: 82, left: 62 },
  { top: 82, left: 84 },
  { top: 69, left: 25 },
  { top: 69, left: 50 },
  { top: 69, left: 75 },
  { top: 57, left: 22 },
  { top: 57, left: 50 },
  { top: 57, left: 78 },
] as const;

const AWAY_COORDS = HOME_COORDS.map((coord) => ({
  top: 100 - coord.top,
  left: coord.left,
}));

export function AdvancedTrackingPanel({
  game,
  leagueId,
  seasonId,
  roster,
  liveMinute,
}: Props) {
  const theme = useTheme();
  const { isOnline } = useNetworkStatus();
  const [queued, setQueued] = useState<QueuedTrackingEvent[]>([]);
  const [pitchLayout, setPitchLayout] = useState<TrackingPitchLayout | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [swapForKey, setSwapForKey] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<SyncNotice>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const autoFlushAttemptRef = useRef<string | null>(null);
  const flushInFlightRef = useRef(false);
  const lastServerFlushAtRef = useRef(0);
  const recordMutation = useRecordTrackingEvents(game.id, leagueId, seasonId);

  const players = useMemo(() => collectPitchPlayers(game, roster), [game, roster]);
  const usingRosterFallback = useMemo(
    () => !hasSubmittedLineups(game) && players.length > 0,
    [game, players.length],
  );
  const playerByKey = useMemo(
    () => new Map(players.map((player) => [player.key, player])),
    [players],
  );
  const defaultLayout = useMemo(() => makeDefaultPitchLayout(players), [players]);
  const activeLayout = useMemo(
    () => normalizePitchLayout(pitchLayout, defaultLayout, playerByKey),
    [defaultLayout, pitchLayout, playerByKey],
  );
  const pitchPlayers = useMemo(
    () => [
      ...activeLayout.home.map((key, index) => ({
        player: playerByKey.get(key),
        side: "home" as const,
        index,
      })),
      ...activeLayout.away.map((key, index) => ({
        player: playerByKey.get(key),
        side: "away" as const,
        index,
      })),
    ],
    [activeLayout, playerByKey],
  );
  const swapForPlayer = swapForKey ? playerByKey.get(swapForKey) ?? null : null;
  const countsByPlayer = useMemo(
    () => countPlayerTracking(game, queued),
    [game, queued],
  );

  const refreshQueue = useCallback(async () => {
    setQueued(await loadQueuedTrackingEvents(game.id));
  }, [game.id]);

  const refreshLayout = useCallback(async () => {
    const saved = await loadTrackingPitchLayout(game.id);
    setPitchLayout(saved);
  }, [game.id]);

  const persistLayout = async (next: TrackingPitchLayout) => {
    const normalized = normalizePitchLayout(next, defaultLayout, playerByKey);
    setPitchLayout(normalized);
    await saveTrackingPitchLayout(game.id, normalized);
  };

  const flushQueue = useCallback(async (reason: FlushReason = "manual") => {
    if (flushInFlightRef.current || recordMutation.isPending) {
      if (reason === "manual") {
        setSyncNotice({ tone: "info", message: "A sync is already running." });
      }
      return;
    }

    const events = await loadQueuedTrackingEvents(game.id);
    if (!events.length) {
      if (reason === "manual") {
        setSyncNotice({ tone: "info", message: "No tracking events are queued." });
      }
      return;
    }

    const autoAttemptKey =
      reason === "manual"
        ? null
        : `${reason}:${game.status}:${signatureForQueuedEvents(events)}`;
    if (autoAttemptKey && autoFlushAttemptRef.current === autoAttemptKey) return;

    const blockingMessage = blockingSyncMessage(events);
    if (blockingMessage) {
      if (autoAttemptKey) autoFlushAttemptRef.current = autoAttemptKey;
      setQueued(events);
      setSyncNotice({ tone: "error", message: blockingMessage });
      if (reason === "manual") {
        showErrorToast("Could not sync tracking", blockingMessage);
      }
      return;
    }

    if (!isOnline) {
      if (autoAttemptKey) autoFlushAttemptRef.current = autoAttemptKey;
      setSyncNotice({
        tone: "info",
        message: "Saved offline. Tracking events will sync when network returns.",
      });
      showInfoToast("Saved offline", "Tracking events will sync when network returns.");
      setQueued(events);
      return;
    }

    const now = Date.now();
    if (
      reason !== "manual" &&
      now - lastServerFlushAtRef.current < MIN_SERVER_FLUSH_INTERVAL_MS
    ) {
      return;
    }

    if (autoAttemptKey) autoFlushAttemptRef.current = autoAttemptKey;
    flushInFlightRef.current = true;
    setIsSyncing(true);
    setSyncNotice({ tone: "info", message: `Syncing ${events.length} event(s)...` });
    lastServerFlushAtRef.current = now;

    try {
      const result = await recordMutation.mutateAsync({ events });
      await clearQueuedTrackingEvents(game.id);
      setQueued([]);
      autoFlushAttemptRef.current = null;
      const savedMessage =
        result.skipped > 0
          ? `${result.accepted} saved, ${result.skipped} already synced.`
          : `${result.accepted} event(s) saved.`;
      setSyncNotice({ tone: "success", message: savedMessage });
      showSuccessToast("Tracking synced", savedMessage);
    } catch (error) {
      const message = messageFromThrown(error);
      setQueued(events);
      setSyncNotice({ tone: "error", message });
      showThrownAsToast(error, "Could not sync tracking");
    } finally {
      setIsSyncing(false);
      flushInFlightRef.current = false;
    }
  }, [game.id, game.status, isOnline, recordMutation]);

  useEffect(() => {
    void refreshQueue();
  }, [refreshQueue]);

  useEffect(() => {
    void refreshLayout();
  }, [refreshLayout]);

  useEffect(() => {
    const timer = setInterval(() => {
      void flushQueue("interval");
    }, 10 * 60 * 1000);

    return () => clearInterval(timer);
  }, [flushQueue]);

  useEffect(() => {
    if (game.status === "half_time") {
      void flushQueue("half_time");
    }
  }, [flushQueue, game.status]);

  const recordEvent = async (player: PitchPlayer, outcome: TrackingOutcome) => {
    const eventType: TrackingEventType =
      outcome === "pass_complete" || outcome === "pass_missed" ? "pass" : "shot";
    const event: TrackingEventPayload = {
      clientEventId: createClientEventId(),
      type: eventType,
      teamId: player.teamId,
      playerId: player.playerId,
      minute: liveMinute > 0 ? liveMinute : null,
      isStoppageTime: false,
      completed: eventType === "pass" ? outcome === "pass_complete" : undefined,
      onTarget: eventType === "shot" ? outcome === "shot_on" : undefined,
    };

    const next = await enqueueTrackingEvent(game.id, event);
    setQueued(next);
    setLastSaved(`${player.name} ${labelForOutcome(outcome)}`);
    setSelectedKey(null);
  };

  const swapTrackingPlayer = async (replacement: PitchPlayer) => {
    if (!swapForPlayer) return;
    const side = swapForPlayer.side;
    const next: TrackingPitchLayout = {
      home: [...activeLayout.home],
      away: [...activeLayout.away],
    };
    const sideKeys = next[side];
    const index = sideKeys.indexOf(swapForPlayer.key);
    if (index === -1) return;

    sideKeys[index] = replacement.key;
    setSwapForKey(null);
    setSelectedKey(null);
    await persistLayout(next);
  };

  const resetPitch = async () => {
    setSelectedKey(null);
    setSwapForKey(null);
    await persistLayout(defaultLayout);
  };

  const confirmClearQueue = () => {
    if (!queued.length || isSyncing) return;

    Alert.alert(
      "Clear queued tracking?",
      "This removes unsynced pass and shot events from this device.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear queue",
          style: "destructive",
          onPress: () => {
            void (async () => {
              await clearQueuedTrackingEvents(game.id);
              setQueued([]);
              setSyncNotice({ tone: "info", message: "Queued tracking events cleared." });
            })();
          },
        },
      ],
    );
  };

  return (
    <View
      className="gap-4 rounded-[24px] border px-3 py-4"
      style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}
    >
      <View className="flex-row items-start gap-3 px-1">
        <View
          className="h-10 w-10 items-center justify-center rounded-2xl"
          style={{ backgroundColor: theme.accentMuted }}
        >
          <Ionicons name="football-outline" size={19} color={theme.accent} />
        </View>
        <View className="min-w-0 flex-1">
          <Text style={{ color: theme.text }}>Pitch tracker</Text>
          <Text
            className="pt-1 text-xs leading-5"
            style={{ color: theme.textSubtle }}
          >
            {usingRosterFallback
              ? "Using the first 11 active roster players until lineups are submitted."
              : "Tap a player, record the event, or swap the tracking marker."}
          </Text>
        </View>
        <View className="items-end gap-1">
          <View
            className="rounded-full px-2.5 py-1"
            style={{ backgroundColor: theme.cardMuted }}
          >
            <Text
              className="text-[10px] uppercase"
              style={{ color: theme.textMuted }}
            >
              {queued.length} queued
            </Text>
          </View>
          {lastSaved ? (
            <Text
              className="max-w-[112px] text-right text-[10px]"
              style={{ color: theme.accent }}
              numberOfLines={1}
            >
              {lastSaved}
            </Text>
          ) : null}
        </View>
      </View>

      <View
        className="gap-3 rounded-[20px] border px-3 py-3"
        style={{ backgroundColor: theme.accentMuted, borderColor: theme.accent }}
      >
        <MetricRow
          label="Possession"
          homeValue={
            game.tracking?.possessionTracked
              ? `${game.tracking.teams.home.possessionPct}%`
              : "Not tracked"
          }
          awayValue={
            game.tracking?.possessionTracked
              ? `${game.tracking.teams.away.possessionPct}%`
              : "Not tracked"
          }
          theme={theme}
        />
        <MetricRow
          label="Pass completion"
          homeValue={formatPct(game.tracking?.teams.home.passCompletionPct)}
          awayValue={formatPct(game.tracking?.teams.away.passCompletionPct)}
          theme={theme}
        />
        <MetricRow
          label="Shot accuracy"
          homeValue={formatPct(game.tracking?.teams.home.shotAccuracyPct)}
          awayValue={formatPct(game.tracking?.teams.away.shotAccuracyPct)}
          theme={theme}
        />
      </View>

      {!players.length ? (
        <View
          className="rounded-2xl border px-4 py-4"
          style={{ backgroundColor: theme.cardMuted, borderColor: theme.cardBorder }}
        >
          <Text className="text-sm" style={{ color: theme.textSubtle }}>
            Add players to both team rosters to unlock pass and shot tracking.
          </Text>
        </View>
      ) : (
        <>
          <PitchLegend theme={theme} />
          <TrackingPitch
            pitchPlayers={pitchPlayers}
            countsByPlayer={countsByPlayer}
            selectedKey={selectedKey}
            onSelect={(playerKey) =>
              setSelectedKey((current) => (current === playerKey ? null : playerKey))
            }
            onRecord={(player, outcome) => void recordEvent(player, outcome)}
            onSwap={(player) => {
              setSwapForKey(player.key);
              setSelectedKey(null);
            }}
          />
          <Pressable
            onPress={() => void resetPitch()}
            accessibilityRole="button"
            className="h-10 flex-row items-center justify-center gap-2 rounded-full border px-4 active:opacity-85"
            style={{ backgroundColor: theme.cardMuted, borderColor: theme.cardBorder }}
          >
            <Ionicons name="refresh-outline" size={16} color={theme.accent} />
            <Text className="text-xs" style={{ color: theme.textMuted }}>
              Reset pitch to starters
            </Text>
          </Pressable>
        </>
      )}

      <Pressable
        onPress={() => void flushQueue("manual")}
        disabled={!queued.length || isSyncing}
        accessibilityRole="button"
        className={`h-11 flex-row items-center justify-center gap-2 rounded-full border px-4 active:opacity-90 ${
          !queued.length || isSyncing ? "opacity-45" : ""
        }`}
        style={{ backgroundColor: theme.accent, borderColor: theme.accent }}
      >
        {isSyncing ? (
          <ActivityIndicator color={theme.textInverse} />
        ) : (
          <Ionicons name="cloud-upload-outline" size={17} color={theme.textInverse} />
        )}
        <Text className="text-sm" style={{ color: theme.textInverse }}>
          {isSyncing ? "Syncing..." : "Sync now"}
        </Text>
      </Pressable>

      {syncNotice ? (
        <SyncNoticeRow
          notice={syncNotice}
          canClearQueue={syncNotice.tone === "error" && queued.length > 0 && !isSyncing}
          onClearQueue={confirmClearQueue}
          theme={theme}
        />
      ) : null}

      <SwapPlayerSheet
        player={swapForPlayer}
        players={players}
        activeLayout={activeLayout}
        onClose={() => setSwapForKey(null)}
        onSelect={(replacement) => void swapTrackingPlayer(replacement)}
      />
    </View>
  );
}

function TrackingPitch({
  pitchPlayers,
  countsByPlayer,
  selectedKey,
  onSelect,
  onRecord,
  onSwap,
}: {
  pitchPlayers: { player?: PitchPlayer; side: PitchSide; index: number }[];
  countsByPlayer: Map<string, PlayerTrackingCount>;
  selectedKey: string | null;
  onSelect: (playerKey: string) => void;
  onRecord: (player: PitchPlayer, outcome: TrackingOutcome) => void;
  onSwap: (player: PitchPlayer) => void;
}) {
  return (
    <View
      className="overflow-hidden rounded-[22px] border-2 border-accent-400 bg-brand-800"
      style={styles.pitch}
    >
      {Array.from({ length: 10 }, (_, index) => (
        <View
          key={index}
          pointerEvents="none"
          style={[
            styles.pitchStripe,
            {
              top: `${index * 10}%`,
              backgroundColor: index % 2 === 0 ? colors.brand : colors.brand600,
            },
          ]}
        />
      ))}
      <View pointerEvents="none" style={styles.pitchMarkings}>
        <View style={styles.halfLine} />
        <View style={styles.centerCircle} />
        <View style={[styles.goalBox, styles.goalBoxTop]} />
        <View style={[styles.goalBox, styles.goalBoxBottom]} />
      </View>
      {pitchPlayers.map(({ player, side, index }) => {
        if (!player) return null;
        const coord = side === "home" ? HOME_COORDS[index] : AWAY_COORDS[index];
        if (!coord) return null;
        const counts = countsByPlayer.get(player.key) ?? emptyPlayerCount();
        const selected = selectedKey === player.key;
        return (
          <Fragment key={`${side}-${index}-${player.key}`}>
            <PitchMarker
              player={player}
              counts={counts}
              coordinate={coord}
              selected={selected}
              onPress={() => onSelect(player.key)}
            />
            {selected ? (
              <PitchActionBubble
                player={player}
                counts={counts}
                coordinate={coord}
                onRecord={(outcome) => onRecord(player, outcome)}
                onSwap={() => onSwap(player)}
              />
            ) : null}
          </Fragment>
        );
      })}
    </View>
  );
}

function PitchMarker({
  player,
  counts,
  coordinate,
  selected,
  onPress,
}: {
  player: PitchPlayer;
  counts: PlayerTrackingCount;
  coordinate: { top: number; left: number };
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open tracking actions for ${player.name}`}
      className="absolute items-center"
      style={{
        top: `${coordinate.top}%`,
        left: `${coordinate.left}%`,
        width: 54,
        marginLeft: -27,
        marginTop: -22,
      }}
    >
      <View
        className={`h-9 w-9 items-center justify-center rounded-full border-2 ${
          player.side === "home"
            ? "border-neutral-950 bg-accent-500"
            : "border-accent-400 bg-brand-900"
        }`}
        style={selected ? styles.selectedMarker : undefined}
      >
        <Text
          className={player.side === "home" ? "text-[11px] text-neutral-950" : "text-[11px] text-white"}
          numberOfLines={1}
        >
          {player.jerseyNumber ?? "?"}
        </Text>
      </View>
      <Text className="mt-0.5 text-center text-[8px] text-white" numberOfLines={1}>
        {shortName(player.name)}
      </Text>
      <Text className="text-center text-[8px] text-white/55" numberOfLines={1}>
        P {counts.passesCompleted}/{counts.passesAttempted}
      </Text>
    </Pressable>
  );
}

function PitchActionBubble({
  player,
  counts,
  coordinate,
  onRecord,
  onSwap,
}: {
  player: PitchPlayer;
  counts: PlayerTrackingCount;
  coordinate: { top: number; left: number };
  onRecord: (outcome: TrackingOutcome) => void;
  onSwap: () => void;
}) {
  const placeBelow = coordinate.top < 24;
  const horizontalAnchor =
    coordinate.left < 32 ? 33 : coordinate.left > 68 ? 67 : coordinate.left;

  return (
    <View
      pointerEvents="box-none"
      className="absolute z-20"
      style={{
        top: `${placeBelow ? coordinate.top + 7 : coordinate.top - 20}%`,
        left: `${horizontalAnchor}%`,
        width: 218,
        marginLeft: -109,
      }}
    >
      <View className="rounded-2xl border border-accent-400/40 bg-neutral-950/95 p-2 shadow-lg">
        <View className="flex-row items-center gap-2 pb-2">
          <View
            className={`h-8 w-8 items-center justify-center rounded-full ${
              player.side === "home" ? "bg-accent-500" : "bg-brand-700"
            }`}
          >
            <Text className={player.side === "home" ? "text-xs text-neutral-950" : "text-xs text-white"}>
              {player.jerseyNumber ?? "-"}
            </Text>
          </View>
          <View className="min-w-0 flex-1">
            <Text className="text-xs text-white" numberOfLines={1}>
              {player.name}
            </Text>
            <Text className="text-[10px] text-white/45" numberOfLines={1}>
              P {counts.passesCompleted}/{counts.passesAttempted} - S{" "}
              {counts.shotsOnTarget}/{counts.shotsAttempted}
            </Text>
          </View>
        </View>
        <View className="flex-row gap-1.5">
          <QuickAction label="P+" helper="complete" onPress={() => onRecord("pass_complete")} primary />
          <QuickAction label="P-" helper="missed" onPress={() => onRecord("pass_missed")} />
          <QuickAction label="S+" helper="target" onPress={() => onRecord("shot_on")} primary />
          <QuickAction label="S-" helper="off" onPress={() => onRecord("shot_off")} />
          <Pressable
            onPress={onSwap}
            accessibilityRole="button"
            accessibilityLabel={`Swap tracking player for ${player.name}`}
            className="h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06]"
          >
            <Ionicons name="swap-horizontal-outline" size={17} color={colors.accent} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function QuickAction({
  label,
  helper,
  primary,
  onPress,
}: {
  label: string;
  helper: string;
  primary?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={helper}
      className={`h-10 flex-1 items-center justify-center rounded-xl border ${
        primary
          ? "border-accent-400 bg-accent-500"
          : "border-white/10 bg-white/[0.06]"
      }`}
    >
      <Text className={primary ? "text-xs text-neutral-950" : "text-xs text-white"}>
        {label}
      </Text>
      <Text
        className={primary ? "text-[8px] text-neutral-950/70" : "text-[8px] text-white/45"}
        numberOfLines={1}
      >
        {helper}
      </Text>
    </Pressable>
  );
}

function SwapPlayerSheet({
  player,
  players,
  activeLayout,
  onClose,
  onSelect,
}: {
  player: PitchPlayer | null;
  players: PitchPlayer[];
  activeLayout: TrackingPitchLayout;
  onClose: () => void;
  onSelect: (player: PitchPlayer) => void;
}) {
  const theme = useTheme();
  const activeKeys = new Set([...activeLayout.home, ...activeLayout.away]);
  const candidates = player
    ? players.filter(
        (candidate) =>
          candidate.side === player.side &&
          candidate.key !== player.key &&
          !activeKeys.has(candidate.key),
      )
    : [];

  return (
    <BottomSheetModal
      visible={Boolean(player)}
      onClose={onClose}
      title="Swap tracking player"
      subtitle={player ? `Replace ${player.name} on the pitch tracker only.` : undefined}
    >
      <ScrollView
        style={styles.swapList}
        contentContainerStyle={styles.swapListContent}
      >
        {candidates.length ? (
          candidates.map((candidate) => (
            <Pressable
              key={candidate.key}
              onPress={() => onSelect(candidate)}
              accessibilityRole="button"
              accessibilityLabel={`Swap in ${candidate.name}`}
              className="flex-row items-center gap-3 rounded-2xl border px-3 py-3 active:opacity-85"
              style={{
                backgroundColor: theme.cardMuted,
                borderColor: theme.cardBorder,
              }}
            >
              <View
                className={`h-10 w-10 items-center justify-center rounded-full ${
                  candidate.side === "home" ? "bg-accent-500" : "bg-brand-700"
                }`}
              >
                <Text className={candidate.side === "home" ? "text-neutral-950" : "text-white"}>
                  {candidate.jerseyNumber ?? "-"}
                </Text>
              </View>
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
                  {candidate.teamName} - {candidate.role}
                </Text>
              </View>
              <Ionicons name="swap-horizontal-outline" size={18} color={theme.accent} />
            </Pressable>
          ))
        ) : (
          <Text
            className="rounded-2xl border px-4 py-4 text-sm"
            style={{
              backgroundColor: theme.cardMuted,
              borderColor: theme.cardBorder,
              color: theme.textSubtle,
            }}
          >
            No available player to swap in for this team.
          </Text>
        )}
      </ScrollView>
    </BottomSheetModal>
  );
}

function SyncNoticeRow({
  notice,
  canClearQueue,
  onClearQueue,
  theme,
}: {
  notice: Exclude<SyncNotice, null>;
  canClearQueue: boolean;
  onClearQueue: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  const isError = notice.tone === "error";
  const icon =
    notice.tone === "success"
      ? "checkmark-circle-outline"
      : isError
        ? "alert-circle-outline"
        : "information-circle-outline";

  return (
    <View
      className="gap-3 rounded-2xl border px-3 py-3"
      style={{
        backgroundColor: isError
          ? theme.dangerMuted
          : notice.tone === "success"
            ? theme.successMuted
            : theme.cardMuted,
        borderColor: isError
          ? theme.danger
          : notice.tone === "success"
            ? theme.success
            : theme.cardBorder,
      }}
    >
      <View className="flex-row items-start gap-2">
        <Ionicons
          name={icon}
          size={16}
          color={
            isError
              ? theme.danger
              : notice.tone === "success"
                ? theme.success
                : theme.accent
          }
        />
        <Text
          className="min-w-0 flex-1 text-xs leading-5"
          style={{ color: theme.textMuted }}
        >
          {notice.message}
        </Text>
      </View>
      {canClearQueue ? (
        <Pressable
          onPress={onClearQueue}
          accessibilityRole="button"
          className="h-9 flex-row items-center justify-center gap-2 rounded-full border px-3"
          style={{ backgroundColor: theme.dangerMuted, borderColor: theme.danger }}
        >
          <Ionicons name="trash-outline" size={15} color={theme.danger} />
          <Text className="text-xs" style={{ color: theme.danger }}>
            Clear queued events
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function PitchLegend({ theme }: { theme: ReturnType<typeof useTheme> }) {
  return (
    <View
      className="flex-row flex-wrap items-center gap-2 rounded-2xl border px-3 py-3"
      style={{ backgroundColor: theme.cardMuted, borderColor: theme.cardBorder }}
    >
      <LegendPill label="Gold" helper="home" color="accent" theme={theme} />
      <LegendPill label="Purple" helper="away" color="brand" theme={theme} />
      <LegendPill label="Tap" helper="record" color="plain" theme={theme} />
      <LegendPill label="Swap" helper="tracker only" color="plain" theme={theme} />
    </View>
  );
}

function LegendPill({
  label,
  helper,
  color,
  theme,
}: {
  label: string;
  helper: string;
  color: "accent" | "brand" | "plain";
  theme: ReturnType<typeof useTheme>;
}) {
  const isAccent = color === "accent";
  const isBrand = color === "brand";

  return (
    <View
      className="flex-row items-center gap-1 rounded-full px-2 py-1"
      style={{
        backgroundColor: isAccent
          ? theme.accent
          : isBrand
            ? theme.brand
            : theme.card,
      }}
    >
      <Text
        className="text-[10px]"
        style={{ color: isAccent || isBrand ? theme.textInverse : theme.text }}
      >
        {label}
      </Text>
      <Text
        className="text-[10px]"
        style={{
          color: isAccent || isBrand ? theme.textInverse : theme.textSubtle,
        }}
      >
        {helper}
      </Text>
    </View>
  );
}

function MetricRow({
  label,
  homeValue,
  awayValue,
  theme,
}: {
  label: string;
  homeValue: string;
  awayValue: string;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text
        className="w-20 text-sm"
        style={{ color: theme.accent }}
        numberOfLines={1}
      >
        {homeValue}
      </Text>
      <Text
        className="min-w-0 flex-1 text-center text-[10px] uppercase tracking-[1.2px]"
        style={{ color: theme.textMuted }}
      >
        {label}
      </Text>
      <Text
        className="w-20 text-right text-sm"
        style={{ color: theme.accent }}
        numberOfLines={1}
      >
        {awayValue}
      </Text>
    </View>
  );
}

function collectPitchPlayers(
  game: ApiGameDetail,
  roster: LeagueRosterRow[],
): PitchPlayer[] {
  const players: PitchPlayer[] = [];
  const hasLineups = hasSubmittedLineups(game);

  if (hasLineups) {
    for (const group of game.lineups ?? []) {
      const side = sideForTeam(game, group.team.id);
      if (!side) continue;

      for (const entry of [...group.starters, ...group.substitutes]) {
        if (entry.status !== "starter" && entry.status !== "substitute") continue;
        players.push({
          key: `${entry.teamId}:${entry.playerId}`,
          playerId: entry.playerId,
          teamId: entry.teamId,
          side,
          teamName: group.team.name,
          name: entry.player.name,
          jerseyNumber: entry.jerseyNumber,
          role: entry.status === "starter" ? "Starter" : "Sub",
        });
      }
    }
  } else {
    players.push(...collectRosterFallbackPlayers(game, roster, "home"));
    players.push(...collectRosterFallbackPlayers(game, roster, "away"));
  }

  return players.sort((a, b) => {
    if (a.side !== b.side) return a.side === "home" ? -1 : 1;
    if (a.role !== b.role) return a.role === "Starter" ? -1 : 1;
    return (a.jerseyNumber ?? 999) - (b.jerseyNumber ?? 999);
  });
}

function collectRosterFallbackPlayers(
  game: ApiGameDetail,
  roster: LeagueRosterRow[],
  side: PitchSide,
): PitchPlayer[] {
  const team = side === "home" ? game.homeTeam : game.awayTeam;
  if (!team) return [];

  return roster
    .filter((row) => row.team?.id === team.id && row.status === "active")
    .sort((a, b) => {
      const jerseyA = parseJersey(a.jerseyNumber);
      const jerseyB = parseJersey(b.jerseyNumber);
      if (jerseyA !== jerseyB) return jerseyA - jerseyB;
      return a.player.name.localeCompare(b.player.name);
    })
    .map((row) => ({
      key: `${row.team?.id}:${row.player.id}`,
      playerId: row.player.id,
      teamId: team.id,
      side,
      teamName: team.name,
      name: row.player.name,
      jerseyNumber: parseJerseyOrNull(row.jerseyNumber),
      role: "Starter" as const,
    }));
}

function hasSubmittedLineups(game: ApiGameDetail) {
  return (game.lineups ?? []).some(
    (group) => group.starters.length > 0 || group.substitutes.length > 0,
  );
}

function sideForTeam(game: ApiGameDetail, teamId: number): PitchSide | null {
  if (teamId === game.homeTeam?.id) return "home";
  if (teamId === game.awayTeam?.id) return "away";
  return null;
}

function makeDefaultPitchLayout(players: PitchPlayer[]): TrackingPitchLayout {
  return {
    home: players.filter((player) => player.side === "home").slice(0, 11).map((player) => player.key),
    away: players.filter((player) => player.side === "away").slice(0, 11).map((player) => player.key),
  };
}

function normalizePitchLayout(
  layout: TrackingPitchLayout | null,
  fallback: TrackingPitchLayout,
  playerByKey: Map<string, PitchPlayer>,
): TrackingPitchLayout {
  const normalizeSide = (side: PitchSide) => {
    const saved = (layout?.[side] ?? []).filter((key) => playerByKey.has(key)).slice(0, 11);
    const missing = fallback[side].filter((key) => !saved.includes(key));
    return [...saved, ...missing].slice(0, 11);
  };

  return {
    home: normalizeSide("home"),
    away: normalizeSide("away"),
  };
}

function countPlayerTracking(
  game: ApiGameDetail,
  queued: QueuedTrackingEvent[],
): Map<string, PlayerTrackingCount> {
  const counts = new Map<string, PlayerTrackingCount>();

  for (const stat of game.stats ?? []) {
    const playerId = stat.player?.id;
    const teamId = stat.team?.id;
    if (playerId == null || teamId == null) continue;
    const key = `${teamId}:${playerId}`;
    const count = ensurePlayerCount(counts, key);
    const type = stat.type?.name?.toLowerCase();

    if (type === "pass") {
      count.passesAttempted += 1;
      if (stat.qualifiers?.completed === true) {
        count.passesCompleted += 1;
      }
    }

    if (type === "shot") {
      count.shotsAttempted += 1;
      if (stat.qualifiers?.on_target === true) {
        count.shotsOnTarget += 1;
      }
    }
  }

  for (const event of queued) {
    const key = `${event.teamId}:${event.playerId}`;
    const count = ensurePlayerCount(counts, key);

    if (event.type === "pass") {
      count.passesAttempted += 1;
      if (event.completed) count.passesCompleted += 1;
    }

    if (event.type === "shot") {
      count.shotsAttempted += 1;
      if (event.onTarget) count.shotsOnTarget += 1;
    }
  }

  return counts;
}

function signatureForQueuedEvents(events: QueuedTrackingEvent[]) {
  return events.map((event) => event.clientEventId).join("|");
}

function blockingSyncMessage(events: QueuedTrackingEvent[]) {
  const hasInvalidMinute = events.some(
    (event) => event.minute != null && (event.minute < 0 || event.minute > 130),
  );
  if (hasInvalidMinute) {
    return "Some queued events are outside the 0-130 minute limit and cannot be synced.";
  }

  return null;
}

function ensurePlayerCount(counts: Map<string, PlayerTrackingCount>, key: string) {
  const existing = counts.get(key);
  if (existing) return existing;
  const empty = emptyPlayerCount();
  counts.set(key, empty);
  return empty;
}

function emptyPlayerCount(): PlayerTrackingCount {
  return {
    passesAttempted: 0,
    passesCompleted: 0,
    shotsAttempted: 0,
    shotsOnTarget: 0,
  };
}

function labelForOutcome(outcome: TrackingOutcome) {
  switch (outcome) {
    case "pass_complete":
      return "P+";
    case "pass_missed":
      return "P-";
    case "shot_on":
      return "S+";
    case "shot_off":
      return "S-";
  }
}

function shortName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? name;
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.at(-1) ?? "";
  return `${first}. ${last}`;
}

function formatPct(value: number | undefined) {
  return value != null ? `${value}%` : "0%";
}

function parseJersey(value: string | null) {
  const parsed = value != null ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 999;
}

function parseJerseyOrNull(value: string | null) {
  const parsed = parseJersey(value);
  return parsed === 999 ? null : parsed;
}

const styles = StyleSheet.create({
  pitch: {
    aspectRatio: 3 / 4.3,
    position: "relative",
  },
  pitchStripe: {
    position: "absolute",
    left: 0,
    right: 0,
    height: "10%",
  },
  pitchMarkings: {
    ...StyleSheet.absoluteFillObject,
  },
  selectedMarker: {
    transform: [{ scale: 1.1 }],
  },
  halfLine: {
    position: "absolute",
    left: "6%",
    right: "6%",
    top: "50%",
    height: 2,
    backgroundColor: colors.accent,
    opacity: 0.68,
  },
  centerCircle: {
    position: "absolute",
    left: "39%",
    top: "44%",
    width: "22%",
    aspectRatio: 1,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.accent,
    opacity: 0.64,
  },
  goalBox: {
    position: "absolute",
    left: "31%",
    right: "31%",
    height: "9%",
    borderWidth: 2,
    borderColor: colors.accent,
    opacity: 0.58,
  },
  goalBoxTop: {
    top: "5%",
    borderTopWidth: 0,
  },
  goalBoxBottom: {
    bottom: "5%",
    borderBottomWidth: 0,
  },
  swapList: {
    maxHeight: 420,
  },
  swapListContent: {
    gap: 8,
  },
});
