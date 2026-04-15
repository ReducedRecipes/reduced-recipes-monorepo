import React, { useState, useCallback } from "react";
import { View, Text, Pressable } from "react-native";
import { scaleIngredient } from "../lib/scale-ingredient";

export { parseQuantity, scaleIngredient } from "../lib/scale-ingredient";

export interface IngredientListProps {
  ingredients: string[];
  /** Default serving count the recipe was written for (default 1). */
  baseServings?: number;
  /** Called when "Add all to shopping list" is pressed. Receives scaled ingredients. */
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

  const decrement = useCallback(() => {
    setServings((s) => Math.max(1, s - 1));
  }, []);

  const increment = useCallback(() => {
    setServings((s) => s + 1);
  }, []);

  const scaledIngredients = ingredients.map((ing) => scaleIngredient(ing, factor));

  const handleAddAll = useCallback(() => {
    onAddAllToShoppingList?.(scaledIngredients);
  }, [onAddAllToShoppingList, scaledIngredients]);

  return (
    <View className="px-4 py-3" accessibilityRole="list">
      {/* Serving adjuster */}
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-base font-medium text-ink dark:text-dark-ink">
          Servings
        </Text>
        <View className="flex-row items-center rounded-lg bg-bgMuted dark:bg-dark-bgMuted">
          <Pressable
            onPress={decrement}
            accessibilityLabel="Decrease servings"
            accessibilityRole="button"
            className="px-3 py-1"
          >
            <Text className="text-lg font-bold text-ink dark:text-dark-ink">
              −
            </Text>
          </Pressable>
          <Text
            className="min-w-[32px] text-center text-base font-medium text-ink dark:text-dark-ink"
            accessibilityLabel={`${servings} servings`}
          >
            {servings}
          </Text>
          <Pressable
            onPress={increment}
            accessibilityLabel="Increase servings"
            accessibilityRole="button"
            className="px-3 py-1"
          >
            <Text className="text-lg font-bold text-ink dark:text-dark-ink">
              +
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Ingredient rows */}
      {scaledIngredients.map((ingredient, index) => (
        <Pressable
          key={index}
          onPress={() => toggle(index)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: checked.has(index) }}
          className="flex-row items-center py-2 border-b border-bgMuted dark:border-dark-bgMuted"
        >
          <View
            className={`w-5 h-5 rounded mr-3 border items-center justify-center ${
              checked.has(index)
                ? "bg-orange border-orange"
                : "border-inkFaint dark:border-dark-inkFaint"
            }`}
          >
            {checked.has(index) && (
              <Text className="text-xs text-white font-bold">✓</Text>
            )}
          </View>
          <Text
            className={`flex-1 text-base ${
              checked.has(index)
                ? "line-through text-inkMuted dark:text-dark-inkMuted"
                : "text-ink dark:text-dark-ink"
            }`}
          >
            {ingredient}
          </Text>
        </Pressable>
      ))}

      {/* Add all to shopping list */}
      {onAddAllToShoppingList && (
        <Pressable
          onPress={handleAddAll}
          accessibilityRole="button"
          accessibilityLabel="Add all to shopping list"
          className="mt-4 py-3 rounded-lg bg-orange items-center"
        >
          <Text className="text-white font-medium text-base">
            Add all to shopping list
          </Text>
        </Pressable>
      )}
    </View>
  );
}
