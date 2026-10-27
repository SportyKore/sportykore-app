import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";

import type {
  ApiGame,
  ApiStage,
  ApiTeam,
  SwissProposedFixture,
  SwissStageConfig,
} from "@/api/entities";
import { useTheme } from "@/color/use-theme";
import { Button } from "@/components/ui/Button";
import { AuthTextField } from "@/components/ui/auth-text-field";
import { BottomSheetModal } from "@/components/ui/bottom-sheet-modal";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { NativeDatePickerField } from "@/components/ui/native-date-picker-field";
import { useStageStandings } from "@/groups";
import { useSeasonStages } from "@/knockout";
import { GroupStandingsView } from "@/league/components/tabs/StandingsTab";
import { showInfoToast } from "@/lib/show-error-toast";
import {
  GameVenuePicker,
  venuePayloadFromSelection,
  type GameVenueSelection,
} from "../games/GameVenuePicker";
import {
  buildSwissStageConfig,
  defaultSwissFormatFormState,
  readSwissConfig,
  swissStages,
  SwissFormatConfigControl,
  useAssignSwissTeams,
  useConfirmSwissPlayoff,
  useConfirmSwissRound,
  useCreateSwissStage,
  useGenerateKnockoutFromSwiss,
  useProposeSwissRound,
  useSwissKnockoutPreview,
  useSwissPlayoffProposal,
  useSwissQualification,
  useUpdateSwissConfig,
  type SwissFormatFormState,
} from "@/swiss";

type Props = {
  leagueId: number;
  seasonId: number;
  stages: ApiStage[];
  teams: ApiTeam[];
  games: ApiGame[];
  onKnockoutGenerated?: () => void;
};

function Card({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View
      className="gap-3 rounded-[22px] border px-4 py-4"
      style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}
    >
      {children}
    </View>
  );
}

function CreateSwissStageForm({
  leagueId,
  seasonId,
}: {
  leagueId: number;
  seasonId: number;
}) {
  const theme = useTheme();
  const [name, setName] = useState("Opening Stage");
  const [formState, setFormState] = useState<SwissFormatFormState>(defaultSwissFormatFormState());

  const createMutation = useCreateSwissStage(leagueId, seasonId);

  const handleCreate = () => {
    const cleanedGroups = formState.groupNames.map((g) => g.trim()).filter(Boolean);
    if (cleanedGroups.length === 0) {
      showInfoToast("Name every group", "Give each campus/group a name.");
      return;
    }
    void (async () => {
      try {
        await createMutation.mutateAsync({
          name: name.trim() || "Opening Stage",
          groupNames: cleanedGroups,
          config: buildSwissStageConfig(formState),
        });
        showInfoToast("Swiss stage created", "Assign teams to groups next.");
      } catch {
        /* toasted */
      }
    })();
  };

  return (
    <Card>
      <Text className="text-base" style={{ color: theme.text }}>
        Create a Swiss opening stage
      </Text>
      <Text className="text-sm" style={{ color: theme.textSubtle }}>
        Each group plays a fixed number of rounds, paired by current standings.
      </Text>

      <AuthTextField label="Stage name" value={name} onChangeText={setName} />

      <SwissFormatConfigControl value={formState} onChange={setFormState} />

      <Button
        variant="authPurple"
        label="Create swiss stage"
        loading={createMutation.isPending}
        onPress={handleCreate}
      />
    </Card>
  );
}

function GroupChips({
  groups,
  selectedId,
  onSelect,
}: {
  groups: { id: number; name: string }[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const theme = useTheme();
  if (groups.length <= 1) return null;
  return (
    <View className="flex-row flex-wrap gap-2">
      {groups.map((g) => {
        const selected = g.id === selectedId;
        return (
          <Pressable
            key={g.id}
            onPress={() => onSelect(g.id)}
            className="rounded-xl border px-3 py-2"
            style={{
              borderColor: selected ? theme.accent : theme.cardBorder,
              backgroundColor: selected ? theme.cardMuted : "transparent",
            }}
          >
            <Text className="text-sm" style={{ color: theme.text }}>
              {g.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function fixtureKey(f: SwissProposedFixture) {
  return `${f.homeTeamId}-${f.awayTeamId}`;
}

function RoundCard({
  leagueId,
  seasonId,
  stageId,
  stageGroupId,
  roundNumber,
  teams,
  stageGames,
  rounds,
}: {
  leagueId: number;
  seasonId: number;
  stageId: number;
  stageGroupId: number;
  roundNumber: number;
  teams: ApiTeam[];
  stageGames: ApiGame[];
  rounds: number;
}) {
  const theme = useTheme();
  const roundGames = stageGames.filter(
    (g) => g.stageGroupId === stageGroupId && g.roundNumber === roundNumber,
  );
  const previousRoundGames = stageGames.filter(
    (g) => g.stageGroupId === stageGroupId && g.roundNumber === roundNumber - 1,
  );
  const previousRoundDone =
    roundNumber === 1 ||
    (previousRoundGames.length > 0 &&
      previousRoundGames.every((g) => g.status === "full_time"));
  const confirmed = roundGames.length > 0;

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [fixtures, setFixtures] = useState<SwissProposedFixture[]>([]);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [byeTeamId, setByeTeamId] = useState<number | null>(null);
  const [manualPending, setManualPending] = useState<number | null>(null);
  const [venueSelection, setVenueSelection] = useState<GameVenueSelection>({ kind: "none" });
  const [roundDate, setRoundDate] = useState<string | null>(null);

  const proposeMutation = useProposeSwissRound(leagueId, seasonId);
  const confirmMutation = useConfirmSwissRound(leagueId, seasonId);

  const teamName = (id: number) => teams.find((t) => t.id === id)?.name ?? `#${id}`;

  const runAutoPropose = async () => {
    try {
      const result = await proposeMutation.mutateAsync({
        stageId,
        stageGroupId,
        roundNumber,
        payload: { mode: "auto" },
      });
      setFixtures(result.fixtures);
      setByeTeamId(result.byeTeamId);
      setConflicts(summarizeConflicts(result.conflicts, teamName));
    } catch {
      /* toasted */
    }
  };

  const openSheet = () => {
    setMode("auto");
    setFixtures([]);
    setConflicts([]);
    setByeTeamId(null);
    setManualPending(null);
    setVenueSelection({ kind: "none" });
    setRoundDate(null);
    setOpen(true);
    void runAutoPropose();
  };

  const switchToManual = () => {
    setMode("manual");
    setFixtures([]);
    setConflicts([]);
    setManualPending(null);
  };

  const tapManualTeam = (teamId: number) => {
    if (manualPending === null) {
      setManualPending(teamId);
      return;
    }
    if (manualPending === teamId) {
      setManualPending(null);
      return;
    }
    setFixtures((prev) => [...prev, { homeTeamId: manualPending, awayTeamId: teamId }]);
    setManualPending(null);
  };

  const removeFixture = (f: SwissProposedFixture) => {
    setFixtures((prev) => prev.filter((x) => fixtureKey(x) !== fixtureKey(f)));
  };

  const pairedTeamIds = new Set(fixtures.flatMap((f) => [f.homeTeamId, f.awayTeamId]));
  const unpairedTeams = teams.filter((t) => !pairedTeamIds.has(t.id));

  const checkManualConflicts = async () => {
    if (fixtures.length === 0) return;
    try {
      const result = await proposeMutation.mutateAsync({
        stageId,
        stageGroupId,
        roundNumber,
        payload: { mode: "manual", fixtures },
      });
      setConflicts(summarizeConflicts(result.conflicts, teamName));
    } catch {
      /* toasted */
    }
  };

  const hasBlockingConflict = conflicts.length > 0;

  const doConfirm = (forceOverride: boolean) => {
    const venueFields = venuePayloadFromSelection(venueSelection);
    void (async () => {
      try {
        const res = await confirmMutation.mutateAsync({
          stageId,
          stageGroupId,
          roundNumber,
          payload: {
            fixtures,
            byeTeamId,
            ...(venueFields.venueId != null
              ? { venueId: venueFields.venueId }
              : venueFields.venueName
                ? { venueName: venueFields.venueName }
                : {}),
            ...(roundDate?.trim() ? { playedAt: roundDate.trim() } : {}),
            forceOverride,
          },
        });
        showInfoToast("Round confirmed", `${res.count} fixtures were scheduled.`);
        setOpen(false);
      } catch {
        /* toasted */
      }
    })();
  };

  const handleConfirm = async () => {
    if (mode === "manual") {
      await checkManualConflicts();
    }
    if (hasBlockingConflict) {
      Alert.alert(
        "Pairing conflict",
        `${conflicts.join("\n")}\n\nConfirm anyway? This overrides the Swiss no-rematch rule.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Confirm anyway", style: "destructive", onPress: () => doConfirm(true) },
        ],
      );
      return;
    }
    doConfirm(false);
  };

  return (
    <View
      className="gap-2 rounded-xl border px-3 py-3"
      style={{ borderColor: theme.cardBorder }}
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-sm" style={{ color: theme.text }}>
          Round {roundNumber} of {rounds}
        </Text>
        <Text className="text-xs" style={{ color: theme.textSubtle }}>
          {confirmed ? `${roundGames.length} fixtures` : "Not generated"}
        </Text>
      </View>
      {!confirmed ? (
        <View className="flex-row items-center gap-2">
          <View className="flex-1">
            <Button
              variant="accent"
              size="default"
              label={previousRoundDone ? "Generate pairings…" : "Previous round not finished"}
              disabled={!previousRoundDone}
              onPress={openSheet}
            />
          </View>
          {!previousRoundDone ? (
            <InfoTooltip
              size={22}
              title="Previous round not finished"
              message={`All games in round ${roundNumber - 1} must be marked full-time on the Games tab before round ${roundNumber} pairings can be generated.`}
            />
          ) : null}
        </View>
      ) : null}

      <BottomSheetModal
        visible={open}
        onClose={() => setOpen(false)}
        title={`Round ${roundNumber} pairings`}
        subtitle="Nothing is saved until you confirm."
      >
        <ScrollView className="max-h-[480px]" nestedScrollEnabled>
          <View className="gap-4 pb-6">
            <View className="flex-row gap-2">
              <Button
                variant={mode === "auto" ? "authPurple" : "secondary"}
                label="Auto"
                onPress={() => {
                  setMode("auto");
                  void runAutoPropose();
                }}
              />
              <Button variant={mode === "manual" ? "authPurple" : "secondary"} label="Manual" onPress={switchToManual} />
            </View>

            {proposeMutation.isPending ? (
              <Text className="text-sm" style={{ color: theme.textSubtle }}>
                Working…
              </Text>
            ) : null}

            {mode === "manual" ? (
              <View className="gap-2">
                <Text className="text-sm" style={{ color: theme.textSubtle }}>
                  Tap two teams to pair them.
                  {manualPending ? ` Now pick ${teamName(manualPending)}'s opponent.` : ""}
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {unpairedTeams.map((t) => (
                    <Pressable
                      key={t.id}
                      onPress={() => tapManualTeam(t.id)}
                      className="rounded-xl border px-3 py-2"
                      style={{
                        borderColor:
                          manualPending === t.id ? theme.accent : theme.cardBorder,
                        backgroundColor: theme.cardMuted,
                      }}
                    >
                      <Text className="text-sm" style={{ color: theme.text }}>
                        {t.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            <View className="gap-2">
              {fixtures.map((f) => (
                <Pressable
                  key={fixtureKey(f)}
                  onPress={() => (mode === "manual" ? removeFixture(f) : undefined)}
                  className="flex-row items-center justify-between rounded-xl border px-3 py-2"
                  style={{ borderColor: theme.cardBorder }}
                >
                  <Text className="text-sm" style={{ color: theme.text }}>
                    {teamName(f.homeTeamId)} vs {teamName(f.awayTeamId)}
                  </Text>
                  {mode === "manual" ? (
                    <Text className="text-xs" style={{ color: theme.textSubtle }}>
                      remove
                    </Text>
                  ) : null}
                </Pressable>
              ))}
            </View>

            {byeTeamId ? (
              <Text className="text-sm" style={{ color: theme.textSubtle }}>
                Bye this round: {teamName(byeTeamId)}
              </Text>
            ) : null}

            {conflicts.length > 0 ? (
              <View className="gap-1 rounded-xl border px-3 py-2" style={{ borderColor: theme.accent }}>
                {conflicts.map((c, i) => (
                  <Text key={i} className="text-sm" style={{ color: theme.accent }}>
                    {c}
                  </Text>
                ))}
              </View>
            ) : null}

            <NativeDatePickerField
              label="Round date"
              value={roundDate}
              onChange={setRoundDate}
              placeholder="Defaults to today"
              helperText="Each round can kick off on its own date."
            />

            <GameVenuePicker
              leagueId={leagueId}
              enabled={open}
              selection={venueSelection}
              onChange={setVenueSelection}
            />

            <Button
              variant="authPurple"
              label={hasBlockingConflict ? "Review conflicts & confirm" : "Confirm round"}
              disabled={fixtures.length === 0}
              loading={confirmMutation.isPending}
              onPress={() => void handleConfirm()}
            />
          </View>
        </ScrollView>
      </BottomSheetModal>
    </View>
  );
}

function summarizeConflicts(
  conflicts: { type: string; teamIds: number[] }[],
  teamName: (id: number) => string,
): string[] {
  return conflicts.map((c) => {
    if (c.type === "rematch") {
      return `Rematch: ${teamName(c.teamIds[0]!)} already played ${teamName(c.teamIds[1]!)}.`;
    }
    if (c.type === "no_pair_violation") {
      return `${teamName(c.teamIds[0]!)} and ${teamName(c.teamIds[1]!)} must not be paired.`;
    }
    return `Unpaired: ${c.teamIds.map(teamName).join(", ")}.`;
  });
}

function QualificationCard({
  leagueId,
  seasonId,
  stageId,
  stageGroupId,
  stageConfig,
  teams,
  stageGames,
  knockoutExists,
  onKnockoutGenerated,
}: {
  leagueId: number;
  seasonId: number;
  stageId: number;
  stageGroupId: number;
  stageConfig: SwissStageConfig | null;
  teams: ApiTeam[];
  stageGames: ApiGame[];
  knockoutExists: boolean;
  onKnockoutGenerated?: () => void;
}) {
  const theme = useTheme();
  const qualificationQuery = useSwissQualification(stageId, stageGroupId);
  const updateConfigMutation = useUpdateSwissConfig(leagueId, seasonId);
  const [editingRule, setEditingRule] = useState(false);
  const [directCount, setDirectCount] = useState("");
  const [playoffFrom, setPlayoffFrom] = useState("");
  const [playoffTo, setPlayoffTo] = useState("");

  const startEditingRule = () => {
    const rule = qualificationQuery.data?.rule;
    setDirectCount(String(rule?.directCount ?? 0));
    setPlayoffFrom(String(rule?.playoffRankFrom ?? 0));
    setPlayoffTo(String(rule?.playoffRankTo ?? 0));
    setEditingRule(true);
  };

  const saveGroupRule = () => {
    if (!stageConfig) return;
    const nextConfig: SwissStageConfig = {
      ...stageConfig,
      qualificationByGroup: {
        ...stageConfig.qualificationByGroup,
        [String(stageGroupId)]: {
          directCount: Number(directCount) || 0,
          playoffRankFrom: Number(playoffFrom) || 0,
          playoffRankTo: Number(playoffTo) || 0,
        },
      },
    };
    void (async () => {
      try {
        await updateConfigMutation.mutateAsync({ stageId, config: nextConfig });
        showInfoToast("Saved", "This group's qualification rule was updated.");
        setEditingRule(false);
      } catch {
        /* toasted */
      }
    })();
  };

  const playoffRoundNumber = (stageConfig?.format.rounds ?? 0) + 1;
  const playoffConfirmed = stageGames.some(
    (g) => g.stageGroupId === stageGroupId && g.roundNumber === playoffRoundNumber,
  );

  const playoffQuery = useSwissPlayoffProposal(
    stageId,
    stageGroupId,
    (qualificationQuery.data?.playoffCandidates.length ?? 0) > 0 && !playoffConfirmed,
  );
  const knockoutPreviewQuery = useSwissKnockoutPreview(stageId, !knockoutExists);
  const confirmPlayoffMutation = useConfirmSwissPlayoff(leagueId, seasonId);
  const generateKnockoutMutation = useGenerateKnockoutFromSwiss(leagueId, seasonId);

  const qualification = qualificationQuery.data;
  const knockoutPreview = knockoutPreviewQuery.data;

  const teamName = (id: number) => teams.find((t) => t.id === id)?.name ?? `#${id}`;

  const handleConfirmPlayoff = () => {
    const fixtures = playoffQuery.data?.fixtures;
    if (!fixtures?.length) return;
    const pairingsSummary = fixtures
      .map((f) => `${teamName(f.homeTeamId)} vs ${teamName(f.awayTeamId)}`)
      .join("\n");
    Alert.alert(
      "Confirm playoff fixtures?",
      `This creates the following matches. One match per pairing; a draw goes to penalties.\n\n${pairingsSummary}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: () => {
            void (async () => {
              try {
                await confirmPlayoffMutation.mutateAsync({
                  stageId,
                  stageGroupId,
                  payload: { fixtures },
                });
                showInfoToast("Playoff fixtures created", "Scheduled for this group.");
              } catch {
                /* toasted */
              }
            })();
          },
        },
      ],
    );
  };

  const handleGenerateKnockout = () => {
    if (!knockoutPreview?.ready) return;
    const qualifiersSummary = knockoutPreview.groups
      .map((g) => `${g.stageGroupName}:\n${g.qualifierTeamIds.map(teamName).join(", ")}`)
      .join("\n\n");
    Alert.alert(
      "Generate knockout?",
      `This creates the knockout bracket from these qualifiers. This cannot be undone from here.\n\n${qualifiersSummary}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Generate",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await generateKnockoutMutation.mutateAsync({ stageId, payload: {} });
                showInfoToast("Knockout created", "Bracket is ready on the Knockout tab.");
                onKnockoutGenerated?.();
              } catch {
                /* toasted */
              }
            })();
          },
        },
      ],
    );
  };

  if (qualificationQuery.isLoading) {
    return (
      <Text className="text-sm" style={{ color: theme.textSubtle }}>
        Loading standings…
      </Text>
    );
  }
  if (!qualification) {
    return (
      <Text className="text-sm" style={{ color: theme.textSubtle }}>
        Standings are not available yet.
      </Text>
    );
  }

  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm" style={{ color: theme.textSubtle }}>
          Rule: top {qualification.rule.directCount} direct, ranks{" "}
          {qualification.rule.playoffRankFrom}-{qualification.rule.playoffRankTo} playoff
        </Text>
        {!editingRule ? (
          <Pressable onPress={startEditingRule}>
            <Text className="text-sm" style={{ color: theme.accent }}>
              Edit
            </Text>
          </Pressable>
        ) : null}
      </View>

      {editingRule ? (
        <View className="gap-2 rounded-xl border px-3 py-3" style={{ borderColor: theme.cardBorder }}>
          <Text className="text-xs" style={{ color: theme.textSubtle }}>
            Overrides the stage default for this group only.
          </Text>
          <View className="flex-row gap-2">
            <View className="flex-1">
              <AuthTextField
                label="Direct"
                keyboardType="number-pad"
                value={directCount}
                onChangeText={setDirectCount}
              />
            </View>
            <View className="flex-1">
              <AuthTextField
                label="Playoff from"
                keyboardType="number-pad"
                value={playoffFrom}
                onChangeText={setPlayoffFrom}
              />
            </View>
            <View className="flex-1">
              <AuthTextField
                label="Playoff to"
                keyboardType="number-pad"
                value={playoffTo}
                onChangeText={setPlayoffTo}
              />
            </View>
          </View>
          <View className="flex-row gap-2">
            <Button variant="secondary" label="Cancel" onPress={() => setEditingRule(false)} />
            <Button
              variant="authPurple"
              label="Save for this group"
              loading={updateConfigMutation.isPending}
              onPress={saveGroupRule}
            />
          </View>
        </View>
      ) : null}

      <View className="gap-1">
        <Text className="text-sm font-medium" style={{ color: theme.textMuted }}>
          Direct qualifiers
        </Text>
        {qualification.direct.map((row) => (
          <Text key={row.team?.id ?? row.position} className="text-sm" style={{ color: theme.text }}>
            #{row.position} {row.team?.name}
          </Text>
        ))}
        {qualification.direct.length === 0 ? (
          <Text className="text-sm" style={{ color: theme.textSubtle }}>
            None yet.
          </Text>
        ) : null}
      </View>

      {qualification.playoffCandidates.length > 0 ? (
        <View className="gap-1">
          <Text className="text-sm font-medium" style={{ color: theme.textMuted }}>
            Playoff candidates (ranks {qualification.rule.playoffRankFrom}-
            {qualification.rule.playoffRankTo})
          </Text>
          {qualification.playoffCandidates.map((row) => (
            <Text key={row.team?.id ?? row.position} className="text-sm" style={{ color: theme.text }}>
              #{row.position} {row.team?.name}
            </Text>
          ))}

          {playoffConfirmed ? (
            <Text className="pt-2 text-sm" style={{ color: theme.textSubtle }}>
              Playoff fixtures already created for this group - see the Games tab.
            </Text>
          ) : playoffQuery.data?.fixtures.length ? (
            <View className="gap-1 pt-2">
              {playoffQuery.data.fixtures.map((f, i) => {
                const home = qualification.playoffCandidates.find(
                  (r) => r.team?.id === f.homeTeamId,
                )?.team?.name;
                const away = qualification.playoffCandidates.find(
                  (r) => r.team?.id === f.awayTeamId,
                )?.team?.name;
                return (
                  <Text key={i} className="text-sm" style={{ color: theme.text }}>
                    {home ?? `#${f.homeTeamId}`} vs {away ?? `#${f.awayTeamId}`}
                  </Text>
                );
              })}
              <Button
                variant="authPurple"
                label="Confirm playoff fixtures"
                loading={confirmPlayoffMutation.isPending}
                onPress={handleConfirmPlayoff}
              />
            </View>
          ) : null}
        </View>
      ) : null}

      {knockoutExists ? (
        <Text className="text-sm" style={{ color: theme.textSubtle }}>
          Knockout bracket already generated - see the Knockout tab.
        </Text>
      ) : (
        <View className="gap-2 rounded-xl border px-3 py-3" style={{ borderColor: theme.cardBorder }}>
          <Text className="text-sm font-medium" style={{ color: theme.textMuted }}>
            Knockout preview (every group)
          </Text>
          {knockoutPreviewQuery.isLoading ? (
            <Text className="text-sm" style={{ color: theme.textSubtle }}>
              Checking groups…
            </Text>
          ) : (
            (knockoutPreview?.groups ?? []).map((g) => (
              <View key={g.stageGroupId} className="gap-0.5">
                <Text className="text-sm" style={{ color: theme.text }}>
                  {g.stageGroupName}
                </Text>
                {g.ready ? (
                  <Text className="text-xs" style={{ color: theme.textSubtle }}>
                    {g.qualifierTeamIds.map(teamName).join(", ")}
                  </Text>
                ) : (
                  <Text className="text-xs" style={{ color: theme.accent }}>
                    Not ready - {g.reason ?? "qualifiers are not resolved yet"}
                  </Text>
                )}
              </View>
            ))
          )}
        </View>
      )}

      {!knockoutExists ? (
        <Button
          variant="accent"
          label="Generate knockout from this stage…"
          disabled={!knockoutPreview?.ready}
          loading={generateKnockoutMutation.isPending}
          onPress={handleGenerateKnockout}
        />
      ) : null}
    </View>
  );
}

export function ManageSwissTab({
  leagueId,
  seasonId,
  stages,
  teams,
  games,
  onKnockoutGenerated,
}: Props) {
  const theme = useTheme();
  const initialSwiss = swissStages(stages);
  const initialStage = initialSwiss[0] ?? null;
  const needsFreshGroups = Boolean(initialStage) && (initialStage?.groups ?? []).length === 0;
  const freshStagesQuery = useSeasonStages(seasonId, needsFreshGroups);
  const effectiveStages =
    needsFreshGroups && freshStagesQuery.data?.length ? freshStagesQuery.data : stages;

  const swiss = swissStages(effectiveStages);
  const stage = swiss[0] ?? null;
  const config = stage ? readSwissConfig(stage) : null;
  const stageGroups = stage?.groups ?? [];

  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const activeGroupId = selectedGroupId ?? stageGroups[0]?.id ?? null;

  const stageGames = useMemo(
    () => (stage ? games.filter((g) => g.stageId === stage.id) : []),
    [games, stage],
  );
  const hasFixtures = stageGames.length > 0;
  const knockoutExists = stage
    ? effectiveStages.some((s) => s.stageType === "knockout" && s.sourceStageId === stage.id)
    : false;

  const assignMutation = useAssignSwissTeams(leagueId, seasonId);
  const [drawOpen, setDrawOpen] = useState(false);
  const [manualBuckets, setManualBuckets] = useState<Record<number, number[]>>({});
  const [locallyAssigned, setLocallyAssigned] = useState(false);

  // Fetch standings regardless of drawDone - it's the only persisted signal
  // that the draw already happened on an earlier visit (locallyAssigned is
  // just in-memory and resets on reload/remount).
  const standingsQuery = useStageStandings(stage?.id ?? 0, Boolean(stage));
  const serverAssigned = (standingsQuery.data?.tables ?? []).some(
    (t) => t.stageGroupId != null && t.rows.length > 0,
  );
  const drawDone =
    locallyAssigned ||
    serverAssigned ||
    hasFixtures ||
    stage?.status === "active" ||
    stage?.status === "completed";
  const groupTeamsByGroupId = useMemo(() => {
    const map = new Map<number, ApiTeam[]>();
    for (const table of standingsQuery.data?.tables ?? []) {
      if (table.stageGroupId == null) continue;
      map.set(
        table.stageGroupId,
        table.rows.map((r) => r.team).filter((t): t is ApiTeam => Boolean(t)),
      );
    }
    return map;
  }, [standingsQuery.data]);

  if (!stage) {
    return <CreateSwissStageForm leagueId={leagueId} seasonId={seasonId} />;
  }

  const openManualDraw = () => {
    if (!stageGroups.length) {
      showInfoToast("No groups", "Group rows are missing on this stage.");
      return;
    }
    const buckets: Record<number, number[]> = {};
    for (const g of stageGroups) buckets[g.id] = [];
    buckets[stageGroups[0]!.id] = teams.map((t) => t.id);
    setManualBuckets(buckets);
    setDrawOpen(true);
  };

  const handleAutoDraw = () => {
    Alert.alert(
      "Auto-draw groups?",
      "This is one-time. Once teams are assigned, the draw cannot be reversed from here.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Auto-draw",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await assignMutation.mutateAsync({
                  stageId: stage.id,
                  payload: { mode: "auto", teamIds: teams.map((t) => t.id), shuffle: true },
                });
                setLocallyAssigned(true);
                showInfoToast("Draw complete", "Teams were assigned to groups.");
              } catch {
                /* toasted */
              }
            })();
          },
        },
      ],
    );
  };

  const moveTeam = (teamId: number, toGroupId: number) => {
    setManualBuckets((prev) => {
      const next: Record<number, number[]> = {};
      for (const [gid, ids] of Object.entries(prev)) {
        next[Number(gid)] = ids.filter((id) => id !== teamId);
      }
      next[toGroupId] = [...(next[toGroupId] ?? []), teamId];
      return next;
    });
  };

  const handleConfirmManual = async () => {
    const assignments = Object.entries(manualBuckets).flatMap(([groupId, teamIds]) =>
      teamIds.map((teamId) => ({ teamId, stageGroupId: Number(groupId) })),
    );
    if (assignments.length !== teams.length) {
      showInfoToast("Assign every team", "Every enrolled team must be in a group.");
      return;
    }
    try {
      await assignMutation.mutateAsync({
        stageId: stage.id,
        payload: { mode: "manual", assignments },
      });
      setLocallyAssigned(true);
      setDrawOpen(false);
      showInfoToast("Draw saved", "Group assignments were stored.");
    } catch {
      /* toasted */
    }
  };

  return (
    <View className="gap-6 pb-8">
      <View className="gap-2">
        <Text className="text-lg" style={{ color: theme.text }}>
          {stage.name}
        </Text>
        <Text className="text-sm" style={{ color: theme.textSubtle }}>
          Status: {stage.status}
          {config ? ` · ${config.format.rounds} rounds · ${stageGroups.length} groups` : ""}
        </Text>
      </View>

      <Card>
        <Text className="text-base" style={{ color: theme.text }}>
          1. Draw
        </Text>
        {drawDone ? (
          <Text className="text-sm" style={{ color: theme.textSubtle }}>
            Teams are assigned
            {stageGroups.length ? ` across ${stageGroups.map((g) => g.name).join(", ")}` : ""}.
          </Text>
        ) : (
          <View className="gap-2">
            <Text className="text-sm" style={{ color: theme.textSubtle }}>
              The draw is one-time and cannot be reversed or edited after saving.
            </Text>
            <Button
              variant="authPurple"
              label="Auto-draw"
              loading={assignMutation.isPending}
              onPress={handleAutoDraw}
            />
            <Button variant="secondary" label="Manual draw" onPress={openManualDraw} />
          </View>
        )}
      </Card>

      {drawDone && activeGroupId ? (
        <Card>
          <Text className="text-base" style={{ color: theme.text }}>
            2. Rounds
          </Text>
          <GroupChips
            groups={stageGroups}
            selectedId={activeGroupId}
            onSelect={setSelectedGroupId}
          />
          <View className="gap-2">
            {Array.from({ length: config?.format.rounds ?? 0 }, (_, i) => i + 1).map(
              (roundNumber) => (
                <RoundCard
                  key={roundNumber}
                  leagueId={leagueId}
                  seasonId={seasonId}
                  stageId={stage.id}
                  stageGroupId={activeGroupId}
                  roundNumber={roundNumber}
                  teams={groupTeamsByGroupId.get(activeGroupId) ?? []}
                  stageGames={stageGames}
                  rounds={config?.format.rounds ?? 0}
                />
              ),
            )}
          </View>
        </Card>
      ) : null}

      {drawDone ? (
        <Card>
          <Text className="text-base" style={{ color: theme.text }}>
            3. Standings
          </Text>
          <GroupStandingsView tables={standingsQuery.data?.tables ?? []} />
        </Card>
      ) : null}

      {drawDone && activeGroupId ? (
        <Card>
          <Text className="text-base" style={{ color: theme.text }}>
            4. Qualification
          </Text>
          <GroupChips
            groups={stageGroups}
            selectedId={activeGroupId}
            onSelect={setSelectedGroupId}
          />
          <QualificationCard
            leagueId={leagueId}
            seasonId={seasonId}
            stageId={stage.id}
            stageGroupId={activeGroupId}
            stageConfig={config}
            teams={teams}
            stageGames={stageGames}
            knockoutExists={knockoutExists}
            onKnockoutGenerated={onKnockoutGenerated}
          />
        </Card>
      ) : null}

      <BottomSheetModal
        visible={drawOpen}
        onClose={() => setDrawOpen(false)}
        title="Manual draw"
        subtitle="Tap a team, then tap a destination group."
      >
        <ScrollView className="max-h-[420px]" nestedScrollEnabled>
          <View className="gap-4 pb-4">
            {stageGroups.map((group) => {
              const ids = manualBuckets[group.id] ?? [];
              return (
                <View key={group.id} className="gap-2">
                  <Text className="text-sm" style={{ color: theme.text }}>
                    {group.name} ({ids.length})
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {ids.map((teamId) => {
                      const team = teams.find((t) => t.id === teamId);
                      return (
                        <Pressable
                          key={teamId}
                          style={{ backgroundColor: theme.cardMuted, borderColor: theme.cardBorder }}
                          onPress={() => {
                            const others = stageGroups.filter((g) => g.id !== group.id);
                            if (!others.length) return;
                            Alert.alert("Move team", `Move ${team?.name ?? "team"} to…`, [
                              ...others.map((g) => ({ text: g.name, onPress: () => moveTeam(teamId, g.id) })),
                              { text: "Cancel", style: "cancel" as const },
                            ]);
                          }}
                          className="rounded-xl border px-3 py-2 active:opacity-85"
                        >
                          <Text className="text-sm" style={{ color: theme.text }}>
                            {team?.name ?? `#${teamId}`}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}
            <Button
              variant="authPurple"
              label="Confirm assignments"
              loading={assignMutation.isPending}
              onPress={() => void handleConfirmManual()}
            />
          </View>
        </ScrollView>
      </BottomSheetModal>
    </View>
  );
}
