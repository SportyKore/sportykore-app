import { Ionicons } from "@expo/vector-icons";
import { type ReactNode, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Share,
  Text,
  View,
} from "react-native";
import type { ApiTeam } from "@/api/entities";
import { useTheme } from "@/color/use-theme";
import { BottomSheetModal, Button, Input, SeasonPicker } from "@/components/ui";
import { showThrownAsToast } from "@/lib/show-error-toast";
import { fonts } from "@/theme/fonts";
import { useSeasonRoster } from "../../hooks";
import {
  createPlayerClaim,
  isDuplicateNamesError,
  type CreateRosterPlayers,
} from "../../roster-api";
import { useRosterActions } from "../../roster-hooks";
import type { LeagueRosterRow } from "../../types";
import { hasDuplicateRosterNames, parseRosterNames } from "../../utils/roster";

type Props = {
  leagueId: number;
  seasonId: number;
  teams: ApiTeam[];
  adminTeamId?: number;
  onInvite: () => void;
  renderDetails?: (row: LeagueRosterRow) => ReactNode;
};
type Filter = "all" | "pool" | "pending";
const statusOptions: { id: number; name: string; value: Filter }[] = [
  { id: 0, name: "All players", value: "all" },
  { id: 1, name: "Pending", value: "pending" },
  { id: 2, name: "Unassigned", value: "pool" },
];

export function RosterWorkspace({
  leagueId,
  seasonId,
  teams,
  adminTeamId,
  onInvite,
  renderDetails,
}: Props) {
  const theme = useTheme();
  const roster = useSeasonRoster(leagueId, seasonId);
  const { create, assign, review } = useRosterActions(leagueId, seasonId);
  const owner = adminTeamId == null;
  const [teamFilter, setTeamFilter] = useState(adminTeamId ?? 0);
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<number[]>([]);
  const [destination, setDestination] = useState<number | null>(
    adminTeamId ?? teams[0]?.id ?? null,
  );
  const [addOpen, setAddOpen] = useState(false);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<CreateRosterPlayers | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [addTeamId, setAddTeamId] = useState<number | null>(
    adminTeamId ?? null,
  );
  const [sharing, setSharing] = useState<number | null>(null);
  const submitting = useRef(false);
  const textStyle = { color: theme.text, fontFamily: fonts.body };
  const rows = roster.data ?? [];
  const allowedTeams = owner
    ? teams
    : teams.filter((team) => team.id === adminTeamId);
  const pool = rows.filter(
    (row) => row.team == null && row.status === "active",
  );
  const visible = rows.filter((row) => {
    if (!owner && row.team != null && row.team.id !== adminTeamId) return false;
    if (filter === "pool") return row.team == null;
    if (teamFilter !== 0 && row.team?.id !== teamFilter) return false;
    return filter !== "pending" || row.status === "pending";
  });
  const selectedIds = selected.filter((id) =>
    pool.some((row) => row.id === id),
  );
  const validDestination = allowedTeams.some((team) => team.id === destination);
  const names = parseRosterNames(text);

  const preparePreview = () => {
    if (!names.length || names.length > 200) return;
    setDuplicateWarning(
      hasDuplicateRosterNames(
        names,
        rows.map((row) => row.player.name),
      ),
    );
    setConfirmed(false);
    setPreview({
      names,
      teamId: addTeamId,
      requestId:
        globalThis.crypto?.randomUUID?.() ??
        `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    });
  };
  const savePlayers = async () => {
    if (!preview || submitting.current) return;
    submitting.current = true;
    try {
      await create.mutateAsync({ ...preview, confirmDuplicates: confirmed });
      setAddOpen(false);
      setText("");
      setPreview(null);
      setDuplicateWarning(false);
      setConfirmed(false);
    } catch (error) {
      if (isDuplicateNamesError(error)) {
        setDuplicateWarning(true);
        setConfirmed(false);
      } else
        showThrownAsToast(
          error,
          "Could not add players. Retry this preview safely.",
        );
    } finally {
      submitting.current = false;
    }
  };
  const assignSelected = async () => {
    if (
      !destination ||
      !validDestination ||
      !selectedIds.length ||
      assign.isPending
    )
      return;
    try {
      await assign.mutateAsync({ teamId: destination, rosterIds: selectedIds });
      setSelected([]);
    } catch (error) {
      showThrownAsToast(error, "Could not assign players");
    }
  };
  const shareClaim = async (row: LeagueRosterRow) => {
    if (sharing != null) return;
    setSharing(row.id);
    try {
      const { claimLink } = await createPlayerClaim(
        row.player.id,
        leagueId,
        seasonId,
      );
      await Share.share({
        message: `${row.player.name}, claim your SportyKore player profile: ${claimLink}`,
      });
    } catch (error) {
      showThrownAsToast(error, "Could not share claim link");
    } finally {
      setSharing(null);
    }
  };

  return (
    <View className="gap-4">
      <Text
        className="text-xl"
        style={{ ...textStyle, fontFamily: fonts.bodyBold }}
      >
        Season roster
      </Text>
      <View className="flex-row items-center gap-3">
        <View className="flex-1">
          <Button
            label="Invite players"
            variant="secondary"
            onPress={onInvite}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh roster"
          accessibilityState={{
            disabled: roster.isFetching,
            busy: roster.isFetching,
          }}
          disabled={roster.isFetching}
          onPress={() => void roster.refetch()}
          className="h-14 w-14 items-center justify-center rounded-2xl border active:opacity-70"
          style={{ borderColor: theme.cardBorder, backgroundColor: theme.card }}
        >
          {roster.isFetching ? (
            <ActivityIndicator color={theme.brand} />
          ) : (
            <Ionicons name="refresh-outline" size={22} color={theme.text} />
          )}
        </Pressable>
      </View>
      <Button
        label="Add / paste players"
        onPress={() => {
          setAddTeamId(adminTeamId ?? (teamFilter || null));
          setAddOpen(true);
        }}
      />
      <View className="gap-3">
        <SeasonPicker
          label="Team"
          seasons={[{ id: 0, name: "All teams" }, ...allowedTeams]}
          activeSeasonId={teamFilter}
          onSelect={(id) => {
            setTeamFilter(id);
            if (id !== 0 && filter === "pool") setFilter("all");
            setSelected([]);
          }}
        />
        <SeasonPicker
          label="Status"
          seasons={statusOptions}
          activeSeasonId={
            statusOptions.find((option) => option.value === filter)?.id ?? 0
          }
          onSelect={(id) => {
            const value =
              statusOptions.find((option) => option.id === id)?.value ?? "all";
            setFilter(value);
            if (value === "pool") setTeamFilter(0);
            setSelected([]);
          }}
        />
      </View>
      {roster.isPending ? (
        <ActivityIndicator accessibilityLabel="Loading roster" />
      ) : roster.isError ? (
        <View className="gap-2">
          <Text accessibilityRole="alert" style={textStyle}>
            Could not load the roster.
          </Text>
          <Button
            label="Retry roster"
            onPress={() => void roster.refetch()}
            variant="secondary"
          />
        </View>
      ) : (
        <>
          {filter === "pool" && pool.length > 0 ? (
            <View
              className="gap-3 rounded-xl border p-4"
              style={{ borderColor: theme.cardBorder }}
            >
              <Text style={textStyle}>
                Select active players to assign together. Pending registrations
                need approval first.
              </Text>
              <Button
                label={
                  selectedIds.length === pool.length
                    ? "Clear selection"
                    : "Select all active players"
                }
                variant="secondary"
                onPress={() =>
                  setSelected(
                    selectedIds.length === pool.length
                      ? []
                      : pool.map((row) => row.id),
                  )
                }
              />
              {allowedTeams.length ? (
                <SeasonPicker
                  label="Assign to team"
                  seasons={allowedTeams}
                  activeSeasonId={destination}
                  onSelect={setDestination}
                  disabled={!owner}
                />
              ) : (
                <Text style={textStyle}>
                  Create a team before assigning players.
                </Text>
              )}
              <Button
                label={`Assign ${selectedIds.length} selected`}
                disabled={!selectedIds.length || !validDestination}
                loading={assign.isPending}
                onPress={() => void assignSelected()}
              />
            </View>
          ) : null}
          {!visible.length ? (
            <Text style={textStyle}>
              {filter === "pool"
                ? "No unassigned players. Add names to start your pool."
                : filter === "pending"
                  ? "No registrations awaiting approval."
                  : "No players here yet. Add names or assign players from the pool."}
            </Text>
          ) : null}
          {visible.map((row) => (
            <View
              key={row.id}
              className="gap-3 rounded-xl border p-4"
              style={{
                backgroundColor: theme.card,
                borderColor: theme.cardBorder,
              }}
            >
              <Text style={{ ...textStyle, fontFamily: fonts.bodyBold }}>
                {row.player.name}
              </Text>
              <Text style={textStyle}>
                {row.team?.name ?? "Unassigned"} · {row.status} · Player #
                {row.player.id}
              </Text>
              {filter === "pool" && row.status === "active" ? (
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selectedIds.includes(row.id) }}
                  accessibilityLabel={`Select ${row.player.name}, player ${row.player.id}`}
                  className="min-h-12 justify-center rounded-xl bg-brand-50 px-3"
                  onPress={() =>
                    setSelected((ids) =>
                      ids.includes(row.id)
                        ? ids.filter((id) => id !== row.id)
                        : [...ids, row.id],
                    )
                  }
                >
                  <Text
                    className="text-brand-900"
                    style={{ fontFamily: fonts.body }}
                  >
                    {selectedIds.includes(row.id)
                      ? "Selected"
                      : "Select for assignment"}
                  </Text>
                </Pressable>
              ) : null}
              {owner && row.status === "pending" ? (
                <View className="gap-2">
                  <Button
                    label="Approve registration"
                    loading={
                      review.isPending && review.variables?.id === row.id
                    }
                    disabled={review.isPending}
                    onPress={() =>
                      review.mutate(
                        { id: row.id, status: "active" },
                        { onError: (error) => showThrownAsToast(error) },
                      )
                    }
                  />
                  <Button
                    label="Reject registration"
                    variant="secondary"
                    disabled={review.isPending}
                    onPress={() =>
                      review.mutate(
                        { id: row.id, status: "rejected" },
                        { onError: (error) => showThrownAsToast(error) },
                      )
                    }
                  />
                </View>
              ) : null}
              {row.player.userId === null &&
              ["active", "injured", "suspended"].includes(row.status) &&
              (owner || row.team?.id === adminTeamId) ? (
                <Button
                  label="Share player claim link"
                  variant="secondary"
                  loading={sharing === row.id}
                  disabled={sharing != null}
                  onPress={() =>
                    Alert.alert(
                      "Share profile claim link",
                      `Confirm the recipient is ${row.player.name} before sharing. This link grants ownership of their player profile and replaces any earlier unused link.`,
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Create and share",
                          onPress: () => void shareClaim(row),
                        },
                      ],
                    )
                  }
                />
              ) : null}
              {renderDetails?.(row)}
            </View>
          ))}
        </>
      )}
      <BottomSheetModal
        visible={addOpen}
        title={preview ? "Preview new players" : "Add players"}
        onClose={() => {
          if (!create.isPending) setAddOpen(false);
        }}
      >
        <View className="gap-4">
          {preview ? (
            <>
              <Text style={textStyle}>
                {preview.names.length} new player records ·{" "}
                {teams.find((team) => team.id === preview.teamId)?.name ??
                  "Unassigned pool"}
              </Text>
              {preview.names.map((name, index) => (
                <Text key={index} style={textStyle}>
                  {index + 1}. {name}
                </Text>
              ))}
              {duplicateWarning ? (
                <View className="gap-3 rounded-xl bg-accent-50 p-4">
                  <Text
                    className="text-neutral-900"
                    style={{ fontFamily: fonts.body }}
                  >
                    Matching names were found in this list or the season roster.
                    Names do not have to be unique. Each line will create a
                    distinct player, including repeated names. To use an
                    existing player, cancel and assign them from the unassigned
                    pool.
                  </Text>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: confirmed }}
                    className="min-h-12 justify-center"
                    disabled={create.isPending}
                    onPress={() => setConfirmed((value) => !value)}
                  >
                    <Text
                      className="text-brand-900"
                      style={{ fontFamily: fonts.bodyBold }}
                    >
                      {confirmed
                        ? "✓ Confirmed: create distinct players"
                        : "Confirm these are distinct players"}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
              <Button
                label={`Create ${preview.names.length} players`}
                loading={create.isPending}
                disabled={duplicateWarning && !confirmed}
                onPress={() => void savePlayers()}
              />
              <Button
                label="Edit names"
                variant="secondary"
                disabled={create.isPending}
                onPress={() => setPreview(null)}
              />
              <Button
                label="Cancel and view unassigned pool"
                variant="secondary"
                disabled={create.isPending}
                onPress={() => {
                  setAddOpen(false);
                  setFilter("pool");
                  setTeamFilter(0);
                  setSelected([]);
                  setPreview(null);
                }}
              />
            </>
          ) : (
            <>
              <Input
                label="Player names — one per line"
                placeholder={"Alex Morgan\nSam Taylor"}
                multiline
                value={text}
                onChangeText={setText}
                className="min-h-36 py-3"
                style={{ fontFamily: fonts.body }}
              />
              <Text style={textStyle}>
                Only a name is required. Jersey, position, and profile
                information can be added later.
              </Text>
              {owner ? (
                <Button
                  label={
                    addTeamId == null
                      ? "✓ Add to unassigned pool"
                      : "Add to unassigned pool"
                  }
                  variant="secondary"
                  onPress={() => setAddTeamId(null)}
                />
              ) : null}
              {allowedTeams.length ? (
                <SeasonPicker
                  label="Or add directly to team"
                  seasons={allowedTeams}
                  activeSeasonId={addTeamId}
                  onSelect={setAddTeamId}
                  disabled={!owner}
                />
              ) : null}
              {names.length > 200 ? (
                <Text accessibilityRole="alert" style={textStyle}>
                  Add up to 200 players at a time. Split this list into smaller
                  batches.
                </Text>
              ) : null}
              <Button
                label={`Preview ${names.length} players`}
                disabled={
                  !names.length ||
                  names.length > 200 ||
                  (addTeamId != null &&
                    !allowedTeams.some((team) => team.id === addTeamId))
                }
                onPress={preparePreview}
              />
            </>
          )}
        </View>
      </BottomSheetModal>
    </View>
  );
}
