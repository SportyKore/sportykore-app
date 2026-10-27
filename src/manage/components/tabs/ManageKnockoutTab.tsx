import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  View,
} from "react-native";

import type { ApiStage, ApiTeam, KnockoutStageConfig } from "@/api/entities";
import { useAppearance } from "@/color/appearance-context";
import { useTheme } from "@/color/use-theme";
import { Button } from "@/components/ui/Button";
import { AuthTextField } from "@/components/ui/auth-text-field";
import { BottomSheetModal } from "@/components/ui/bottom-sheet-modal";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  BracketView,
  KnockoutTieFormatControl,
  buildKnockoutConfig,
  buildSeedPreviewTies,
  byeCountForTeamCount,
  byeExplanation,
  completedRoundReadyForNext,
  latestIncompleteRound,
  roundLabel,
  useCreateKnockoutStage,
  useGenerateNextRound,
  useSeedKnockoutStage,
  useStageBracket,
  type TieFormatSelection,
} from "@/knockout";
import { showInfoToast, showThrownAsToast } from "@/lib/show-error-toast";

type Props = {
  leagueId: number;
  seasonId: number;
  stages: ApiStage[];
  teams: ApiTeam[];
};

export function ManageKnockoutTab({
  leagueId,
  seasonId,
  stages,
  teams,
}: Props) {
  const theme = useTheme();
  const knockouts = useMemo(
    () =>
      stages
        .filter((s) => s.stageType === "knockout")
        .sort((a, b) => a.sequence - b.sequence),
    [stages],
  );

  const [selectedStageId, setSelectedStageId] = useState<number | null>(
    knockouts[0]?.id ?? null,
  );
  const selected =
    knockouts.find((s) => s.id === selectedStageId) ?? knockouts[0] ?? null;

  const [createOpen, setCreateOpen] = useState(false);
  const [seedOpen, setSeedOpen] = useState(false);
  const hasKnockoutStage = knockouts.length > 0;

  return (
    <View className="gap-6 pb-8">
      <View
        className="rounded-[24px] border px-4 py-4"
        style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}
      >
        <View className="flex-row items-center gap-3">
          <View
            className="h-11 w-11 items-center justify-center rounded-2xl"
            style={{ backgroundColor: theme.accentMuted }}
          >
            <Ionicons name="trophy-outline" size={22} color={theme.accent} />
          </View>
          <View className="min-w-0 flex-1">
            <Text style={{ color: theme.text }}>
              Knockout cup
            </Text>
            <Text
              className="text-xs leading-5"
              style={{ color: theme.textSubtle }}
              numberOfLines={2}
            >
              {hasKnockoutStage
                ? "Seed the bracket and advance rounds for this cup."
                : "Add a cup stage, then seed teams in draw order."}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              if (hasKnockoutStage) {
                showInfoToast(
                  "Stage already exists",
                  "Knockout competitions can only have one stage.",
                );
                return;
              }
              setCreateOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Add cup"
            className={`h-10 flex-row items-center gap-1.5 rounded-full px-3 active:opacity-90 ${
              hasKnockoutStage ? "opacity-50" : ""
            }`}
            style={{
              backgroundColor: hasKnockoutStage ? theme.cardMuted : theme.accent,
            }}
          >
            <Ionicons
              name="add"
              size={16}
              color={hasKnockoutStage ? theme.textMuted : theme.textInverse}
            />
            <Text
              className="text-xs"
              style={{
                color: hasKnockoutStage ? theme.textMuted : theme.textInverse,
              }}
              numberOfLines={1}
            >
              Add
            </Text>
          </Pressable>
        </View>
      </View>

      {knockouts.length === 0 ? (
        <View
          className="rounded-[22px] border border-dashed px-5 py-8"
          style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}
        >
          <Text className="text-base" style={{ color: theme.text }}>
            No knockout stage
          </Text>
          <Text
            className="pt-2 text-sm leading-6"
            style={{ color: theme.textSubtle }}
          >
            Add a cup stage, then seed teams in draw order to build the bracket.
          </Text>
        </View>
      ) : (
        <View className="gap-3">
          <View className="flex-row flex-wrap gap-2">
            {knockouts.map((stage) => {
              const active = stage.id === selected?.id;
              return (
                <Pressable
                  key={stage.id}
                  onPress={() => setSelectedStageId(stage.id)}
                  className="rounded-xl border px-3 py-2 active:opacity-85"
                  style={{
                    backgroundColor: active ? theme.accentMuted : theme.card,
                    borderColor: active ? theme.accent : theme.cardBorder,
                  }}
                >
                  <Text
                    style={{ color: active ? theme.accent : theme.textMuted }}
                  >
                    {stage.name} · {stage.status}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {selected ? (
            <KnockoutStagePanel
              leagueId={leagueId}
              seasonId={seasonId}
              stage={selected}
              teams={teams}
              onOpenSeed={() => setSeedOpen(true)}
            />
          ) : null}
        </View>
      )}

      <CreateKnockoutStageSheet
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        leagueId={leagueId}
        seasonId={seasonId}
        onCreated={(id) => {
          setSelectedStageId(id);
          setCreateOpen(false);
        }}
      />

      {selected ? (
        <SeedKnockoutSheet
          visible={seedOpen}
          onClose={() => setSeedOpen(false)}
          leagueId={leagueId}
          seasonId={seasonId}
          stage={selected}
          teams={teams}
        />
      ) : null}
    </View>
  );
}

function KnockoutStagePanel({
  leagueId,
  seasonId,
  stage,
  teams,
  onOpenSeed,
}: {
  leagueId: number;
  seasonId: number;
  stage: ApiStage;
  teams: ApiTeam[];
  onOpenSeed: () => void;
}) {
  const router = useRouter();
  const { isDark } = useAppearance();
  const theme = useTheme();
  const bracketQuery = useStageBracket(stage.id, true);
  const nextRoundMutation = useGenerateNextRound(leagueId, seasonId);
  const ties = bracketQuery.data?.ties ?? [];
  const readyRound = completedRoundReadyForNext(ties);
  const needsSeed = stage.status === "upcoming" && ties.length === 0;
  const blockingRound =
    !needsSeed && !readyRound && stage.status !== "completed"
      ? latestIncompleteRound(ties)
      : null;

  const handleNextRound = () => {
    if (!readyRound) return;
    Alert.alert(
      "Generate next round",
      `Confirm pairings from ${readyRound}? This is a one-time action. Once the next round is generated, these pairings cannot be automatically undone from here.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Generate",
          style: "destructive",
          onPress: async () => {
            try {
              await nextRoundMutation.mutateAsync({
                stageId: stage.id,
                completedRound: readyRound,
              });
              showInfoToast("Round generated", "The next round is ready.");
            } catch (err) {
              showThrownAsToast(err, "Could not generate next round");
            }
          },
        },
      ],
    );
  };

  return (
    <View
      className="gap-4 rounded-[22px] border px-4 py-4"
      style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}
    >
      <View className="flex-row flex-wrap gap-2">
        {needsSeed ? (
          <>
            <KnockoutActionButton
              icon="git-branch-outline"
              label="Seed bracket"
              tone="gold"
              onPress={onOpenSeed}
              disabled={teams.length < 2}
            />
            {teams.length < 2 ? (
              <InfoTooltip
                title="Not enough teams"
                message="Add at least 2 teams to this league from the Teams tab before the bracket can be seeded."
              />
            ) : null}
          </>
        ) : null}
        {readyRound && readyRound !== "final" ? (
          <KnockoutActionButton
            icon="play-forward-outline"
            label={
              nextRoundMutation.isPending ? "Generating…" : "Generate next round"
            }
            tone="gold"
            onPress={handleNextRound}
            loading={nextRoundMutation.isPending}
          />
        ) : null}
        {readyRound === "final" && stage.status !== "completed" ? (
          <KnockoutActionButton
            icon="checkmark-done-outline"
            label="Mark stage complete"
            tone="gold"
            onPress={handleNextRound}
            loading={nextRoundMutation.isPending}
          />
        ) : null}
        {blockingRound ? (
          <InfoTooltip
            title="Next round not ready"
            message={`All ${roundLabel(blockingRound)} games must be completed before the next round can be generated.`}
            label={`${roundLabel(blockingRound)} not finished`}
          />
        ) : null}
      </View>

      {bracketQuery.isLoading ? (
        <ActivityIndicator color={theme.accent} />
      ) : (
        <BracketView
          ties={ties}
          tone={isDark ? "dark" : "light"}
          hasThirdPlace={Boolean(
            (stage.config as KnockoutStageConfig | undefined)?.format
              ?.has_third_place,
          )}
          onTiePress={(tie) => {
            const openGame = (tie.games ?? []).find(
              (g) =>
                g.status !== "full_time" &&
                g.status !== "completed" &&
                g.status !== "cancelled",
            );
            const anyGame = openGame ?? tie.games?.[0];
            if (anyGame) {
              router.push(`/manage/${leagueId}/game/${anyGame.id}`);
            }
          }}
        />
      )}
    </View>
  );
}

function KnockoutActionButton({
  icon,
  label,
  tone,
  loading,
  disabled,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tone: "gold" | "subtle";
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const inactive = disabled || loading;
  const gold = tone === "gold";

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      className={`h-10 flex-row items-center justify-center gap-1.5 rounded-full border px-3 active:opacity-90 ${
        inactive ? "opacity-50" : ""
      }`}
      style={{
        flexGrow: 1,
        minWidth: 148,
        backgroundColor: gold ? theme.accent : theme.cardMuted,
        borderColor: gold ? theme.accent : theme.cardBorder,
      }}
    >
      {loading ? (
        <ActivityIndicator
          color={gold ? theme.textInverse : theme.text}
          size="small"
        />
      ) : (
        <>
          <Ionicons
            name={icon}
            size={15}
            color={gold ? theme.textInverse : theme.textMuted}
          />
          <Text
            className="min-w-0 text-center text-xs"
            style={{ color: gold ? theme.textInverse : theme.text }}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.82}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

function CreateKnockoutStageSheet({
  visible,
  onClose,
  leagueId,
  seasonId,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  leagueId: number;
  seasonId: number;
  onCreated: (stageId: number) => void;
}) {
  const createMutation = useCreateKnockoutStage(leagueId, seasonId);
  const [name, setName] = useState("Cup");
  const [tieFormat, setTieFormat] = useState<TieFormatSelection>({
    kind: "single",
  });
  const [hasThirdPlace, setHasThirdPlace] = useState(false);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      showInfoToast("Name required", "Enter a stage name.");
      return;
    }
    try {
      const result = await createMutation.mutateAsync({
        seasonId,
        name: trimmed,
        config: buildKnockoutConfig(tieFormat, hasThirdPlace),
      });
      showInfoToast("Cup stage added", "Seed teams to build the bracket.");
      onCreated(result.id);
      setName("Cup");
      setTieFormat({ kind: "single" });
      setHasThirdPlace(false);
    } catch {
      /* toasted in hook */
    }
  };

  return (
    <BottomSheetModal
      visible={visible}
      onClose={onClose}
      title="Add knockout stage"
      subtitle="Cup / playoff bracket for this season"
    >
      <View className="gap-4">
        <AuthTextField
          label="Stage name"
          value={name}
          onChangeText={setName}
          placeholder="Cup"
        />
        <KnockoutTieFormatControl
          value={tieFormat}
          onChange={setTieFormat}
          hasThirdPlace={hasThirdPlace}
          onHasThirdPlaceChange={setHasThirdPlace}
          tone="light"
        />
        <Button
          variant="authPurple"
          label={createMutation.isPending ? "Creating…" : "Create stage"}
          loading={createMutation.isPending}
          onPress={() => void handleCreate()}
        />
      </View>
    </BottomSheetModal>
  );
}

function SeedKnockoutSheet({
  visible,
  onClose,
  leagueId,
  seasonId,
  stage,
  teams,
}: {
  visible: boolean;
  onClose: () => void;
  leagueId: number;
  seasonId: number;
  stage: ApiStage;
  teams: ApiTeam[];
}) {
  const theme = useTheme();
  const seedMutation = useSeedKnockoutStage(leagueId, seasonId);
  const [order, setOrder] = useState<ApiTeam[]>(() => [...teams]);
  const [step, setStep] = useState<"order" | "preview">("order");

  useEffect(() => {
    if (visible) {
      setOrder([...teams]);
      setStep("order");
    }
  }, [visible, teams]);

  const byeCount = byeCountForTeamCount(order.length);
  const previewTies = useMemo(
    () => buildSeedPreviewTies(order, stage.config),
    [order, stage.config],
  );
  const hasThirdPlace = Boolean(
    (stage.config as KnockoutStageConfig | undefined)?.format?.has_third_place,
  );

  const move = (index: number, dir: -1 | 1) => {
    const next = index + dir;
    if (next < 0 || next >= order.length) return;
    setOrder((rows) => {
      const copy = [...rows];
      const tmp = copy[index]!;
      copy[index] = copy[next]!;
      copy[next] = tmp;
      return copy;
    });
  };

  const handlePreview = () => {
    if (order.length < 2) {
      showInfoToast("Need teams", "Add at least two teams before seeding.");
      return;
    }
    setStep("preview");
  };

  const handleGenerate = async () => {
    Alert.alert(
      "Generate bracket?",
      "This is a one-time action. Once the bracket is generated, the seed order, ties, and fixtures cannot be reversed or edited from this seeding flow.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Generate",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await seedMutation.mutateAsync({
                  stageId: stage.id,
                  seededTeams: order.map((t) => t.id),
                });
                showInfoToast("Bracket seeded", "Ties and fixtures are ready.");
                onClose();
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
      onClose={onClose}
      title={step === "order" ? "Seed bracket" : "Preview bracket"}
      subtitle={
        step === "order"
          ? "Top of the list is seed 1. Teams pair in list order - 1 v 2, 3 v 4 - and byes go to the top seeds."
          : "Check the matchups before you lock them in."
      }
      scrollEnabled
    >
      {step === "order" ? (
        <View className="gap-4">
          <SeedSheetBlock title="Seed order">
            <View
              className="flex-row items-start gap-2 rounded-2xl border px-3 py-3"
              style={{ backgroundColor: theme.accentMuted, borderColor: theme.accent }}
            >
              <Ionicons name="information-circle-outline" size={18} color={theme.accent} />
              <Text
                className="min-w-0 flex-1 text-xs leading-5"
                style={{ color: theme.textMuted }}
              >
                {order.length} teams
                {byeCount > 0
                  ? byeCount === 1
                    ? ". Top seed skips round one."
                    : `. Top ${byeCount} seeds skip round one.`
                  : ". No byes needed."}
              </Text>
            </View>
            {order.map((team, index) => (
              <View
                key={team.id}
                className="flex-row items-center gap-3 rounded-[18px] border px-3 py-3"
                style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}
              >
                <View className="h-9 w-9 items-center justify-center rounded-2xl" style={{ backgroundColor: theme.accentMuted }}>
                  <Text
                    className="text-xs"
                    style={{ color: theme.accent }}
                  >
                    {index + 1}
                  </Text>
                </View>
                <Text
                  className="min-w-0 flex-1 text-sm"
                  style={{ color: theme.text }}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {team.name}
                </Text>
                <SeedMoveButton
                  icon="chevron-up"
                  disabled={index === 0}
                  onPress={() => move(index, -1)}
                />
                <SeedMoveButton
                  icon="chevron-down"
                  disabled={index === order.length - 1}
                  onPress={() => move(index, 1)}
                />
              </View>
            ))}
          </SeedSheetBlock>
          <Button
            variant="authPurple"
            label="Preview bracket"
            onPress={handlePreview}
          />
        </View>
      ) : (
        <View className="gap-4">
          <SeedSheetBlock title="Bracket preview">
            <View style={{ marginHorizontal: -16 }}>
              <BracketView
                ties={previewTies}
                tone="dark"
                hasThirdPlace={hasThirdPlace}
              />
            </View>
            {byeExplanation(order.length) ? (
              <Text
                className="text-sm leading-6"
                style={{ color: theme.textSubtle }}
              >
                {byeExplanation(order.length)}
              </Text>
            ) : null}
          </SeedSheetBlock>
          <View
            className="flex-row items-start gap-2 rounded-2xl border px-3 py-3"
            style={{ backgroundColor: theme.accentMuted, borderColor: theme.accent }}
          >
            <Ionicons name="warning" size={18} color={theme.accent} />
            <Text
              className="min-w-0 flex-1 text-sm leading-5"
              style={{ color: theme.textMuted }}
            >
              Generating the bracket locks the seeding. You can&apos;t reorder
              or re-seed teams once ties and fixtures are created.
            </Text>
          </View>
          <View className="flex-row gap-3">
            <Button
              variant="secondary"
              label="Back"
              onPress={() => setStep("order")}
              className="flex-1"
            />
            <Button
              variant="authPurple"
              label={seedMutation.isPending ? "Generating…" : "Generate bracket"}
              loading={seedMutation.isPending}
              onPress={() => void handleGenerate()}
              className="flex-1"
            />
          </View>
        </View>
      )}
    </BottomSheetModal>
  );
}

function SeedSheetBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const theme = useTheme();

  return (
    <View
      className="gap-3 rounded-[18px] border px-3 py-3"
      style={{ backgroundColor: theme.cardMuted, borderColor: theme.cardBorder }}
    >
      <Text
        className="text-xs uppercase tracking-wide"
        style={{ color: theme.textSubtle }}
      >
        {title}
      </Text>
      <View className="gap-3">{children}</View>
    </View>
  );
}

function SeedMoveButton({
  icon,
  disabled,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      className={`h-9 w-9 items-center justify-center rounded-xl border active:opacity-85 ${
        disabled ? "opacity-35" : ""
      }`}
      style={{ backgroundColor: theme.cardMuted, borderColor: theme.cardBorder }}
    >
      <Ionicons
        name={icon}
        size={17}
        color={disabled ? theme.textSubtle : theme.text}
      />
    </Pressable>
  );
}
