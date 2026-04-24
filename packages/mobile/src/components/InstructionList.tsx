import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, fonts } from "@/constants/theme";

export interface InstructionListProps {
  instructions: string[];
}

export function InstructionList({ instructions }: InstructionListProps) {
  return (
    <View accessibilityRole="list">
      {instructions.map((step, index) => (
        <View key={index} style={s.row} accessibilityRole="summary" accessibilityLabel={`Step ${index + 1}: ${step}`}>
          <Text style={s.stepNumber}>{String(index + 1).padStart(2, '0')}</Text>
          <Text style={s.stepText}>{step}</Text>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", marginBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.rule, paddingBottom: 16 },
  stepNumber: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.inkFaint,
    marginRight: 12,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  stepText: {
    flex: 1, fontFamily: fonts.sans, fontSize: 15,
    lineHeight: 22, color: colors.ink,
  },
});
