import { View, Text } from "react-native";

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
    <View className="min-h-[44px] min-w-[44px] flex-row items-center gap-1 rounded-full bg-gray-100 px-3 py-1.5">
      <Text className="text-sm text-gray-500">🕐</Text>
      <Text className="text-sm font-medium text-gray-700">
        {formatDuration(minutes)}
      </Text>
    </View>
  );
}
