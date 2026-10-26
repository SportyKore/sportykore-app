import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  Text,
  TextInput,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { ApiTeam } from "@/api/entities";
import { useAppearance } from "@/color/appearance-context";
import { useTheme } from "@/color/use-theme";
import { EntityLogo } from "@/components/ui";
import { BlackPatternBackground } from "@/components/ui/black-pattern-background";
import { BottomSheetModal } from "@/components/ui/bottom-sheet-modal";
import { colors, scoreboardPattern } from "@/constants";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { posthog } from "@/lib/posthog";
import { showInfoToast, showThrownAsToast } from "@/lib/show-error-toast";

import { useGenerateInvite } from "@/invite/hooks";
import { buildInviteUrl, parseInviteToken } from "@/invite/invite-utils";

type Props = {
  visible: boolean;
  onClose: () => void;
  leagueId: number;
  leagueName: string;
  seasonId: number;
  teams: ApiTeam[];
  initialTeamId: number | null;
  allowUnassigned?: boolean;
  teamsLoading?: boolean;
  teamsError?: string | null;
  onRetryTeams?: () => void;
};

export function InviteLinkSheet({
  visible,
  onClose,
  leagueId,
  leagueName,
  seasonId,
  teams,
  initialTeamId,
  allowUnassigned = false,
  teamsLoading = false,
  teamsError = null,
  onRetryTeams,
}: Props) {
  const theme = useTheme();
  const { isDark } = useAppearance();
  const generateInvite = useGenerateInvite();
  const [teamId, setTeamId] = useState<number | null>(initialTeamId);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setTeamId(initialTeamId);
    setInviteUrl(null);
  }, [visible, initialTeamId]);

  const activeTeam = teams.find((team) => team.id === teamId) ?? null;
  const inviteCode = inviteUrl ? parseInviteToken(inviteUrl) : null;

  const handleClose = () => {
    setInviteUrl(null);
    onClose();
  };

  const handleGenerate = async () => {
    if (teamId == null && !allowUnassigned) return;
    try {
      const result = await generateInvite.mutateAsync({
        leagueId,
        seasonId,
        teamId,
      });
      setInviteUrl(
        buildInviteUrl(result.inviteLink, {
          leagueName,
          teamName: activeTeam?.name,
        }),
      );
    } catch (error) {
      showThrownAsToast(error, "Could not generate invite");
    }
  };

  const handleCopyCode = async () => {
    if (!inviteCode) return;
    const result = await copyToClipboard(inviteCode);
    if (result === "clipboard") {
      showInfoToast("Copied", "Invite code copied to clipboard.");
      posthog?.capture("invite_link_shared", {
        league_id: leagueId,
        season_id: seasonId,
        team_id: teamId,
        method: "copy_code",
      });
    }
  };

  const handleShare = async () => {
    if (!inviteUrl) return;
    try {
      const teamLabel = activeTeam?.name ?? "the league";
      await Share.share({
        message: `Join ${teamLabel} in ${leagueName} on SportyKore:\n${inviteUrl}`,
      });
      posthog?.capture("invite_link_shared", {
        league_id: leagueId,
        season_id: seasonId,
        team_id: teamId,
        method: "share_sheet",
      });
    } catch {
      // User dismissed share sheet.
    }
  };

  return (
    <BottomSheetModal
      visible={visible}
      onClose={handleClose}
      variant={isDark ? "dark" : "light"}
      title="Share registration link"
      subtitle={
        teamsLoading
          ? "Loading teams for this league."
          : teamsError
            ? "Teams could not be loaded for this league."
            : inviteUrl
              ? "Share this link so players know which league and team they are joining."
              : "Share a quick registration form. Players do not need an account."
      }
    >
      {teamsLoading ? (
        <View className="items-center gap-3 py-6">
          <ActivityIndicator color={theme.accent} />
          <Text className="text-sm" style={{ color: theme.textSubtle }}>
            Getting teams ready...
          </Text>
        </View>
      ) : teamsError ? (
        <View className="gap-4 py-2">
          <View
            className="flex-row items-start gap-2 rounded-2xl border px-3 py-3"
            style={{
              backgroundColor: theme.cardMuted,
              borderColor: theme.cardBorder,
            }}
          >
            <Ionicons name="warning-outline" size={18} color={theme.accent} />
            <Text
              className="min-w-0 flex-1 text-sm leading-6"
              style={{ color: theme.textMuted }}
            >
              {teamsError}
            </Text>
          </View>
          {onRetryTeams ? (
            <InviteActionButton
              icon="refresh-outline"
              label="Retry"
              onPress={onRetryTeams}
            />
          ) : null}
        </View>
      ) : (
        <View className="gap-5">
          {!inviteUrl ? (
            <>
              <InviteContextCard
                leagueName={leagueName}
                teamName={activeTeam?.name}
              />
              <TeamPicker
                teams={teams}
                selectedId={teamId}
                onSelect={setTeamId}
              />
              {allowUnassigned ? (
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: teamId === null }}
                  onPress={() => setTeamId(null)}
                  className="py-3"
                >
                  <Text style={{ color: theme.text }}>
                    {teamId === null ? "✓ " : ""}Join league — assign a team
                    later
                  </Text>
                </Pressable>
              ) : null}
              <InviteExpiryNote />
              <InviteActionButton
                icon="ticket-outline"
                label="Create registration link"
                onPress={() => void handleGenerate()}
                loading={generateInvite.isPending}
                disabled={
                  (!allowUnassigned && teamId == null) ||
                  generateInvite.isPending
                }
              />
            </>
          ) : (
            <View className="gap-5">
              <InviteContextCard
                leagueName={leagueName}
                teamName={activeTeam?.name}
              />

              <View
                className="overflow-hidden rounded-2xl border"
                style={{ borderColor: theme.cardBorder }}
              >
                <BlackPatternBackground
                  baseColor={
                    isDark ? scoreboardPattern().baseColor : theme.patternBase
                  }
                  stripeColor={theme.patternStripe}
                />
                <View className="items-center px-4 py-5">
                  <View className="rounded-2xl bg-white p-4">
                    <QRCode
                      value={inviteUrl}
                      size={200}
                      color="#1C1C1E"
                      backgroundColor="#FFFFFF"
                    />
                  </View>
                </View>
              </View>

              <View
                className="gap-2 rounded-2xl border px-4 py-4"
                style={{
                  backgroundColor: theme.cardMuted,
                  borderColor: theme.cardBorder,
                }}
              >
                <View className="flex-row items-center justify-center gap-2">
                  <Ionicons
                    name="key-outline"
                    size={16}
                    color={colors.accent}
                  />
                  <Text
                    className="text-xs uppercase tracking-wide"
                    style={{ color: theme.textSubtle }}
                  >
                    Invite code
                  </Text>
                </View>
                <Text
                  className="text-center text-base"
                  style={{ color: theme.text }}
                  selectable
                >
                  {inviteCode}
                </Text>
              </View>

              <InviteExpiryNote />

              <View className="w-full flex-row gap-3">
                <InviteActionButton
                  icon="copy-outline"
                  label="Copy code"
                  onPress={() => void handleCopyCode()}
                  className="flex-1"
                />
                <InviteActionButton
                  icon="share-social-outline"
                  label="Share invite"
                  onPress={() => void handleShare()}
                  className="flex-1"
                  variant="secondary"
                />
              </View>

              <InviteActionButton
                icon="refresh-outline"
                label="Generate new code"
                onPress={() => setInviteUrl(null)}
                className="w-full"
                variant="secondary"
              />
            </View>
          )}
        </View>
      )}
    </BottomSheetModal>
  );
}

function InviteExpiryNote() {
  const theme = useTheme();

  return (
    <View
      className="flex-row gap-2 rounded-2xl border px-4 py-3"
      style={{
        backgroundColor: theme.accentMuted,
        borderColor: theme.accent,
      }}
    >
      <Ionicons name="time-outline" size={17} color={theme.accent} />
      <Text
        className="min-w-0 flex-1 text-sm leading-5"
        style={{ color: theme.textMuted }}
      >
        Invite codes expire after 7 days and can be reused until then.
      </Text>
    </View>
  );
}

function InviteActionButton({
  icon,
  label,
  onPress,
  disabled = false,
  loading = false,
  className,
  variant = "primary",
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  variant?: "primary" | "secondary";
}) {
  const theme = useTheme();
  const isDisabled = disabled || loading;
  const isPrimary = variant === "primary";

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      className={[
        "h-12 flex-row items-center justify-center gap-2 rounded-full border px-4 active:opacity-90",
        isDisabled ? "opacity-50" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        backgroundColor: isPrimary ? theme.accent : theme.cardMuted,
        borderColor: isPrimary ? theme.accent : theme.cardBorder,
      }}
    >
      {loading ? (
        <ActivityIndicator
          color={isPrimary ? colors.darkLabel : theme.text}
          size="small"
        />
      ) : (
        <Ionicons
          name={icon}
          size={17}
          color={isPrimary ? colors.darkLabel : theme.text}
        />
      )}
      <Text
        className="text-sm"
        style={{ color: isPrimary ? colors.darkLabel : theme.text }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.82}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function InviteContextCard({
  leagueName,
  teamName,
}: {
  leagueName: string;
  teamName?: string;
}) {
  const theme = useTheme();

  return (
    <View
      className="gap-3 rounded-2xl border px-4 py-4"
      style={{
        backgroundColor: theme.cardMuted,
        borderColor: theme.cardBorder,
      }}
    >
      <ContextRow label="League" value={leagueName} />
      {teamName ? <ContextRow label="Team" value={teamName} /> : null}
    </View>
  );
}

function ContextRow({ label, value }: { label: string; value: string }) {
  const theme = useTheme();

  return (
    <View className="gap-1">
      <Text
        className="text-[11px] uppercase tracking-wider"
        style={{ color: theme.textSubtle }}
      >
        {label}
      </Text>
      <Text className="text-base" style={{ color: theme.text }}>
        {value}
      </Text>
    </View>
  );
}

function TeamPicker({
  teams,
  selectedId,
  onSelect,
}: {
  teams: ApiTeam[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}) {
  const theme = useTheme();
  const { isDark } = useAppearance();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = q
    ? teams.filter((team) => team.name.toLowerCase().includes(q))
    : teams;
  const selectedTeam = teams.find((team) => team.id === selectedId) ?? null;
  const hasSelection = selectedTeam != null;
  const insets = useSafeAreaInsets();
  const handleSelect = (id: number) => {
    onSelect(id);
    setOpen(false);
    setQuery("");
  };

  const handleClear = () => {
    onSelect(null);
    setOpen(false);
    setQuery("");
  };

  return (
    <View className="gap-2">
      <Text
        className="text-xs uppercase tracking-wide"
        style={{ color: theme.textSubtle }}
      >
        Team
      </Text>
      <View
        className="overflow-hidden rounded-[18px] border"
        style={{
          backgroundColor: theme.cardMuted,
          borderColor: theme.cardBorder,
        }}
      >
        <Pressable
          onPress={() => setOpen((current) => !current)}
          className="flex-row items-center gap-3 px-3.5 py-3"
          accessibilityRole="button"
          accessibilityLabel="Choose team"
        >
          <View className="h-9 w-9 items-center justify-center rounded-2xl bg-accent-500/15">
            {selectedTeam ? (
              <EntityLogo
                logoUrl={selectedTeam.logoUrl}
                variant="team"
                size="xs"
                tone={isDark ? "dark" : "light"}
              />
            ) : (
              <Ionicons name="shield-outline" size={18} color={theme.accent} />
            )}
          </View>
          <View className="min-w-0 flex-1">
            <Text
              className="text-sm"
              style={{ color: hasSelection ? theme.text : theme.textMuted }}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {selectedTeam?.name ?? "Choose team"}
            </Text>
            <Text
              className="pt-0.5 text-xs"
              style={{ color: theme.textSubtle }}
              numberOfLines={1}
            >
              {hasSelection
                ? "Invite destination"
                : `${teams.length} team${teams.length === 1 ? "" : "s"} available`}
            </Text>
          </View>
          {hasSelection ? (
            <Pressable
              onPress={handleClear}
              hitSlop={10}
              className="rounded-lg px-2 py-1"
            >
              <Text className="text-xs" style={{ color: theme.textSubtle }}>
                Clear
              </Text>
            </Pressable>
          ) : null}
          <Ionicons
            name={open ? "chevron-up" : "chevron-down"}
            size={18}
            color={theme.textSubtle}
          />
        </Pressable>

        {open ? (
          <View
            className="border-t"
            style={{
              backgroundColor: theme.surfaceRaised,
              borderColor: theme.cardBorder,
            }}
          >
            {teams.length > 5 ? (
              <View
                className="flex-row items-center gap-2 border-b px-3 py-2"
                style={{ borderColor: theme.cardBorder }}
              >
                <Ionicons name="search" size={16} color={theme.textSubtle} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search teams"
                  placeholderTextColor={theme.textSubtle}
                  autoCorrect={false}
                  style={{
                    flex: 1,
                    fontSize: 14,
                    color: theme.text,
                    paddingVertical: 6,
                  }}
                />
                {query ? (
                  <Pressable onPress={() => setQuery("")} hitSlop={8}>
                    <Ionicons
                      name="close-circle"
                      size={16}
                      color={theme.textSubtle}
                    />
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            <ScrollView
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 220 }}
              contentContainerStyle={{
                paddingBottom: insets.bottom + 90,
              }}
            >
              {filtered.map((team) => (
                <TeamOptionRow
                  key={team.id}
                  team={team}
                  selected={selectedId === team.id}
                  onPress={() => handleSelect(team.id)}
                  isDark={isDark}
                />
              ))}
              {filtered.length === 0 ? (
                <Text
                  className="px-4 py-4 text-sm"
                  style={{ color: theme.textSubtle }}
                >
                  {`No teams match "${query.trim()}".`}
                </Text>
              ) : null}
            </ScrollView>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function TeamOptionRow({
  team,
  selected,
  onPress,
  isDark,
}: {
  team: ApiTeam;
  selected: boolean;
  onPress: () => void;
  isDark: boolean;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 border-b px-3.5 py-3"
      style={{
        backgroundColor: selected ? theme.accentMuted : "transparent",
        borderColor: theme.cardBorder,
      }}
    >
      <EntityLogo
        logoUrl={team.logoUrl}
        variant="team"
        size="xs"
        tone={isDark ? "dark" : "light"}
      />
      <View className="min-w-0 flex-1">
        <Text
          className="text-sm"
          style={{ color: selected ? theme.accent : theme.text }}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {team.name}
        </Text>
      </View>
      {selected ? (
        <Ionicons name="checkmark-circle" size={20} color={theme.accent} />
      ) : (
        <View
          className="h-5 w-5 rounded-full border"
          style={{ borderColor: theme.inputBorder }}
        />
      )}
    </Pressable>
  );
}
