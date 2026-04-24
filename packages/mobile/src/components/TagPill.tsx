import { Pressable, Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { routes } from "@/constants/routes";
import { colors, fonts } from "@/constants/theme";

interface TagPillProps {
  tag: string;
}

export function TagPill({ tag }: TagPillProps) {
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push(routes.tag(tag))}
      style={s.pill}
      accessibilityRole="button"
      accessibilityLabel={`Tag: ${tag}`}
    >
      <Text style={s.text}>{tag}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  pill: {
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.rule,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  text: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.ink2,
    letterSpacing: 0.5,
  },
});
