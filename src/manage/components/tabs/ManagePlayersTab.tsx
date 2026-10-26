import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import type { ApiTeam } from "@/api/entities";
import { useTheme } from "@/color/use-theme";
import { Button } from "@/components/ui";
import { AuthTextField } from "@/components/ui/auth-text-field";
import { BottomSheetModal } from "@/components/ui/bottom-sheet-modal";
import { InviteLinkSheet } from "@/invite/components/InviteLinkSheet";
import { showThrownAsToast } from "@/lib/show-error-toast";
import { useRemoveLeaguePlayer, useUpdateLeaguePlayer } from "../../hooks";
import type { LeagueRosterRow } from "../../types";
import { RosterPosition } from "../../types";
import { RosterWorkspace } from "../roster";

type Props = {
  leagueId: number;
  leagueName: string;
  seasonId: number;
  teams: ApiTeam[];
  adminTeamId?: number;
};

export function ManagePlayersTab({
  leagueId,
  leagueName,
  seasonId,
  teams,
  adminTeamId,
}: Props) {
  const [inviteOpen, setInviteOpen] = useState(false);
  return (
    <View className="gap-4 pb-8">
      <Button
        label="Invite players"
        variant="secondary"
        onPress={() => setInviteOpen(true)}
      />
      <RosterWorkspace
        key={`${leagueId}:${seasonId}:${adminTeamId ?? "owner"}`}
        leagueId={leagueId}
        seasonId={seasonId}
        teams={teams}
        adminTeamId={adminTeamId}
        renderDetails={
          adminTeamId == null
            ? (row) => (
                <RosterRow row={row} leagueId={leagueId} seasonId={seasonId} />
              )
            : undefined
        }
      />
      <InviteLinkSheet
        visible={inviteOpen}
        onClose={() => setInviteOpen(false)}
        leagueId={leagueId}
        leagueName={leagueName}
        seasonId={seasonId}
        teams={
          adminTeamId == null
            ? teams
            : teams.filter((team) => team.id === adminTeamId)
        }
        initialTeamId={adminTeamId ?? null}
        allowUnassigned={adminTeamId == null}
      />
    </View>
  );
}

function RosterRow({
  row,
  leagueId,
  seasonId,
}: {
  row: LeagueRosterRow;
  leagueId: number;
  seasonId: number;
}) {
  const theme = useTheme();
  const [editOpen, setEditOpen] = useState(false);
  const updateMutation = useUpdateLeaguePlayer(leagueId, seasonId);
  const removeMutation = useRemoveLeaguePlayer(leagueId, seasonId);
  const [jersey, setJersey] = useState(row.jerseyNumber ?? "");
  const [position, setPosition] = useState(row.position);
  const [isCaptain, setIsCaptain] = useState(row.isCaptain);

  const handleRemove = () => {
    if (removeMutation.isPending) return;
    Alert.alert("Remove player", `Remove ${row.player.name} from the roster?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          void removeMutation.mutateAsync(row.id).catch((error) => {
            showThrownAsToast(error, "Could not remove player");
          });
        },
      },
    ]);
  };

  const handleSave = async () => {
    if (updateMutation.isPending) return;
    try {
      await updateMutation.mutateAsync({
        leaguePlayerId: row.id,
        payload: {
          jerseyNumber: jersey.trim() || null,
          position,
          isCaptain,
        },
      });
      setEditOpen(false);
    } catch (error) {
      showThrownAsToast(error, "Could not update player");
    }
  };

  return (
    <>
      <Pressable
        onPress={() => setEditOpen(true)}
        onLongPress={handleRemove}
        className="flex-row items-center gap-3 rounded-xl border px-4 py-3 active:opacity-85"
        style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}
      >
        <View className="flex-1 gap-1">
          <View className="flex-row items-center gap-2">
            <Text style={{ color: theme.text }}>{row.player.name}</Text>
            {row.isCaptain ? (
              <Text className="text-xs" style={{ color: theme.accent }}>
                Captain
              </Text>
            ) : null}
          </View>
          <Text className="text-xs" style={{ color: theme.textSubtle }}>
            {[
              row.jerseyNumber ? `#${row.jerseyNumber}` : null,
              row.position ?? null,
              row.status,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.textSubtle} />
      </Pressable>

      <BottomSheetModal
        visible={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit roster row"
        subtitle={row.player.name}
      >
        <View className="gap-4">
          <AuthTextField
            label="Jersey number"
            value={jersey}
            onChangeText={setJersey}
            keyboardType="number-pad"
          />
          <View className="gap-2">
            <Text
              className="text-xs uppercase tracking-wide"
              style={{ color: theme.textSubtle }}
            >
              Position
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {Object.values(RosterPosition).map((pos) => {
                const active = position === pos;
                return (
                  <Pressable
                    key={pos}
                    onPress={() => setPosition(pos)}
                    className={[
                      "rounded-full border px-3 py-2 capitalize",
                    ].join(" ")}
                    style={{
                      backgroundColor: active
                        ? theme.brandMuted
                        : theme.cardMuted,
                      borderColor: active ? theme.brand : theme.cardBorder,
                    }}
                  >
                    <Text style={{ color: active ? theme.brand : theme.text }}>
                      {pos}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <Pressable
            onPress={() => setIsCaptain((value) => !value)}
            className="flex-row items-center justify-between rounded-xl border px-4 py-3"
            style={{
              backgroundColor: theme.cardMuted,
              borderColor: theme.cardBorder,
            }}
          >
            <Text style={{ color: theme.text }}>Team captain</Text>
            <Ionicons
              name={isCaptain ? "checkbox" : "square-outline"}
              size={22}
              color={theme.brand}
            />
          </Pressable>
          <Button
            variant="authPurple"
            label="Save"
            onPress={() => void handleSave()}
            loading={updateMutation.isPending}
            disabled={updateMutation.isPending}
          />
          <Button
            variant="secondary"
            label="Remove from roster"
            onPress={handleRemove}
            loading={removeMutation.isPending}
            disabled={removeMutation.isPending}
          />
        </View>
      </BottomSheetModal>
    </>
  );
}
