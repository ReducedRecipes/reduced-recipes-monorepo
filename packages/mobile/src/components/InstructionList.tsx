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
          <View style={s.badge}>
            <Text style={s.badgeText}>{index + 1}</Text>
          </View>
          <Text style={s.stepText}>{step}</Text>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", marginBottom: 16 },
  badge: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.orange,
    alignItems: "center", justifyContent: "center",
    marginRight: 12, marginTop: 2,
  },
  badgeText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  stepText: {
    flex: 1, fontFamily: fonts.body, fontSize: 15,
    lineHeight: 22, color: colors.ink,
  },
});
