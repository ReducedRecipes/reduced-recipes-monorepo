import { Pressable, Text } from "react-native";
import { useRouter } from "expo-router";
import { routes } from "@/constants/routes";

interface DomainBadgeProps {
  domain: string;
}

export function DomainBadge({ domain }: DomainBadgeProps) {
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push(routes.site(domain))}
      className="min-h-[44px] min-w-[44px] items-center justify-center rounded-md bg-gray-100 px-3 py-1.5"
      accessibilityRole="button"
      accessibilityLabel={`Source: ${domain}`}
    >
      <Text className="text-sm text-gray-500">{domain}</Text>
    </Pressable>
  );
}
