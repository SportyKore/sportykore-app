import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Text, View } from "react-native";

import { useAppearance } from "@/color/appearance-context";
import { useTheme } from "@/color/use-theme";
import type { GameStatus } from "@/api/entities";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/error-state";
import { messageFromThrown, showSuccessToast } from "@/lib/show-error-toast";
import { posthog } from "@/lib/posthog";
import { FootballPitch } from "@/lineup/components/FootballPitch";
import { FormationChips } from "@/lineup/components/FormationChips";
import {
  LineupPlayerPickerSheet,
  type PickerMode,
} from "@/lineup/components/LineupPlayerPickerSheet";
import { PitchSlot } from "@/lineup/components/PitchSlot";
import { SubstitutesSection } from "@/lineup/components/SubstitutesSection";
import { useFormations, useGameLineups, useSetLineup } from "@/lineup/hooks";
import type {
  Formation,
  FormationSlot,
  RosterPickerPlayer,
  SlotAssignment,
  SubAssignment,
} from "@/lineup/types";
import {
  allStarterSlotsFilled,
  assignedPlayerIds,
  buildSetLineupPayload,
  hydrateEditorFromLineup,
  rosterToPickerPlayers,
  slotCoordinates,
} from "@/lineup/utils";
import type { LeagueRosterRow } from "@/manage/types";

type Props = {
  gameId: number;
  teamId: number;
  roster: LeagueRosterRow[];
  gameStatus?: GameStatus;
  onSaved?: () => void;
  embedded?: boolean;
};

type PickerState =
  | { mode: "starter"; slot: FormationSlot }
  | { mode: "substitute" }
  | null;

export function LineupEditor({
  gameId,
  teamId,
  roster,
  gameStatus,
  onSaved,
  embedded = false,
}: Props) {
  const formationsQuery = useFormations();
  const lineupsQuery = useGameLineups(gameId);
  const saveMutation = useSetLineup(gameId);
  const theme = useTheme();
  const { isDark } = useAppearance();

  const [selectedFormation, setSelectedFormation] = useState<Formation | null>(null);
  const [slots, setSlots] = useState<Record<string, SlotAssignment>>({});
  const [subs, setSubs] = useState<SubAssignment[]>([]);
  const [picker, setPicker] = useState<PickerState>(null);
  const [hydrated, setHydrated] = useState(false);

  const teamRoster = useMemo(
    () => roster.filter((row) => row.team?.id === teamId),
    [roster, teamId],
  );

  const pickerPlayers = useMemo(
    () => rosterToPickerPlayers(teamRoster),
    [teamRoster],
  );

  const teamLineupGroup = useMemo(
    () => lineupsQuery.data?.find((g) => g.team.id === teamId),
    [lineupsQuery.data, teamId],
  );

  useEffect(() => {
    if (hydrated || !formationsQuery.data?.length) return;

    const existingFormation =
      teamLineupGroup?.formation ??
      formationsQuery.data.find((f) => f.id === teamLineupGroup?.starters[0]?.formationId) ??
      formationsQuery.data[0];

    if (!existingFormation) return;

    const { slots: initialSlots, subs: initialSubs } = hydrateEditorFromLineup(
      existingFormation,
      teamLineupGroup,
      teamRoster,
    );

    setSelectedFormation(existingFormation);
    setSlots(initialSlots);
    setSubs(initialSubs);
    setHydrated(true);
  }, [
    hydrated,
    formationsQuery.data,
    teamLineupGroup,
    teamRoster,
  ]);

  const locked =
    gameStatus === "full_time" ||
    gameStatus === "cancelled" ||
    gameStatus === "completed";

  const availablePlayers = useCallback(
    (exceptPlayerId?: number): RosterPickerPlayer[] => {
      const taken = assignedPlayerIds(slots, subs, exceptPlayerId);
      return pickerPlayers.filter((p) => !taken.has(p.playerId));
    },
    [pickerPlayers, slots, subs],
  );

  const handleFormationSelect = (formation: Formation) => {
    if (formation.id === selectedFormation?.id) return;

    const hasAssignments =
      Object.keys(slots).length > 0 || subs.length > 0;

    const apply = () => {
      setSelectedFormation(formation);
      setSlots({});
      setSubs([]);
    };

    if (!hasAssignments) {
      apply();
      return;
    }

    Alert.alert(
      "Change formation?",
      "Switching formation will clear your current lineup selections.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Change", style: "destructive", onPress: apply },
      ],
    );
  };

  const handlePlayerSelect = (player: RosterPickerPlayer) => {
    if (!picker) return;

    if (picker.mode === "substitute") {
      setSubs((prev) => [
        ...prev,
        {
          playerId: player.playerId,
          playerName: player.playerName,
          jerseyNumber: player.jerseyNumber,
        },
      ]);
      return;
    }

    setSlots((prev) => ({
      ...prev,
      [picker.slot.key]: {
        playerId: player.playerId,
        playerName: player.playerName,
        jerseyNumber: player.jerseyNumber,
      },
    }));
  };

  const handleConfirm = async () => {
    if (!selectedFormation) return;
    if (locked) {
      Alert.alert(
        "Cannot edit lineup",
        "Lineups cannot be changed after full time or when a match is cancelled.",
      );
      return;
    }

    try {
      const payload = buildSetLineupPayload(teamId, selectedFormation, slots, subs);
      await saveMutation.mutateAsync(payload);
      posthog?.capture("lineup_saved", {
        game_id: gameId,
        team_id: teamId,
        formation: selectedFormation.name,
        starter_count: Object.keys(slots).length,
        substitute_count: subs.length,
      });
      showSuccessToast("Lineup saved", "Your team sheet has been confirmed.");
      onSaved?.();
    } catch (err) {
      Alert.alert("Could not save lineup", messageFromThrown(err));
    }
  };

  const canConfirm =
    !locked &&
    selectedFormation != null &&
    allStarterSlotsFilled(selectedFormation, slots) &&
    !saveMutation.isPending;

  if (formationsQuery.isLoading || lineupsQuery.isLoading) {
    return (
      <View className="items-center py-12">
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  if (formationsQuery.isError) {
    return (
      <ErrorState
        message={messageFromThrown(formationsQuery.error)}
        onRetry={() => formationsQuery.refetch()}
      />
    );
  }

  if (!formationsQuery.data?.length) {
    return (
      <Text className="text-sm" style={{ color: theme.textSubtle }}>
        No formations available.
      </Text>
    );
  }

  const pickerExceptId =
    picker?.mode === "starter"
      ? slots[picker.slot.key]?.playerId
      : undefined;

  return (
    <View className={embedded ? "gap-5" : "gap-5 pb-28"}>
      {locked ? (
        <View
          className="rounded-xl px-4 py-3"
          style={{ backgroundColor: theme.cardMuted }}
        >
          <Text className="text-sm" style={{ color: theme.textMuted }}>
            This match is finished - lineup is read-only.
          </Text>
        </View>
      ) : null}

      <FormationChips
        formations={formationsQuery.data}
        selectedId={selectedFormation?.id ?? null}
        onSelect={locked ? () => {} : handleFormationSelect}
        tone={isDark ? "dark" : "light"}
      />

      {selectedFormation ? (
        <FootballPitch>
          {selectedFormation.slots.map((slot) => {
            const assignment = slots[slot.key];
            const coord = slotCoordinates(slot, selectedFormation.slots);
            return (
              <PitchSlot
                key={slot.key}
                label={slot.label}
                coordinate={coord}
                playerName={assignment?.playerName}
                jerseyNumber={assignment?.jerseyNumber}
                readOnly={locked}
                onPress={() => setPicker({ mode: "starter", slot })}
                onClear={
                  locked
                    ? undefined
                    : () =>
                        setSlots((prev) => {
                          const next = { ...prev };
                          delete next[slot.key];
                          return next;
                        })
                }
              />
            );
          })}
        </FootballPitch>
      ) : null}

      <SubstitutesSection
        subs={subs}
        readOnly={locked}
        onAdd={() => setPicker({ mode: "substitute" })}
        onRemove={(playerId) =>
          setSubs((prev) => prev.filter((s) => s.playerId !== playerId))
        }
        tone={isDark ? "dark" : "light"}
      />

      {canConfirm ? (
        <Button
          label="Confirm Lineup"
          variant="authPurple"
          loading={saveMutation.isPending}
          onPress={handleConfirm}
        />
      ) : null}

      <LineupPlayerPickerSheet
        visible={picker != null && !locked}
        onClose={() => setPicker(null)}
        mode={(picker?.mode ?? "starter") as PickerMode}
        slot={picker?.mode === "starter" ? picker.slot : null}
        players={availablePlayers(pickerExceptId)}
        onSelect={handlePlayerSelect}
        variant={isDark ? "dark" : "light"}
      />
    </View>
  );
}
