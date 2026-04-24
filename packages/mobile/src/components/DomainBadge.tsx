import { Pressable, Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { routes } from "@/constants/routes";
import { colors, fonts } from "@/constants/theme";

interface DomainBadgeProps {
  domain: string;
}

export function DomainBadge({ domain }: DomainBadgeProps) {
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push(routes.site(domain))}
      style={s.badge}
      accessibilityRole="button"
      accessibilityLabel={`Source: ${domain}`}
    >
      <Text style={s.text}>{domain}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  badge: {
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
    color: colors.inkFaint,
    letterSpacing: 0.5,
  },
});
