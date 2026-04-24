import React, { forwardRef, useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { BottomSheet, type BottomSheetRef } from '@/components/BottomSheet';

export interface SearchFilters {
  maxTime?: number;
  cuisines: string[];
  dietary: string[];
}

const COOK_TIMES = [15, 30, 45, 60] as const;

const CUISINES = [
  'Italian', 'Japanese', 'Mexican', 'Indian', 'Thai',
  'Chinese', 'French', 'American', 'Mediterranean', 'Korean',
] as const;

const DIETARY_OPTIONS = [
  'Vegan', 'Vegetarian', 'Gluten-free', 'Dairy-free', 'Keto',
] as const;

export interface FilterChipGroupProps {
  options: readonly string[];
  selected: string[];
  onToggle: (value: string) => void;
}

export function FilterChipGroup({ options, selected, onToggle }: FilterChipGroupProps) {
  return (
    <View className="mb-4 flex-row flex-wrap gap-2">
      {options.map((item) => (
        <Pressable
          key={item}
          onPress={() => onToggle(item)}
          className={`border px-4 py-2 ${
            selected.includes(item) ? 'bg-accent border-accent' : 'border-rule'
          }`}
          accessibilityRole="button"
          accessibilityLabel={item}
        >
          <Text
            className={`font-mono text-xs uppercase tracking-wider ${
              selected.includes(item) ? 'text-white' : 'text-ink'
            }`}
          >
            {item}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export interface FilterSheetProps {
  visible: boolean;
  onDismiss: () => void;
  onApply: (filters: SearchFilters) => void;
}

export const FilterSheet = forwardRef<BottomSheetRef, FilterSheetProps>(
  function FilterSheet({ visible, onDismiss, onApply }, ref) {
    const [maxTime, setMaxTime] = useState<number | undefined>(undefined);
    const [cuisines, setCuisines] = useState<string[]>([]);
    const [dietary, setDietary] = useState<string[]>([]);

    const toggleCuisine = useCallback((c: string) => {
      setCuisines((prev) =>
        prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
      );
    }, []);

    const toggleDietary = useCallback((d: string) => {
      setDietary((prev) =>
        prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
      );
    }, []);

    const removeChip = useCallback(
      (type: 'time' | 'cuisine' | 'dietary', value?: string) => {
        if (type === 'time') setMaxTime(undefined);
        if (type === 'cuisine' && value)
          setCuisines((prev) => prev.filter((c) => c !== value));
        if (type === 'dietary' && value)
          setDietary((prev) => prev.filter((d) => d !== value));
      },
      [],
    );

    const handleApply = useCallback(() => {
      onApply({ maxTime, cuisines, dietary });
      onDismiss();
    }, [maxTime, cuisines, dietary, onApply, onDismiss]);

    const hasActiveFilters =
      maxTime !== undefined || cuisines.length > 0 || dietary.length > 0;

    return (
      <BottomSheet
        ref={ref}
        snapPoints={['50%', '90%']}
        index={visible ? 0 : -1}
        onClose={onDismiss}
      >
        <ScrollView className="flex-1 px-4 pb-6">
          <Text className="mb-4 font-serif text-xl text-ink">Filters</Text>

          {hasActiveFilters && (
            <View className="mb-4 flex-row flex-wrap gap-2">
              {maxTime !== undefined && (
                <Chip label={`≤${maxTime} min`} onRemove={() => removeChip('time')} />
              )}
              {cuisines.map((c) => (
                <Chip key={c} label={c} onRemove={() => removeChip('cuisine', c)} />
              ))}
              {dietary.map((d) => (
                <Chip key={d} label={d} onRemove={() => removeChip('dietary', d)} />
              ))}
            </View>
          )}

          <Text className="mb-2 font-mono text-xs uppercase tracking-widest text-ink-faint">
            Cook time
          </Text>
          <View className="mb-4 flex-row gap-2">
            {COOK_TIMES.map((t) => (
              <Pressable
                key={t}
                onPress={() => setMaxTime(maxTime === t ? undefined : t)}
                className={`border px-4 py-2 ${
                  maxTime === t ? 'bg-accent border-accent' : 'border-rule'
                }`}
                accessibilityRole="button"
                accessibilityLabel={`${t === 60 ? '60+' : t} minutes`}
              >
                <Text
                  className={`font-mono text-xs uppercase tracking-wider ${
                    maxTime === t ? 'text-white' : 'text-ink'
                  }`}
                >
                  {t === 60 ? '60+' : t} min
                </Text>
              </Pressable>
            ))}
          </View>

          <Text className="mb-2 font-mono text-xs uppercase tracking-widest text-ink-faint">
            Cuisine
          </Text>
          <FilterChipGroup options={CUISINES} selected={cuisines} onToggle={toggleCuisine} />

          <Text className="mb-2 font-mono text-xs uppercase tracking-widest text-ink-faint">
            Dietary
          </Text>
          <FilterChipGroup options={DIETARY_OPTIONS} selected={dietary} onToggle={toggleDietary} />

          <Pressable
            onPress={handleApply}
            className="mt-2 items-center bg-ink py-4"
            style={{ minHeight: 44 }}
            accessibilityRole="button"
            accessibilityLabel="Apply filters"
          >
            <Text className="font-mono text-sm uppercase tracking-wider text-white">
              APPLY FILTERS →
            </Text>
          </Pressable>
        </ScrollView>
      </BottomSheet>
    );
  },
);

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <View className="flex-row items-center border border-accent px-3 py-1">
      <Text className="mr-1 font-mono text-xs text-accent">{label}</Text>
      <Pressable
        onPress={onRemove}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${label} filter`}
      >
        <Text className="text-sm text-accent">×</Text>
      </Pressable>
    </View>
  );
}
