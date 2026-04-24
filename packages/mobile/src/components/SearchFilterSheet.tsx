import React, { forwardRef, useCallback, useImperativeHandle, useState } from 'react';
import { Pressable, ScrollView, Text, View, StyleSheet, Modal } from 'react-native';
import { colors, fonts } from '@/constants/theme';

export type SearchMode = 'keyword' | 'semantic' | 'hybrid';
export type SortOption = 'newest' | 'hot' | 'top' | 'time_asc' | 'time_desc' | 'az' | 'za';

export interface FullSearchFilters {
  mode: SearchMode;
  sort: SortOption;
  maxTime?: number;
  dietary: string[];
  method: string[];
}

export interface SearchFilterSheetRef {
  open: () => void;
  close: () => void;
}

interface Props {
  filters: FullSearchFilters;
  onApply: (filters: FullSearchFilters) => void;
}

const TIME_OPTIONS = [
  { label: '≤ 15 MIN', value: 15 },
  { label: '≤ 30 MIN', value: 30 },
  { label: '≤ 1 HR', value: 60 },
  { label: '≤ 3 HR', value: 180 },
] as const;

const DIETARY_OPTIONS = [
  'Vegetarian', 'Vegan', 'Keto', 'Gluten-free',
] as const;

const METHOD_OPTIONS = [
  'One-pan', 'One-pot', 'Sheet-pan', 'Slow-cook', 'No-cook',
] as const;

const SORT_OPTIONS: { label: string; value: SortOption }[] = [
  { label: 'NEWEST', value: 'newest' },
  { label: 'HOT', value: 'hot' },
  { label: 'TOP', value: 'top' },
  { label: 'TIME ↑', value: 'time_asc' },
  { label: 'TIME ↓', value: 'time_desc' },
  { label: 'A→Z', value: 'az' },
  { label: 'Z→A', value: 'za' },
];

function ChipGroup({
  options,
  selected,
  onToggle,
}: {
  options: readonly string[];
  selected: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <View style={st.chipRow}>
      {options.map((opt) => {
        const active = selected.includes(opt);
        return (
          <Pressable
            key={opt}
            onPress={() => onToggle(opt)}
            style={[st.chip, active && st.chipActive]}
          >
            <Text style={[st.chipText, active && st.chipTextActive]}>{opt.toUpperCase()}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const SearchFilterSheet = forwardRef<SearchFilterSheetRef, Props>(
  function SearchFilterSheet({ filters, onApply }, ref) {
    const [visible, setVisible] = useState(false);
    const [mode, setMode] = useState<SearchMode>(filters.mode);
    const [sort, setSort] = useState<SortOption>(filters.sort);
    const [maxTime, setMaxTime] = useState<number | undefined>(filters.maxTime);
    const [dietary, setDietary] = useState<string[]>([...filters.dietary]);
    const [method, setMethod] = useState<string[]>([...filters.method]);

    useImperativeHandle(ref, () => ({
      open: () => {
        setMode(filters.mode);
        setSort(filters.sort);
        setMaxTime(filters.maxTime);
        setDietary([...filters.dietary]);
        setMethod([...filters.method]);
        setVisible(true);
      },
      close: () => setVisible(false),
    }));

    const toggleList = useCallback((list: string[], value: string) => {
      return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
    }, []);

    const handleApply = useCallback(() => {
      onApply({ mode, sort, maxTime, dietary, method });
      setVisible(false);
    }, [mode, sort, maxTime, dietary, method, onApply]);

    const handleReset = useCallback(() => {
      setMode('keyword');
      setSort('newest');
      setMaxTime(undefined);
      setDietary([]);
      setMethod([]);
    }, []);

    return (
      <Modal visible={visible} transparent animationType="slide">
        <Pressable style={st.backdrop} onPress={() => setVisible(false)} />
        <View style={st.sheet}>
          <ScrollView contentContainerStyle={st.scrollContent}>
            {/* Header */}
            <View style={st.headerRow}>
              <Text style={st.headerTitle}>Filters</Text>
              <Pressable onPress={handleReset}>
                <Text style={st.resetText}>RESET</Text>
              </Pressable>
            </View>

            {/* Sort */}
            <Text style={st.sectionLabel}>SORT BY</Text>
            <View style={st.chipRow}>
              {SORT_OPTIONS.map((opt) => {
                const active = sort === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => setSort(opt.value)}
                    style={[st.chip, active && st.chipActive]}
                  >
                    <Text style={[st.chipText, active && st.chipTextActive]}>{opt.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Max time */}
            <Text style={st.sectionLabel}>MAXIMUM TIME</Text>
            <View style={st.chipRow}>
              {TIME_OPTIONS.map((opt) => {
                const active = maxTime === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => setMaxTime(active ? undefined : opt.value)}
                    style={[st.chip, active && st.chipActive]}
                  >
                    <Text style={[st.chipText, active && st.chipTextActive]}>{opt.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Diet */}
            <Text style={st.sectionLabel}>DIET</Text>
            <ChipGroup
              options={DIETARY_OPTIONS}
              selected={dietary}
              onToggle={(v) => setDietary(toggleList(dietary, v))}
            />

            {/* Method */}
            <Text style={st.sectionLabel}>METHOD</Text>
            <ChipGroup
              options={METHOD_OPTIONS}
              selected={method}
              onToggle={(v) => setMethod(toggleList(method, v))}
            />

            {/* Apply */}
            <Pressable onPress={handleApply} style={st.applyBtn}>
              <Text style={st.applyText}>→ APPLY FILTERS</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    );
  },
);

const st = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.rule,
    maxHeight: '80%',
    paddingBottom: 34,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerTitle: {
    fontFamily: fonts.serif,
    fontSize: 22,
    color: colors.ink,
  },
  resetText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.accent,
    letterSpacing: 1,
  },
  sectionLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.inkFaint,
    letterSpacing: 1.5,
    marginTop: 16,
    marginBottom: 10,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.rule,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  chipText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.ink,
    letterSpacing: 1,
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  applyBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  applyText: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
});
