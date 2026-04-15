import { Pressable, Text } from "react-native";
import { useRouter } from "expo-router";
import { routes } from "@/constants/routes";

interface TagPillProps {
  tag: string;
}

export function TagPill({ tag }: TagPillProps) {
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push(routes.tag(tag))}
      className="min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-orange-50 px-3 py-1.5"
      accessibilityRole="button"
      accessibilityLabel={`Tag: ${tag}`}
    >
      <Text className="text-sm font-medium text-orange-600">{tag}</Text>
    </Pressable>
  );
}
