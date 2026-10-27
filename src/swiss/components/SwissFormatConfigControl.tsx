import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import type { SwissByeHandling } from "@/api/entities";
import { AuthTextField } from "@/components/ui/auth-text-field";
import { Button } from "@/components/ui/Button";
import { FormFieldLabel } from "@/components/ui/form-field-label";

const BYE_HANDLING_OPTIONS: { value: SwissByeHandling; label: string }[] = [
  { value: "warn", label: "Warn only" },
  { value: "award_points", label: "Award a win" },
  { value: "exclude", label: "Exclude from table" },
];

/**
 * Numeric field that keeps a local text draft so the user can clear it or
 * retype freely; only valid values (1..max) are committed to the form, and
 * blur restores the last committed value when the draft is empty/invalid.
 */
function NumberField({
  label,
  value,
  max,
  onCommit,
}: {
  label: string;
  value: number;
  max: number;
  onCommit: (n: number) => void;
}) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  return (
    <AuthTextField
      label={label}
      value={text}
      keyboardType="number-pad"
      onChangeText={(raw) => {
        const digits = raw.replace(/[^0-9]/g, "");
        if (!digits || Number(digits) < 0) {
          setText(digits);
          return;
        }
        const clamped = Math.min(Number(digits), max);
        setText(String(clamped));
        onCommit(clamped);
      }}
      onBlur={() => {
        if (!text || Number(text) < 0) setText(String(value));
      }}
    />
  );
}

export type SwissFormatFormState = {
  groupNames: string[];
  rounds: number;
  byeHandling: SwissByeHandling;
  directCount: number;
  playoffRankFrom: number;
  playoffRankTo: number;
};

export function defaultSwissFormatFormState(): SwissFormatFormState {
  return {
    groupNames: ["Campus A", "Campus B"],
    rounds: 3,
    byeHandling: "warn",
    directCount: 1,
    playoffRankFrom: 2,
    playoffRankTo: 5,
  };
}

type Props = {
  value: SwissFormatFormState;
  onChange: (value: SwissFormatFormState) => void;
  tone?: "light" | "dark";
};

export function SwissFormatConfigControl({ value, onChange, tone = "light" }: Props) {
  const labelClass = tone === "dark" ? "text-white/45" : "text-slate-500";
  const chipIdle = tone === "dark" ? "border-white/15 bg-white/5" : "border-neutral-200 bg-[#F5F5F5]";
  const chipActive =
    tone === "dark" ? "border-accent-400 bg-accent-500/20" : "border-brand-400 bg-brand-50";
  const chipTextIdle = tone === "dark" ? "text-white/70" : "text-neutral-700";
  const chipTextActive = tone === "dark" ? "text-accent-200" : "text-brand-800";
  const bodyTextClass = tone === "dark" ? "text-white/90" : "text-neutral-900";

  const updateGroupName = (index: number, name: string) => {
    onChange({
      ...value,
      groupNames: value.groupNames.map((g, i) => (i === index ? name : g)),
    });
  };

  const addGroup = () =>
    onChange({ ...value, groupNames: [...value.groupNames, `Campus ${value.groupNames.length + 1}`] });

  const removeGroup = (index: number) =>
    onChange({ ...value, groupNames: value.groupNames.filter((_, i) => i !== index) });

  return (
    <View className="gap-3">
      <View className="gap-1.5">
        <FormFieldLabel label="Groups" className={labelClass} />
        {value.groupNames.map((groupName, index) => (
          <View key={index} className="flex-row items-center gap-2">
            <View className="flex-1">
              <AuthTextField
                label={`Group ${index + 1}`}
                value={groupName}
                onChangeText={(v) => updateGroupName(index, v)}
              />
            </View>
            {value.groupNames.length > 1 ? (
              <Pressable
                onPress={() => removeGroup(index)}
                className="h-10 w-10 items-center justify-center rounded-xl border"
                style={{ borderColor: "transparent" }}
              >
                <Text className={bodyTextClass}>✕</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
        <Button variant="secondary" label="Add group" onPress={addGroup} />
      </View>

      <View className="flex-row gap-3">
        <View className="flex-1">
          <NumberField
            label="Rounds"
            value={value.rounds}
            max={20}
            onCommit={(n) => onChange({ ...value, rounds: Math.max(1, n) })}
          />
        </View>
        <View className="flex-1">
          <NumberField
            label="Direct qualifiers"
            value={value.directCount}
            max={32}
            onCommit={(n) => onChange({ ...value, directCount: n })}
          />
        </View>
      </View>

      <View className="flex-row gap-3">
        <View className="flex-1">
          <NumberField
            label="Playoff rank from"
            value={value.playoffRankFrom}
            max={64}
            onCommit={(n) => onChange({ ...value, playoffRankFrom: n })}
          />
        </View>
        <View className="flex-1">
          <NumberField
            label="Playoff rank to"
            value={value.playoffRankTo}
            max={64}
            onCommit={(n) => onChange({ ...value, playoffRankTo: n })}
          />
        </View>
      </View>

      <View className="gap-1.5">
        <FormFieldLabel label="If a group has an odd number of teams" className={labelClass} />
        <View className="flex-row flex-wrap gap-2">
          {BYE_HANDLING_OPTIONS.map((opt) => {
            const active = value.byeHandling === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => onChange({ ...value, byeHandling: opt.value })}
                className={`rounded-xl border px-3 py-2 ${active ? chipActive : chipIdle}`}
              >
                <Text className={active ? chipTextActive : chipTextIdle}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Text className={`text-xs leading-5 ${tone === "dark" ? "text-white/45" : "text-slate-500"}`}>
        This default qualification rule applies to every group. Edit a single
        group&apos;s rule later from Manage once standings exist.
      </Text>
    </View>
  );
}
