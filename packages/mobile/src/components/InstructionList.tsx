import React from "react";
import { View, Text } from "react-native";

export interface InstructionListProps {
  instructions: string[];
}

export function InstructionList({ instructions }: InstructionListProps) {
  return (
    <View className="px-4 py-3" accessibilityRole="list">
      {instructions.map((step, index) => (
        <View
          key={index}
          className="flex-row mb-4"
          accessibilityRole="summary"
          accessibilityLabel={`Step ${index + 1}: ${step}`}
        >
          <View className="w-7 h-7 rounded-full bg-orange items-center justify-center mr-3 mt-0.5">
            <Text className="text-white text-sm font-bold">{index + 1}</Text>
          </View>
          <Text className="flex-1 text-base leading-6 text-ink dark:text-dark-ink">
            {step}
          </Text>
        </View>
      ))}
    </View>
  );
}
