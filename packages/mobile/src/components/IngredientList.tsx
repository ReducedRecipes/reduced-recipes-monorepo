import React, { useState, useCallback } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { scaleIngredient } from "../lib/scale-ingredient";
import { colors, fonts } from "@/constants/theme";

export { parseQuantity, scaleIngredient } from "../lib/scale-ingredient";

export interface IngredientListProps {
  ingredients: string[];
  baseServings?: number;
  onAddAllToShoppingList?: (ingredients: string[]) => void;
}

export function IngredientList({
  ingredients,
  baseServings = 1,
  onAddAllToShoppingList,
}: IngredientListProps) {
  const [servings, setServings] = useState(baseServings);
  const [checked, setChecked] = useState<Set<number>>(new Set());

  const factor = servings / baseServings;

  const toggle = useCallback((index: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const scaledIngredients = ingredients.map((ing) => scaleIngredient(ing, factor));

  return (
    <View accessibilityRole="list">
      {/* Serving adjuster */}
      <View style={s.servingRow}>
        <Text style={s.servingLabel}>SERVINGS</Text>
        <View style={s.servingControl}>
          <Pressable onPress={() => setServings((v) => Math.max(1, v - 1))} style={s.servingBtn} accessibilityLabel="Decrease servings">
            <Text style={s.servingBtnText}>−</Text>
          </Pressable>
          <Text style={s.servingCount}>{servings}</Text>
          <Pressable onPress={() => setServings((v) => v + 1)} style={s.servingBtn} accessibilityLabel="Increase servings">
            <Text style={s.servingBtnText}>+</Text>
          </Pressable>
        </View>
      </View>

      {/* Ingredient rows */}
      {scaledIngredients.map((ingredient, index) => {
        const isChecked = checked.has(index);
        return (
          <Pressable
            key={index}
            onPress={() => toggle(index)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isChecked }}
            style={s.ingredientRow}
          >
            <View style={[s.checkbox, isChecked && s.checkboxChecked]}>
              {isChecked && <Text style={s.checkmark}>✓</Text>}
            </View>
            <Text style={[s.ingredientText, isChecked && s.ingredientChecked]}>
              {ingredient}
            </Text>
          </Pressable>
        );
      })}

      {onAddAllToShoppingList && (
        <Pressable
          onPress={() => onAddAllToShoppingList(scaledIngredients)}
          style={s.addAllBtn}
          accessibilityRole="button"
          accessibilityLabel="Add all to shopping list"
        >
          <Text style={s.addAllText}>+ ADD ALL TO SHOPPING LIST</Text>
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  servingRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: 16,
  },
  servingLabel: { fontFamily: fonts.mono, fontSize: 11, color: colors.inkFaint, letterSpacing: 1.5 },
  servingControl: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1, borderColor: colors.rule,
  },
  servingBtn: { paddingHorizontal: 14, paddingVertical: 6 },
  servingBtnText: { fontSize: 18, fontWeight: "700", color: colors.ink },
  servingCount: {
    fontFamily: fonts.mono, fontSize: 15, color: colors.ink,
    minWidth: 32, textAlign: "center",
  },
  ingredientRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.rule,
  },
  checkbox: {
    width: 22, height: 22, marginRight: 12,
    borderWidth: 2, borderColor: colors.inkFaint,
    alignItems: "center", justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: colors.accent, borderColor: colors.accent,
  },
  checkmark: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  ingredientText: { flex: 1, fontFamily: fonts.sans, fontSize: 15, color: colors.ink },
  ingredientChecked: { textDecorationLine: "line-through", color: colors.inkFaint },
  addAllBtn: {
    marginTop: 16, paddingVertical: 14,
    borderWidth: 1, borderColor: colors.accent, alignItems: "center",
  },
  addAllText: { fontFamily: fonts.mono, fontSize: 12, color: colors.accent, letterSpacing: 1 },
});
