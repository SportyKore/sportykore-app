import { Ionicons } from "@expo/vector-icons";
import { Alert, Pressable, Text } from "react-native";

import { useTheme } from "@/color/use-theme";

type Props = {
  /** Alert title. */
  title: string;
  /** Alert body - the actual explanation. */
  message: string;
  /** Visible text next to the icon. Omit for an icon-only tooltip. */
  label?: string;
  size?: number;
};

/**
 * Small "why is this disabled?" affordance: an info icon (with optional
 * label) that shows a plain alert on tap. Mobile has no hover, so this is
 * the house pattern for explaining a disabled or blocked action inline
 * instead of leaving the admin to guess.
 */
export function InfoTooltip({ title, message, label, size = 20 }: Props) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ? `${label}. More info.` : `More info: ${title}`}
      hitSlop={8}
      className="flex-row items-center gap-1.5 px-1"
      onPress={() => Alert.alert(title, message)}
    >
      <Ionicons name="information-circle-outline" size={size} color={theme.textSubtle} />
      {label ? (
        <Text className="text-sm" style={{ color: theme.textSubtle }}>
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}
