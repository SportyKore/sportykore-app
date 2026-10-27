import { useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import type { ApiGame, ApiStage, ApiTeam, BracketRound } from "@/api/entities";
import { useAppearance } from "@/color/appearance-context";
import { useTheme } from "@/color/use-theme";
import { Button } from "@/components/ui/Button";
import { BottomSheetModal } from "@/components/ui/bottom-sheet-modal";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  estimatedGamesPerGroup,
  groupStages,
  readGroupConfig,
  useAssignGroupTeams,
  useGenerateGroupFixtures,
  useGenerateKnockoutFromGroup,
  useQualifiersPreview,
  useStageStandings,
  type QualifierEntry,
} from "@/groups";
import {
  KnockoutTieFormatControl,
  buildKnockoutConfig,
  seedSourceFromTeamIds,
  type TieFormatSelection,
  useSeasonStages,
} from "@/knockout";
import { showInfoToast } from "@/lib/show-error-toast";

type Props = {
  leagueId: number;
  seasonId: number;
  stages: ApiStage[];
  teams: ApiTeam[];
  games: ApiGame[];
  onKnockoutGenerated?: () => void;
};

export function ManageGroupsTab({
  leagueId,
  seasonId,
  stages,
  teams,
  games,
  onKnockoutGenerated,
}: Props) {
  const { isDark } = useAppearance();
  const theme = useTheme();
  const initialGroups = groupStages(stages);
  const initialStage = initialGroups[0] ?? null;
  const needsFreshGroups =
    Boolean(initialStage) && (initialStage?.groups ?? []).length === 0;
  const freshStagesQuery = useSeasonStages(seasonId, needsFreshGroups);
  const effectiveStages =
    needsFreshGroups && freshStagesQuery.data?.length
      ? freshStagesQuery.data
      : stages;
  const groups = groupStages(effectiveStages);
  const stage = groups[0] ?? null;
  const config = stage ? readGroupConfig(stage) : null;
  const stageGroups = stage?.groups ?? [];

  const stageGames = useMemo(
    () => (stage ? games.filter((g) => g.stageId === stage.id) : []),
    [games, stage],
  );
  const hasFixtures = stageGames.length > 0;

  const assignMutation = useAssignGroupTeams(leagueId, seasonId);
  const fixturesMutation = useGenerateGroupFixtures(leagueId, seasonId);
  const standingsQuery = useStageStandings(stage?.id ?? 0, Boolean(stage));

  const [drawOpen, setDrawOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [manualBuckets, setManualBuckets] = useState<Record<number, number[]>>(
    {},
  );
  const [locallyAssigned, setLocallyAssigned] = useState(false);
  // Assignment is one-shot on the server; group standings tables only have
  // rows once stage_teams exist, so use them to detect a persisted draw.
  const serverAssigned = (standingsQuery.data?.tables ?? []).some(
    (t) => t.stageGroupId != null && t.rows.length > 0,
  );
  const drawDone =
    locallyAssigned ||
    serverAssigned ||
    hasFixtures ||
    stage?.status === "active" ||
    stage?.status === "completed";

  const openManualDraw = () => {
    if (!stage || !stageGroups.length) {
      if (needsFreshGroups && freshStagesQuery.isFetching) {
        showInfoToast("Loading groups", "Fetching the latest group rows.");
        return;
      }
      if (freshStagesQuery.isError) {
        showInfoToast(
          "Could not load groups",
          "Refresh this league and try the draw again.",
        );
        return;
      }
      showInfoToast("No groups", "Group rows are missing on this stage.");
      return;
    }
    const buckets: Record<number, number[]> = {};
    for (const g of stageGroups) buckets[g.id] = [];
    // Distribute empty - user moves teams
    const unassigned = teams.map((t) => t.id);
    buckets[stageGroups[0]!.id] = unassigned;
    setManualBuckets(buckets);
    setDrawOpen(true);
  };

  const handleAutoDraw = async (shuffle: boolean) => {
    if (!stage) return;
    try {
      await assignMutation.mutateAsync({
        stageId: stage.id,
        payload: {
          mode: "auto",
          teamIds: teams.map((t) => t.id),
          shuffle,
        },
      });
      setLocallyAssigned(true);
      showInfoToast("Draw complete", "Teams were assigned to groups.");
    } catch {
      /* toasted */
    }
  };

  const confirmAutoDraw = (shuffle: boolean) => {
    Alert.alert(
      "Auto-draw groups?",
      "This is a one-time action. Once teams are assigned to groups, the draw cannot be reversed or edited. Continue only if you are ready to lock these groups.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Auto-draw",
          style: "destructive",
          onPress: () => void handleAutoDraw(shuffle),
        },
      ],
    );
  };

  const handleConfirmManual = async () => {
    if (!stage) return;
    const assignments = Object.entries(manualBuckets).flatMap(
      ([groupId, teamIds]) =>
        teamIds.map((teamId) => ({
          teamId,
          stageGroupId: Number(groupId),
        })),
    );
    if (assignments.length !== teams.length) {
      showInfoToast("Assign every team", "Every enrolled team must be in a group.");
      return;
    }
    Alert.alert(
      "Confirm manual draw?",
      "This is a one-time action. Once these assignments are saved, the draw cannot be reversed or edited. Continue only if every team is in the correct group.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Save draw",
          style: "destructive",
          onPress: () => {
            void (async () => {
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

  const handleGenerateFixtures = () => {
    if (!stage || !config) return;
    const perGroupEstimate = Math.ceil(teams.length / config.format.group_count);
    const gamesEach = estimatedGamesPerGroup(
      perGroupEstimate,
      config.format.double_round_robin,
    );
    Alert.alert(
      "Generate fixtures",
      `About ${gamesEach} games per group (~${gamesEach * config.format.group_count} total) will be created. This is a one-time action. Once fixtures are generated, the schedule cannot be automatically undone from here. Continue?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Generate",
          onPress: () => {
            void (async () => {
              try {
                const res = await fixturesMutation.mutateAsync(stage.id);
                showInfoToast(
                  "Fixtures created",
                  `${res.count} games were scheduled.`,
                );
              } catch {
                /* toasted */
              }
            })();
          },
        },
      ],
    );
  };

  if (!stage) {
    return (
      <Text className="text-sm" style={{ color: theme.textSubtle }}>
        No group stage on this season.
      </Text>
    );
  }

  return (
    <View className="gap-6 pb-8">
      <View className="gap-2">
        <Text className="text-lg" style={{ color: theme.text }}>
          {stage.name}
        </Text>
        <Text className="text-sm" style={{ color: theme.textSubtle }}>
          Status: {stage.status}
          {config
            ? ` · ${config.format.group_count} groups · top ${config.advancement.per_group} advance`
            : ""}
        </Text>
      </View>

      <View
        className="gap-3 rounded-[22px] border px-4 py-4"
        style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}
      >
        <Text className="text-base" style={{ color: theme.text }}>
          1. Draw
        </Text>
        {drawDone ? (
          <Text className="text-sm" style={{ color: theme.textSubtle }}>
            Teams are assigned
            {stageGroups.length
              ? ` across ${stageGroups.map((g) => g.name).join(", ")}`
              : ""}
            .
          </Text>
        ) : (
          <View className="gap-2">
            <Text className="text-sm" style={{ color: theme.textSubtle }}>
              Uneven groups are allowed. The draw is one-time and cannot be
              reversed or edited after saving.
            </Text>
            <Button
              variant="authPurple"
              label="Auto-draw"
              loading={assignMutation.isPending}
              onPress={() => confirmAutoDraw(true)}
            />
            <Button
              variant="secondary"
              label="Manual draw"
              onPress={openManualDraw}
            />
          </View>
        )}
      </View>

      <View
        className="gap-3 rounded-[22px] border px-4 py-4"
        style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}
      >
        <Text className="text-base" style={{ color: theme.text }}>
          2. Fixtures
        </Text>
        <View className="flex-row items-center gap-2">
          <View className="flex-1">
            <Button
              variant="accent"
              label={hasFixtures ? "Fixtures already generated" : "Generate fixtures"}
              disabled={!drawDone || hasFixtures}
              loading={fixturesMutation.isPending}
              onPress={handleGenerateFixtures}
            />
          </View>
          {!drawDone ? (
            <InfoTooltip
              size={22}
              title="Draw not done"
              message="Complete the draw above before fixtures can be generated."
            />
          ) : null}
        </View>
      </View>

      <View
        className="gap-3 rounded-[22px] border px-4 py-4"
        style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}
      >
        <Text className="text-base" style={{ color: theme.text }}>
          3. Knockout phase
        </Text>
        <Text className="text-sm" style={{ color: theme.textSubtle }}>
          Preview qualifiers without writing until you confirm.
        </Text>
        <View className="flex-row items-center gap-2">
          <View className="flex-1">
            <Button
              variant="authPurple"
              label="Generate knockout…"
              disabled={!drawDone}
              onPress={() => setWizardOpen(true)}
            />
          </View>
          {!drawDone ? (
            <InfoTooltip
              size={22}
              title="Draw not done"
              message="Complete the draw above before the knockout can be generated."
            />
          ) : null}
        </View>
      </View>

      <BottomSheetModal
        visible={drawOpen}
        onClose={() => setDrawOpen(false)}
        title="Manual draw"
        subtitle="Tap a team, then tap a destination group. Uneven sizes are fine."
      >
        <ScrollView className="max-h-[420px]" nestedScrollEnabled>
          <View className="gap-4 pb-4">
            {stageGroups.map((group) => {
              const ids = manualBuckets[group.id] ?? [];
              return (
                <View key={group.id} className="gap-2">
                  <Text
                    className="text-sm"
                    style={{ color: theme.text }}
                  >
                    {group.name} ({ids.length})
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {ids.map((teamId) => {
                      const team = teams.find((t) => t.id === teamId);
                      return (
                        <Pressable
                          key={teamId}
                          style={{
                            maxWidth: "100%",
                            backgroundColor: theme.cardMuted,
                            borderColor: theme.cardBorder,
                          }}
                          onPress={() => {
                            const others = stageGroups.filter(
                              (g) => g.id !== group.id,
                            );
                            if (!others.length) return;
                            Alert.alert(
                              "Move team",
                              `Move ${team?.name ?? "team"} to…`,
                              [
                                ...others.map((g) => ({
                                  text: g.name,
                                  onPress: () => moveTeam(teamId, g.id),
                                })),
                                { text: "Cancel", style: "cancel" as const },
                              ],
                            );
                          }}
                          className="rounded-xl border px-3 py-2 active:opacity-85"
                        >
                          <Text
                            className="text-sm"
                            style={{ color: theme.text }}
                            numberOfLines={1}
                            ellipsizeMode="tail"
                          >
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

      {stage ? (
        <GenerateKnockoutWizard
          visible={wizardOpen}
          onClose={() => setWizardOpen(false)}
          leagueId={leagueId}
          seasonId={seasonId}
          stageId={stage.id}
          isDark={isDark}
          onDone={() => {
            setWizardOpen(false);
            onKnockoutGenerated?.();
          }}
        />
      ) : null}
    </View>
  );
}

function GenerateKnockoutWizard({
  visible,
  onClose,
  leagueId,
  seasonId,
  stageId,
  isDark,
  onDone,
}: {
  visible: boolean;
  onClose: () => void;
  leagueId: number;
  seasonId: number;
  stageId: number;
  isDark: boolean;
  onDone: () => void;
}) {
  const theme = useTheme();
  const [step, setStep] = useState(1);
  const [targetRound, setTargetRound] = useState<BracketRound | undefined>();
  const [thirdsMode, setThirdsMode] = useState<"auto" | "manual">("auto");
  const [selectedThirds, setSelectedThirds] = useState<number[]>([]);
  const [qualifierIds, setQualifierIds] = useState<number[] | null>(null);
  const [tieFormat, setTieFormat] = useState<TieFormatSelection>({
    kind: "single",
  });
  const [hasThirdPlace, setHasThirdPlace] = useState(false);

  const previewQuery = useQualifiersPreview(
    stageId,
    {
      dryRun: true,
      targetRound,
      thirdsMode,
      selectedThirds:
        thirdsMode === "manual" ? selectedThirds : undefined,
    },
    visible,
  );

  const generateMutation = useGenerateKnockoutFromGroup(leagueId, seasonId);

  const preview = previewQuery.data;
  const options = (preview?.options ?? []).filter((o) => o.feasible !== false);
  const thirdsNeeded = preview?.thirdsNeeded ?? 0;
  const ordered =
    qualifierIds ??
    (preview?.qualifiers ?? []).map((q) => q.teamId).filter(Boolean);

  const reset = () => {
    setStep(1);
    setTargetRound(undefined);
    setThirdsMode("auto");
    setSelectedThirds([]);
    setQualifierIds(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleConfirm = async () => {
    const seed = seedSourceFromTeamIds(ordered);
    Alert.alert(
      "Generate knockout?",
      "This is a one-time action. Once the knockout stage is created, the selected qualifiers and seeding cannot be edited from this wizard.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Generate",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await generateMutation.mutateAsync({
                  stageId,
                  payload: {
                    targetRound,
                    thirdsMode: thirdsNeeded > 0 ? thirdsMode : undefined,
                    selectedThirds:
                      thirdsMode === "manual" ? selectedThirds : undefined,
                    qualifiers: seed.orderedTeamIds,
                    force: (preview?.outstandingGames ?? 0) > 0,
                    name: "Knockout",
                    config: buildKnockoutConfig(tieFormat, hasThirdPlace),
                  },
                });
                showInfoToast(
                  "Knockout created",
                  "Bracket is ready on the Knockout tab.",
                );
                handleClose();
                onDone();
              } catch {
                /* toasted */
              }
            })();
          },
        },
      ],
    );
  };

  return (
    <BottomSheetModal
      visible={visible}
      onClose={handleClose}
      title="Generate knockout"
      subtitle={`Step ${step} of 5 - nothing is saved until you confirm.`}
    >
      <ScrollView className="max-h-[480px]" nestedScrollEnabled>
        <View className="gap-4 pb-6">
          {previewQuery.isFetching ? (
            <Text className="text-sm" style={{ color: theme.textSubtle }}>
              Loading preview…
            </Text>
          ) : null}

          {(preview?.outstandingGames ?? 0) > 0 ? (
            <Text className="text-sm" style={{ color: theme.accent }}>
              {preview!.outstandingGames} group games still outstanding. Confirm
              will use force if needed.
            </Text>
          ) : null}

          {step === 1 ? (
            <View className="gap-2">
              <Text style={{ color: theme.text }}>
                Choose bracket entry
              </Text>
              {(options.length
                ? options
                : [
                    {
                      targetRound: "qf" as BracketRound,
                      qualifyCount: 8,
                      byeCount: 0,
                      thirdsNeeded: 0,
                      feasible: true,
                      summary: "Automatic - winners + runners-up (byes fill gaps)",
                    },
                  ]
              ).map((opt) => {
                const active = targetRound === opt.targetRound;
                return (
                  <Pressable
                    key={opt.targetRound}
                    onPress={() => setTargetRound(opt.targetRound)}
                    className="rounded-xl border px-3 py-3"
                    style={{
                      backgroundColor: active ? theme.accentMuted : theme.cardMuted,
                      borderColor: active ? theme.accent : theme.cardBorder,
                    }}
                  >
                    <Text
                      style={{ color: theme.text }}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {opt.label ?? opt.targetRound.toUpperCase()}
                    </Text>
                    <Text
                      className="pt-1 text-xs"
                      style={{ color: theme.textSubtle }}
                      numberOfLines={2}
                    >
                      {opt.summary ??
                        `${opt.qualifyCount} qualify · ${opt.byeCount} byes · ${opt.thirdsNeeded} thirds`}
                    </Text>
                  </Pressable>
                );
              })}
              <Button
                variant="authPurple"
                label="Next"
                onPress={() => {
                  if (!targetRound && options[0]) {
                    setTargetRound(options[0].targetRound);
                  }
                  setStep(thirdsNeeded > 0 || (preview?.thirdsNeeded ?? 0) > 0 ? 2 : 3);
                }}
              />
            </View>
          ) : null}

          {step === 2 ? (
            <View className="gap-3">
              <Text style={{ color: theme.text }}>
                Third-placed teams
              </Text>
              <View className="flex-row gap-2">
                {(["auto", "manual"] as const).map((mode) => (
                  <Pressable
                    key={mode}
                    onPress={() => setThirdsMode(mode)}
                    className="flex-1 rounded-xl border px-3 py-2"
                    style={{
                      backgroundColor:
                        thirdsMode === mode ? theme.accentMuted : theme.cardMuted,
                      borderColor:
                        thirdsMode === mode ? theme.accent : theme.cardBorder,
                    }}
                  >
                    <Text
                      className="text-center capitalize"
                      style={{ color: theme.text }}
                      numberOfLines={1}
                    >
                      {mode}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {(preview?.thirdsCandidates ?? []).map((c) => {
                const selected = selectedThirds.includes(c.teamId);
                return (
                  <Pressable
                    key={c.teamId}
                    disabled={thirdsMode === "auto"}
                    onPress={() => {
                      setSelectedThirds((prev) =>
                        selected
                          ? prev.filter((id) => id !== c.teamId)
                          : [...prev, c.teamId],
                      );
                    }}
                    className="rounded-xl border px-3 py-2"
                    style={{
                      backgroundColor:
                        selected || thirdsMode === "auto"
                          ? theme.accentMuted
                          : theme.cardMuted,
                      borderColor:
                        selected || thirdsMode === "auto"
                          ? theme.accent
                          : theme.cardBorder,
                    }}
                  >
                    <Text
                      style={{ color: theme.text }}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {c.teamName}
                      {c.stageGroupName ? ` · ${c.stageGroupName}` : ""}
                    </Text>
                  </Pressable>
                );
              })}
              <View className="flex-row gap-2">
                <Button
                  variant="secondary"
                  label="Back"
                  className="flex-1"
                  onPress={() => setStep(1)}
                />
                <Button
                  variant="authPurple"
                  label="Next"
                  className="flex-1"
                  onPress={() => {
                    if (
                      thirdsMode === "manual" &&
                      selectedThirds.length !== thirdsNeeded
                    ) {
                      showInfoToast(
                        "Select thirds",
                        `Pick exactly ${thirdsNeeded} third-placed teams.`,
                      );
                      return;
                    }
                    setStep(3);
                  }}
                />
              </View>
            </View>
          ) : null}

          {step === 3 ? (
            <View className="gap-3">
              <Text style={{ color: theme.text }}>
                Review qualifiers
              </Text>
              <Text className="text-xs" style={{ color: theme.textSubtle }}>
                Tap two rows to swap. Every entry is editable.
              </Text>
              <QualifierListEditor
                entries={
                  (preview?.qualifiers as QualifierEntry[] | undefined) ?? []
                }
                orderedIds={ordered}
                onChange={setQualifierIds}
                theme={theme}
              />
              <View className="flex-row gap-2">
                <Button
                  variant="secondary"
                  label="Back"
                  className="flex-1"
                  onPress={() => setStep(thirdsNeeded > 0 ? 2 : 1)}
                />
                <Button
                  variant="authPurple"
                  label="Next"
                  className="flex-1"
                  onPress={() => setStep(4)}
                />
              </View>
            </View>
          ) : null}

          {step === 4 ? (
            <View className="gap-3">
              <Text style={{ color: theme.text }}>
                Knockout settings
              </Text>
              <KnockoutTieFormatControl
                value={tieFormat}
                onChange={setTieFormat}
                hasThirdPlace={hasThirdPlace}
                onHasThirdPlaceChange={setHasThirdPlace}
                tone={isDark ? "dark" : "light"}
              />
              <View className="flex-row gap-2">
                <Button
                  variant="secondary"
                  label="Back"
                  className="flex-1"
                  onPress={() => setStep(3)}
                />
                <Button
                  variant="authPurple"
                  label="Next"
                  className="flex-1"
                  onPress={() => setStep(5)}
                />
              </View>
            </View>
          ) : null}

          {step === 5 ? (
            <View className="gap-3">
              <Text style={{ color: theme.text }}>
                Confirm
              </Text>
              <Text className="text-sm" style={{ color: theme.textSubtle }}>
                Creates a knockout stage seeded with {ordered.length} teams
                {targetRound ? ` starting at ${targetRound}` : ""}.
              </Text>
              <View className="flex-row gap-2">
                <Button
                  variant="secondary"
                  label="Back"
                  className="flex-1"
                  onPress={() => setStep(4)}
                />
                <Button
                  variant="accent"
                  label="Generate knockout"
                  className="flex-1"
                  loading={generateMutation.isPending}
                  onPress={() => void handleConfirm()}
                />
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </BottomSheetModal>
  );
}

function QualifierListEditor({
  entries,
  orderedIds,
  onChange,
  theme,
}: {
  entries: QualifierEntry[];
  orderedIds: number[];
  onChange: (ids: number[]) => void;
  theme: ReturnType<typeof useTheme>;
}) {
  const [swapFrom, setSwapFrom] = useState<number | null>(null);
  const byId = new Map(entries.map((e) => [e.teamId, e]));

  return (
    <View className="gap-2">
      {orderedIds.map((id, index) => {
        const entry = byId.get(id);
        const active = swapFrom === id;
        return (
          <Pressable
            key={`${id}-${index}`}
            onPress={() => {
              if (swapFrom == null) {
                setSwapFrom(id);
                return;
              }
              if (swapFrom === id) {
                setSwapFrom(null);
                return;
              }
              const next = [...orderedIds];
              const a = next.indexOf(swapFrom);
              const b = next.indexOf(id);
              if (a >= 0 && b >= 0) {
                const tmp = next[a]!;
                next[a] = next[b]!;
                next[b] = tmp;
                onChange(next);
              }
              setSwapFrom(null);
            }}
            className="rounded-xl border px-3 py-2"
            style={{
              backgroundColor: active ? theme.accentMuted : theme.cardMuted,
              borderColor: active ? theme.accent : theme.cardBorder,
            }}
          >
            <Text
              style={{ color: theme.text }}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {index + 1}. {entry?.teamName ?? `Team ${id}`}
              {entry?.stageGroupName ? ` · ${entry.stageGroupName}` : ""}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
