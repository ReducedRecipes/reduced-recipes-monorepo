import { View, Text, StyleSheet } from "react-native";
import { colors, fonts } from "@/constants/theme";

interface TimeChipProps {
  minutes: number;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (remaining === 0) return `${hours} hr`;
  return `${hours} hr ${remaining} min`;
}

export function TimeChip({ minutes }: TimeChipProps) {
  return (
    <View style={s.chip}>
      <Text style={s.text}>{formatDuration(minutes)}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  chip: {
    minHeight: 44,
    minWidth: 44,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.rule,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  text: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.inkFaint,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
