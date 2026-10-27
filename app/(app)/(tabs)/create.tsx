import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import type { ReactNode } from "react";
import { useState } from "react";
import {
  Pressable,
  Text,
  TextInput,
  View
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import type { CompetitionFormat } from "@/api/entities";
import { ApiError } from "@/api/errors";
import { useAuthGate } from "@/auth";
import { useAppearance } from "@/color/appearance-context";
import { useTheme } from "@/color/use-theme";
import { Button } from "@/components/ui/Button";
import { CountryLabel } from "@/components/ui/CountryFlag";
import { AuthTextField } from "@/components/ui/auth-text-field";
import { CountryPicker } from "@/components/ui/country-picker";
import { FormFieldLabel } from "@/components/ui/form-field-label";
import { LogoImageUpload } from "@/components/ui/logo-image-upload";
import { NativeDatePickerField } from "@/components/ui/native-date-picker-field";
import { OfflineBanner } from "@/components/ui/offline-banner";
import {
  GroupFormatConfigControl,
  buildDefaultGroupConfig,
  type GroupFormatFormState,
} from "@/groups";
import {
  SwissFormatConfigControl,
  buildSwissStageConfig,
  defaultSwissFormatFormState,
  type SwissFormatFormState,
} from "@/swiss";
import { useAdaptiveLayout } from "@/hooks/useAdaptiveLayout";
import {
  KnockoutTieFormatControl,
  buildKnockoutConfig,
  type TieFormatSelection,
} from "@/knockout";
import {
  COMPETITION_FORMAT_COPY,
  competitionFormatLabel,
} from "@/league/competition-format-copy";
import { CompetitionFormatPicker } from "@/league/components/CompetitionFormatPicker";
import { TiebreakerPicker } from "@/league/components/TiebreakerPicker";
import { useCreateLeague } from "@/league/hooks";
import {
  DIVISION_OPTIONS,
  type CountryOption,
} from "@/league/league-create-constants";
import {
  DEFAULT_TIEBREAKER,
  tiebreakerLabel,
  type TiebreakerRule,
} from "@/league/tiebreaker-options";
import { parseCalendarDate } from "@/lib/datetime";
import { pickCompetitionLogo } from "@/lib/pick-competition-logo";
import type { PickedImageFile } from "@/lib/picked-image";
import { posthog } from "@/lib/posthog";

const TOTAL_STEPS = 3;

type AppTheme = ReturnType<typeof useTheme>;

type TeamRow = {
  id: string;
  name: string;
  logo: PickedImageFile | null;
};

function newTeamRow(): TeamRow {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, name: "", logo: null };
}

export default function CreateScreen() {
  const [step, setStep] = useState(1);
  const insets = useSafeAreaInsets();
  const { isDark } = useAppearance();
  const theme = useTheme();
  const { isTablet, isWideTablet } = useAdaptiveLayout();
  const tabletMaxWidth = isWideTablet ? 1120 : 920;
  // const bottomInset = Math.max(insets.bottom, 10);
  const [name, setName] = useState("");
  const season = String(new Date().getFullYear());
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [description, setDescription] = useState("");
  const [leagueLogo, setLeagueLogo] = useState<PickedImageFile | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<CountryOption | null>(null);
  const [city, setCity] = useState("");
  const [divisionId, setDivisionId] = useState<(typeof DIVISION_OPTIONS)[number]["id"]>("open");
  const [tiebreakerId, setTiebreakerId] = useState<TiebreakerRule>(DEFAULT_TIEBREAKER);
  const [format, setFormat] = useState<CompetitionFormat>("league");
  const [knockoutName, setKnockoutName] = useState("Cup");
  const [tieFormat, setTieFormat] = useState<TieFormatSelection>({ kind: "single" });
  const [hasThirdPlace, setHasThirdPlace] = useState(false);
  const [groupForm, setGroupForm] = useState<GroupFormatFormState>({
    groupCount: 2,
    doubleRoundRobin: false,
    perGroup: 2,
  });
  const [swissForm, setSwissForm] = useState<SwissFormatFormState>(defaultSwissFormatFormState());

  const [teams, setTeams] = useState<TeamRow[]>(() => [
    { id: "t1", name: "", logo: null },
    { id: "t2", name: "", logo: null },
  ]);

  const [stepError, setStepError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);

  const createLeagueMutation = useCreateLeague();
  const { requireAuth } = useAuthGate();

  const durationError = validateLeagueDuration(startDate, endDate);
  const step1Valid =
    name.trim().length > 0 &&
    selectedCountry !== null &&
    Boolean(format) &&
    startDate.trim().length > 0 &&
    endDate.trim().length > 0 &&
    durationError === null;

  const namedTeams = teams.filter((t) => t.name.trim().length > 0);
  const step2Valid = namedTeams.length >= 2;

  const goNext = () => {
    setStepError(null);
    if (step === 1) {
      if (!step1Valid) {
        setStepError(
          durationError ??
            "Add competition name, country, format, and start/end dates to continue.",
        );
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!step2Valid) {
        setStepError("Add at least two teams with names.");
        return;
      }
      setStep(3);
    }
  };

  const handleCreate = async () => {
    setStepError(null);
    if (!requireAuth({ action: "create a competition" })) {
      return;
    }
    const createDurationError = validateLeagueDuration(startDate, endDate);
    if (createDurationError) {
      setStepError(createDurationError);
      return;
    }
    try {
      await createLeagueMutation.mutateAsync({
        name: name.trim(),
        seasonName: season.trim(),
        countryId: selectedCountry!.id,
        description: description.trim() || undefined,
        gender: divisionId !== "open" ? divisionId : undefined,
        tiebreaker: format === "league" ? tiebreakerId : undefined,
        logo: leagueLogo ?? undefined,
        startDate: startDate.trim(),
        endDate: endDate.trim(),
        format,
        knockout:
          format === "knockout"
            ? {
                name: knockoutName.trim() || "Cup",
                seed: true,
                config: buildKnockoutConfig(tieFormat, hasThirdPlace),
              }
            : undefined,
        group:
          format === "group"
            ? {
                name: "Group Stage",
                config: buildDefaultGroupConfig({
                  groupCount: groupForm.groupCount,
                  doubleRoundRobin: groupForm.doubleRoundRobin,
                  perGroup: groupForm.perGroup,
                }),
              }
            : undefined,
        swiss:
          format === "swiss"
            ? {
                name: "Opening Stage",
                groupNames: swissForm.groupNames.map((g) => g.trim()).filter(Boolean),
                config: buildSwissStageConfig(swissForm),
              }
            : undefined,
        teams: namedTeams.map((team) => ({
          name: team.name.trim(),
          logo: team.logo ?? undefined,
        })),
      });
      posthog?.capture("competition_created", {
        competition_format: format,
        team_count: namedTeams.length,
        has_logo: leagueLogo !== null,
        has_description: Boolean(description.trim()),
        division: divisionId,
      });
      setCreated(true);
    } catch (err) {
      console.error("Failed to create competition", err);
      if (err instanceof ApiError && err.status === 401) {
        setStepError("Please create an account first to create a competition.");
      } else {
        setStepError(err instanceof Error ? err.message : "Failed to create competition. Try again.");
      }
    }
  };

  const goBack = () => {
    setStepError(null);
    if (step > 1) setStep((s) => s - 1);
  };

  const addTeam = () => {
    setTeams((t) => [...t, newTeamRow()]);
  };

  const removeTeam = (id: string) => {
    setTeams((t) => (t.length <= 2 ? t : t.filter((row) => row.id !== id)));
  };

  const updateTeamName = (id: string, text: string) => {
    setTeams((rows) =>
      rows.map((row) => (row.id === id ? { ...row, name: text } : row)),
    );
  };

  const updateTeamLogo = (id: string, logo: PickedImageFile | null) => {
    setTeams((rows) =>
      rows.map((row) => (row.id === id ? { ...row, logo } : row)),
    );
  };

  const resetWizard = () => {
    setStep(1);
    setName("");
    setStartDate("");
    setEndDate("");
    setDescription("");
    setLeagueLogo(null);
    setSelectedCountry(null);
    setCity("");
    setDivisionId("open");
    setTiebreakerId(DEFAULT_TIEBREAKER);
    setFormat("league");
    setKnockoutName("Cup");
    setTieFormat({ kind: "single" });
    setHasThirdPlace(false);
    setGroupForm({
      groupCount: 2,
      doubleRoundRobin: false,
      perGroup: 2,
    });
    setTeams([
      { id: "t1", name: "", logo: null },
      { id: "t2", name: "", logo: null },
    ]);
    setStepError(null);
    setCreated(false);
    createLeagueMutation.reset();
  };

  const progress = step / TOTAL_STEPS;

  return (
    <View className="flex-1" style={{ backgroundColor: theme.background }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <SafeAreaView className="flex-1" edges={["top"]}>
      <OfflineBanner />
      {/* <BlackPatternBackground
        baseColor={theme.patternBase}
        stripeColor={theme.patternStripe}
      /> */}

        <KeyboardAwareScrollView
          bottomOffset={24}
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: insets.bottom + 90,
          }}
          showsVerticalScrollIndicator={false}
        >
          <View
            className="gap-6"
            style={isTablet ? { alignSelf: "center", width: "100%", maxWidth: tabletMaxWidth } : undefined}
          >
            <View className="gap-2">
              <Text
                className="text-[26px] leading-8"
                style={{ color: theme.text }}
              >
                Create a competition
              </Text>
              <Text
                className="text-sm leading-6"
                style={{ color: theme.textMuted }}
              >
                Three quick steps to choose the season structure, add teams,
                and review before it goes live.
              </Text>
            </View>

            <View className="gap-2">
              <View
                className="h-2 overflow-hidden rounded-full"
                style={{ backgroundColor: theme.cardMuted }}
              >
                <View
                  className="h-2 rounded-full"
                  style={{ width: `${progress * 100}%`, backgroundColor: theme.accent }}
                />
              </View>
              <View className="flex-row justify-between">
                {["Basics", "Teams", "Review"].map((label, i) => (
                  <Text
                    key={label}
                    className="text-xs"
                    style={{ color: i + 1 === step ? theme.accent : theme.textSubtle }}
                  >
                    {i + 1}. {label}
                  </Text>
                ))}
              </View>
            </View>

            {stepError ? (
              <View
                className="rounded-2xl border px-4 py-3"
                style={{ backgroundColor: theme.dangerMuted, borderColor: theme.danger }}
              >
                <Text className="text-sm" style={{ color: theme.danger }}>
                  {stepError}
                </Text>
              </View>
            ) : null}

            <View
              className="rounded-[28px] border px-5 py-6"
              style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}
            >
              {step === 1 ? (
                <StepBasics
                  isDark={isDark}
                  theme={theme}
                  name={name}
                  setName={setName}
                  startDate={startDate}
                  setStartDate={setStartDate}
                  endDate={endDate}
                  setEndDate={setEndDate}
                  description={description}
                  setDescription={setDescription}
                  leagueLogo={leagueLogo}
                  onLeagueLogoChange={setLeagueLogo}
                  city={city}
                  setCity={setCity}
                  divisionId={divisionId}
                  setDivisionId={setDivisionId}
                  tiebreakerId={tiebreakerId}
                  setTiebreakerId={setTiebreakerId}
                  format={format}
                  setFormat={setFormat}
                  knockoutName={knockoutName}
                  setKnockoutName={setKnockoutName}
                  tieFormat={tieFormat}
                  setTieFormat={setTieFormat}
                  hasThirdPlace={hasThirdPlace}
                  setHasThirdPlace={setHasThirdPlace}
                  groupForm={groupForm}
                  setGroupForm={setGroupForm}
                  swissForm={swissForm}
                  setSwissForm={setSwissForm}
                  selectedCountry={selectedCountry}
                  onSelectCountry={setSelectedCountry}
                />
              ) : null}

              {step === 2 ? (
                <StepTeams
                  theme={theme}
                  teams={teams}
                  format={format}
                  onChangeName={updateTeamName}
                  onChangeLogo={updateTeamLogo}
                  onAdd={addTeam}
                  onRemove={removeTeam}
                />
              ) : null}

              {step === 3 ? (
                <StepReview
                  isDark={isDark}
                  theme={theme}
                  name={name}
                  season={season}
                  startDate={startDate}
                  endDate={endDate}
                  description={description}
                  leagueLogo={leagueLogo}
                  country={selectedCountry ?? undefined}
                  city={city}
                  divisionId={divisionId}
                  tiebreakerId={tiebreakerId}
                  format={format}
                  knockoutName={knockoutName}
                  tieFormat={tieFormat}
                  hasThirdPlace={hasThirdPlace}
                  groupForm={groupForm}
                  swissForm={swissForm}
                  teams={namedTeams}
                  created={created}
                />
              ) : null}
            </View>

            <View className="gap-3">
              {step < 3 || !created ? (
                <View className="flex-row gap-3">
                  {step > 1 ? (
                    <Button
                      variant="secondary"
                      label="Back"
                      className="w-[112px]"
                      onPress={goBack}
                      disabled={createLeagueMutation.isPending}
                    />
                  ) : null}
                  <Button
                    variant="primary"
                    label={step === 3 ? "Create" : "Continue"}
                    className="flex-1"
                    onPress={step === 3 ? handleCreate : goNext}
                    loading={createLeagueMutation.isPending}
                  />
                </View>
              ) : (
                <Button variant="signInYellow" label="Done" onPress={resetWizard} />
              )}
            </View>
          </View>
        </KeyboardAwareScrollView>
      </SafeAreaView>
    </View>
  );
}

function StepBasics({
  isDark,
  theme,
  name,
  setName,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  description,
  setDescription,
  leagueLogo,
  onLeagueLogoChange,
  city,
  setCity,
  divisionId,
  setDivisionId,
  tiebreakerId,
  setTiebreakerId,
  format,
  setFormat,
  knockoutName,
  setKnockoutName,
  tieFormat,
  setTieFormat,
  hasThirdPlace,
  setHasThirdPlace,
  groupForm,
  setGroupForm,
  swissForm,
  setSwissForm,
  selectedCountry,
  onSelectCountry,
}: {
  isDark: boolean;
  theme: AppTheme;
  name: string;
  setName: (v: string) => void;
  startDate: string;
  setStartDate: (v: string) => void;
  endDate: string;
  setEndDate: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  leagueLogo: PickedImageFile | null;
  onLeagueLogoChange: (file: PickedImageFile | null) => void;
  city: string;
  setCity: (v: string) => void;
  divisionId: (typeof DIVISION_OPTIONS)[number]["id"];
  setDivisionId: (v: (typeof DIVISION_OPTIONS)[number]["id"]) => void;
  tiebreakerId: TiebreakerRule;
  setTiebreakerId: (v: TiebreakerRule) => void;
  format: CompetitionFormat;
  setFormat: (v: CompetitionFormat) => void;
  knockoutName: string;
  setKnockoutName: (v: string) => void;
  tieFormat: TieFormatSelection;
  setTieFormat: (v: TieFormatSelection) => void;
  hasThirdPlace: boolean;
  setHasThirdPlace: (v: boolean) => void;
  groupForm: GroupFormatFormState;
  setGroupForm: (v: GroupFormatFormState) => void;
  swissForm: SwissFormatFormState;
  setSwissForm: (v: SwissFormatFormState) => void;
  selectedCountry: CountryOption | null;
  onSelectCountry: (country: CountryOption) => void;
}) {
  const { isTablet } = useAdaptiveLayout();

  const formatFields = (
    <>
      <CompetitionFormatPicker
        value={format}
        onChange={setFormat}
        required
      />
      <FormatHelpCard format={format} theme={theme} />
    </>
  );

  const identityFields = (
    <>
      <AuthTextField
        label="Competition name"
        required
        placeholder="e.g. Surulere Sunday League"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
      />

      <View className="gap-2">
        <FormFieldLabel label="Competition duration" required />
        <View className="flex-row gap-3">
          <View className="flex-1">
            <NativeDatePickerField
              label="Start date"
              placeholder="Pick start date"
              value={startDate}
              onChange={(value) => setStartDate(value ?? "")}
              maximumDate={parseCalendarDate(endDate) ?? undefined}
              variant={isDark ? "dark" : "light"}
            />
          </View>
          <View className="flex-1">
            <NativeDatePickerField
              label="End date"
              placeholder="Pick end date"
              value={endDate}
              onChange={(value) => setEndDate(value ?? "")}
              minimumDate={parseCalendarDate(startDate) ?? undefined}
              variant={isDark ? "dark" : "light"}
            />
          </View>
        </View>
      </View>

      <CountryPicker
        value={selectedCountry}
        onChange={onSelectCountry}
        required
      />

      <AuthTextField
        label="City / area"
        placeholder="e.g. Lagos Mainland"
        value={city}
        onChangeText={setCity}
        autoCapitalize="words"
      />
    </>
  );

  const rulesFields = (
    <>
      <LabelBlock label="Division / band">
        <View className="flex-row flex-wrap gap-2">
          {DIVISION_OPTIONS.map((opt) => (
            <Chip
              key={opt.id}
              theme={theme}
              selected={divisionId === opt.id}
              label={opt.label}
              onPress={() => setDivisionId(opt.id)}
            />
          ))}
        </View>
      </LabelBlock>

      {format === "league" ? (
        <TiebreakerPicker
          value={tiebreakerId}
          onChange={setTiebreakerId}
          variant={isDark ? "dark" : "light"}
        />
      ) : format === "knockout" ? (
        <View className="gap-3">
          <AuthTextField
            label="Knockout stage name"
            value={knockoutName}
            onChangeText={setKnockoutName}
            placeholder="Cup"
          />
          <KnockoutTieFormatControl
            value={tieFormat}
            onChange={setTieFormat}
            hasThirdPlace={hasThirdPlace}
            onHasThirdPlaceChange={setHasThirdPlace}
            tone={isDark ? "dark" : "light"}
          />
        </View>
      ) : format === "group" ? (
        <GroupFormatConfigControl
          value={groupForm}
          onChange={setGroupForm}
          tone={isDark ? "dark" : "light"}
        />
      ) : (
        <SwissFormatConfigControl
          value={swissForm}
          onChange={setSwissForm}
          tone={isDark ? "dark" : "light"}
        />
      )}
    </>
  );

  const descriptionAndLogo = (
    <>
      <View className="gap-1.5">
        <FormFieldLabel label="Description" />
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Rules, venues, contacts…"
          placeholderTextColor={theme.textSubtle}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          style={{
            minHeight: 100,
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderRadius: 16,
            backgroundColor: theme.inputBackground,
            borderColor: theme.inputBorder,
            color: theme.text,
          }}
          className="border text-base"
        />
      </View>

      <LogoImageUpload
        label="Logo"
        value={leagueLogo}
        onChange={onLeagueLogoChange}
        size="lg"
        layout="centered"
        onPick={pickCompetitionLogo}
        hint="Recommend image: 150x150 px, JPG, PNG, or WebP, max 5 MB, keep logo centered"
        accessibilityLabel="Competition logo"
      />
    </>
  );

  return (
    <View className="gap-4">
      <Text className="text-base" style={{ color: theme.text }}>
        Step 1 - Competition basics
      </Text>

      {isTablet ? (
        <View className="flex-row items-start gap-6">
          <View className="min-w-0 flex-1 gap-4">
            {formatFields}
            {identityFields}
          </View>
          <View className="min-w-0 flex-1 gap-4">
            {rulesFields}
            {descriptionAndLogo}
          </View>
        </View>
      ) : (
        <>
          {formatFields}
          {identityFields}
          {rulesFields}
          {descriptionAndLogo}
        </>
      )}
    </View>
  );
}

function LabelBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="gap-2">
      <FormFieldLabel label={label} />
      {children}
    </View>
  );
}

function Chip({
  label,
  selected,
  onPress,
  theme,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  theme: AppTheme;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="rounded-full border px-3 py-2 active:opacity-85"
      style={{
        backgroundColor: selected ? theme.brandMuted : theme.cardMuted,
        borderColor: selected ? theme.brand : theme.cardBorder,
      }}
    >
      <Text
        className="text-xs"
        style={{ color: selected ? theme.brand : theme.textMuted }}
        numberOfLines={2}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function FormatHelpCard({
  format,
  theme,
}: {
  format: CompetitionFormat;
  theme: AppTheme;
}) {
  const copy = COMPETITION_FORMAT_COPY[format];
  return (
    <View
      className="gap-2 rounded-2xl border px-4 py-3"
      style={{ backgroundColor: theme.accentMuted, borderColor: theme.accent }}
    >
      <View className="flex-row items-start gap-2">
        <Ionicons
          name="information-circle-outline"
          size={18}
          color={theme.accent}
          style={{ marginTop: 2 }}
        />
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-sm" style={{ color: theme.text }}>
            {copy.label}
          </Text>
          <Text className="text-xs leading-5" style={{ color: theme.textMuted }}>
            {copy.description} {copy.lockedHint}
          </Text>
        </View>
      </View>
    </View>
  );
}

function StepTeams({
  theme,
  teams,
  format,
  onChangeName,
  onChangeLogo,
  onAdd,
  onRemove,
}: {
  theme: AppTheme;
  teams: TeamRow[];
  format: CompetitionFormat;
  onChangeName: (id: string, name: string) => void;
  onChangeLogo: (id: string, logo: PickedImageFile | null) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  const { isTablet } = useAdaptiveLayout();

  return (
    <View className="gap-4">
      <Text className="text-base" style={{ color: theme.text }}>
        Step 2 - Teams
      </Text>
      <Text className="text-sm leading-6" style={{ color: theme.textMuted }}>
        {format === "knockout"
          ? "Add at least two teams. List order becomes cup seeding, so the first team is seed 1."
          : format === "group"
            ? "Add enrolled teams. You will assign them to groups from Manage after the competition is created."
            : format === "swiss"
              ? "Add enrolled teams. You will split them into campuses/groups from the Swiss tab after the competition is created."
              : "Add at least two teams. You can add logos now or update them later from Manage."}
      </Text>

      <View className={isTablet ? "flex-row flex-wrap gap-3" : "gap-3"}>
        {teams.map((row, index) => (
          <View
            key={row.id}
            className="flex-row items-center gap-2"
            style={isTablet ? { width: "48%" } : undefined}
          >
            <View className="mt-7">
              <LogoImageUpload
                value={row.logo}
                onChange={(logo) => onChangeLogo(row.id, logo)}
                size="sm"
                compact
                accessibilityLabel={`Team ${index + 1} logo`}
              />
            </View>
            <View className="flex-1">
              <AuthTextField
                label={`Team ${index + 1}`}
                placeholder="Team name"
                value={row.name}
                onChangeText={(t) => onChangeName(row.id, t)}
                autoCapitalize="words"
              />
            </View>
            {teams.length > 2 ? (
              <Pressable
                accessibilityLabel={`Remove team ${index + 1}`}
                onPress={() => onRemove(row.id)}
                className="mt-8 h-11 w-11 items-center justify-center rounded-2xl active:opacity-85"
                style={{ backgroundColor: theme.dangerMuted }}
              >
                <Ionicons name="trash-outline" size={20} color={theme.danger} />
              </Pressable>
            ) : (
              <View className="mt-8 w-11" />
            )}
          </View>
        ))}
      </View>

      <Pressable
        onPress={onAdd}
        className="flex-row items-center justify-center gap-2 rounded-2xl border border-dashed py-3 active:opacity-80"
        style={{ backgroundColor: theme.brandMuted, borderColor: theme.brand }}
      >
        <Ionicons name="add-circle-outline" size={22} color={theme.brand} />
        <Text className="text-sm" style={{ color: theme.brand }}>
          Add another team
        </Text>
      </Pressable>
    </View>
  );
}

function StepReview({
  isDark,
  theme,
  name,
  season,
  startDate,
  endDate,
  description,
  leagueLogo,
  country,
  city,
  divisionId,
  tiebreakerId,
  format,
  knockoutName,
  tieFormat,
  hasThirdPlace,
  groupForm,
  swissForm,
  teams,
  created,
}: {
  isDark: boolean;
  theme: AppTheme;
  name: string;
  season: string;
  startDate: string;
  endDate: string;
  description: string;
  leagueLogo: PickedImageFile | null;
  country: CountryOption | undefined;
  city: string;
  divisionId: string;
  tiebreakerId: TiebreakerRule;
  format: CompetitionFormat;
  knockoutName: string;
  tieFormat: TieFormatSelection;
  hasThirdPlace: boolean;
  groupForm: GroupFormatFormState;
  swissForm: SwissFormatFormState;
  teams: TeamRow[];
  created: boolean;
}) {
  const { isTablet } = useAdaptiveLayout();
  const divisionLabel =
    DIVISION_OPTIONS.find((d) => d.id === divisionId)?.label ?? divisionId;

  const durationLabel = formatDurationSummary(startDate, endDate);
  const formatLabel = competitionFormatLabel(format);
  const tieFormatLabel =
    tieFormat.kind === "single"
      ? "Single match"
      : tieFormat.kind === "two_legged"
        ? "Two-legged tie"
        : `Best of ${tieFormat.bestOf}`;

  return (
    <View className="gap-5">
      <Text className="text-base" style={{ color: theme.text }}>
        Step 3 - Review
      </Text>

      <View
        className="gap-3 rounded-2xl border px-4 py-4"
        style={{ backgroundColor: theme.cardMuted, borderColor: theme.cardBorder }}
      >
        <SummaryLine label="Competition">
          <View className="flex-row items-center gap-3">
            {leagueLogo ? (
              <Image
                source={{ uri: leagueLogo.uri }}
                style={{ width: 40, height: 40, borderRadius: 12 }}
                contentFit="cover"
              />
            ) : null}
            <Text className="text-base" style={{ color: theme.text }}>
              {name}
            </Text>
          </View>
        </SummaryLine>
        <SummaryLine label="Season" value={season} />
        <SummaryLine label="Format" value={formatLabel} />
        {format === "knockout" ? (
          <>
            <SummaryLine label="Knockout stage" value={knockoutName.trim() || "Cup"} />
            <SummaryLine label="Tie format" value={tieFormatLabel} />
            <SummaryLine
              label="Third place"
              value={hasThirdPlace ? "Yes" : "No"}
            />
          </>
        ) : format === "group" ? (
          <>
            <SummaryLine label="Groups" value={String(groupForm.groupCount)} />
            <SummaryLine
              label="Round robin"
              value={groupForm.doubleRoundRobin ? "Double round-robin" : "Single"}
            />
            <SummaryLine
              label="Advance per group"
              value={String(groupForm.perGroup)}
            />
          </>
        ) : format === "swiss" ? (
          <>
            <SummaryLine
              label="Groups"
              value={swissForm.groupNames.filter((g) => g.trim()).join(", ") || "—"}
            />
            <SummaryLine label="Rounds" value={String(swissForm.rounds)} />
            <SummaryLine
              label="Qualification"
              value={`Top ${swissForm.directCount} direct, ranks ${swissForm.playoffRankFrom}-${swissForm.playoffRankTo} playoff`}
            />
          </>
        ) : (
          <SummaryLine label="Tiebreaker" value={tiebreakerLabel(tiebreakerId)} />
        )}
        <SummaryLine label="Duration" value={durationLabel} />
        {country ? (
          <SummaryLine label="Country">
            <CountryLabel
              code={country.code}
              name={country.name}
              flagWidth={18}
              textClassName={isDark ? "text-base text-white" : "text-base text-neutral-950"}
            />
          </SummaryLine>
        ) : null}
        {city.trim() ? <SummaryLine label="City / area" value={city.trim()} /> : null}
        <SummaryLine label="Division" value={divisionLabel} />
        {description.trim() ? (
          <View className="gap-1 pt-1">
            <Text
              className="text-xs uppercase tracking-wide"
              style={{ color: theme.textMuted }}
            >
              Description
            </Text>
            <Text className="text-sm" style={{ color: theme.text }}>
              {description.trim()}
            </Text>
          </View>
        ) : null}
        <View
          className="mt-1 border-t pt-3"
          style={{ borderColor: theme.cardBorder }}
        >
          <Text
            className="mb-2 text-xs uppercase tracking-wide"
            style={{ color: theme.textMuted }}
          >
            Teams ({teams.length})
          </Text>
          <View className={isTablet ? "flex-row flex-wrap gap-2" : ""}>
            {teams.map((team) => (
              <View
                key={team.id}
                className="flex-row items-center gap-2 py-0.5"
                style={isTablet ? { width: "48%" } : undefined}
              >
                {team.logo ? (
                  <Image
                    source={{ uri: team.logo.uri }}
                    style={{ width: 24, height: 24, borderRadius: 8 }}
                    contentFit="cover"
                  />
                ) : (
                  <View
                    className="h-6 w-6 rounded-lg"
                    style={{ backgroundColor: theme.brandMuted }}
                  />
                )}
                <Text
                  className="min-w-0 flex-1 text-sm"
                  style={{ color: theme.text }}
                  numberOfLines={1}
                >
                  {team.name.trim()}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {created ? (
        <View
          className="flex-row gap-3 rounded-2xl border px-4 py-3"
          style={{ backgroundColor: theme.successMuted, borderColor: theme.success }}
        >
          <Ionicons name="checkmark-circle-outline" size={22} color={theme.success} style={{ marginTop: 2 }} />
          <Text className="flex-1 text-sm leading-5" style={{ color: theme.text }}>
            Your competition is live. Open Manage to schedule games, seed a cup bracket, or
            invite players.
          </Text>
        </View>
      ) : (
        <View
          className="flex-row gap-3 rounded-2xl border px-4 py-3"
          style={{ backgroundColor: theme.accentMuted, borderColor: theme.accent }}
        >
          <Ionicons name="information-circle-outline" size={22} color={theme.accent} style={{ marginTop: 2 }} />
          <Text className="flex-1 text-sm leading-5" style={{ color: theme.text }}>
            After creating, open Manage to invite players or finish knockout seeding if needed.
          </Text>
        </View>
      )}
    </View>
  );
}

function SummaryLine({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: ReactNode;
}) {
  const theme = useTheme();

  return (
    <View className="gap-0.5">
      <Text
        className="text-xs uppercase tracking-wide"
        style={{ color: theme.textMuted }}
      >
        {label}
      </Text>
      {children ?? (
        <Text className="text-base" style={{ color: theme.text }}>
          {value}
        </Text>
      )}
    </View>
  );
}

function validateLeagueDuration(startDate: string, endDate: string): string | null {
  const start = startDate.trim();
  const end = endDate.trim();
  if (!start || !end) {
    return "Enter start and end dates for the competition.";
  }
  if (!parseCalendarDate(start)) {
    return "Start date must be YYYY-MM-DD.";
  }
  if (!parseCalendarDate(end)) {
    return "End date must be YYYY-MM-DD.";
  }
  const startParsed = parseCalendarDate(start)!;
  const endParsed = parseCalendarDate(end)!;
  if (endParsed.getTime() < startParsed.getTime()) {
    return "End date must be on or after the start date.";
  }
  return null;
}

function formatDurationSummary(startDate: string, endDate: string): string {
  const start = startDate.trim();
  const end = endDate.trim();
  if (!start && !end) return "-";
  if (start && end) return `${start} → ${end}`;
  if (start) return `From ${start}`;
  return `Until ${end}`;
}
