import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts } from '@/constants/theme';

interface NutritionData {
  calories?: number | null;
  protein_g?: number | null;
  fat_g?: number | null;
  carbs_g?: number | null;
  fiber_g?: number | null;
  sodium_mg?: number | null;
  source?: string;
}

interface NutritionPanelProps {
  nutrition: NutritionData;
}

function NutritionRow({ label, value, unit }: { label: string; value: number | null | undefined; unit: string }) {
  if (value == null) return null;
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>{Math.round(value)}{unit}</Text>
    </View>
  );
}

export function NutritionPanel({ nutrition }: NutritionPanelProps) {
  const hasData = nutrition.calories != null || nutrition.protein_g != null;
  if (!hasData) return null;

  return (
    <View style={s.container}>
      <View style={s.headerRow}>
        <Text style={s.headerDiamond}>◆</Text>
        <Text style={s.headerLabel}>NUTRITION PER SERVING</Text>
        <View style={s.headerRule} />
      </View>

      {nutrition.source === 'ai' && (
        <View style={s.badgeRow}>
          <Text style={s.aiBadge}>AI ESTIMATED</Text>
        </View>
      )}

      <View style={s.grid}>
        {nutrition.calories != null && (
          <View style={s.statBlock}>
            <Text style={s.statValue}>{Math.round(nutrition.calories)}</Text>
            <Text style={s.statLabel}>KCAL</Text>
          </View>
        )}
        {nutrition.protein_g != null && (
          <View style={s.statBlock}>
            <Text style={s.statValue}>{Math.round(nutrition.protein_g)}g</Text>
            <Text style={s.statLabel}>PROTEIN</Text>
          </View>
        )}
        {nutrition.fat_g != null && (
          <View style={s.statBlock}>
            <Text style={s.statValue}>{Math.round(nutrition.fat_g)}g</Text>
            <Text style={s.statLabel}>FAT</Text>
          </View>
        )}
        {nutrition.carbs_g != null && (
          <View style={s.statBlock}>
            <Text style={s.statValue}>{Math.round(nutrition.carbs_g)}g</Text>
            <Text style={s.statLabel}>CARBS</Text>
          </View>
        )}
      </View>

      <View style={s.details}>
        <NutritionRow label="Fiber" value={nutrition.fiber_g} unit="g" />
        <NutritionRow label="Sodium" value={nutrition.sodium_mg} unit="mg" />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  headerDiamond: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.accent,
  },
  headerLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.inkFaint,
    letterSpacing: 1.5,
  },
  headerRule: {
    flex: 1,
    height: 1,
    backgroundColor: colors.rule,
  },
  badgeRow: {
    marginBottom: 12,
  },
  aiBadge: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.accent,
    letterSpacing: 1,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  grid: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.rule,
  },
  statBlock: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    borderRightWidth: 1,
    borderRightColor: colors.rule,
  },
  statValue: {
    fontFamily: fonts.serif,
    fontSize: 22,
    color: colors.ink,
  },
  statLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.inkFaint,
    letterSpacing: 1,
    marginTop: 4,
  },
  details: {
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: colors.rule,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
  },
  rowLabel: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.ink2,
  },
  rowValue: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: colors.ink,
    letterSpacing: 0.5,
  },
});
