import { useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { colors, fonts } from '@/constants/theme';
import { usePantryStore } from '@/stores/pantry.store';
import { searchByPantry } from '@/lib/api';
import { PantryChipPicker } from '@/components/PantryChipPicker';
import { PantryResultCard } from '@/components/PantryResultCard';

type Mode = 'all' | 'exact' | 'almost';

const MODE_LIMITS: Record<Mode, number | undefined> = { all: undefined, exact: 0, almost: 3 };

export default function PantryScreen() {
  const have = usePantryStore((s) => s.have);
  const exclude = usePantryStore((s) => s.exclude);
  const addHave = usePantryStore((s) => s.addHave);
  const removeHave = usePantryStore((s) => s.removeHave);
  const addExclude = usePantryStore((s) => s.addExclude);
  const removeExclude = usePantryStore((s) => s.removeExclude);
  const syncFromServer = usePantryStore((s) => s.syncFromServer);

  const [mode, setMode] = useState<Mode>('all');
  const maxMissing = useMemo(() => MODE_LIMITS[mode], [mode]);

  useEffect(() => {
    void syncFromServer();
  }, [syncFromServer]);

  const { data, isLoading } = useQuery({
    queryKey: ['pantry-search', have, exclude, maxMissing],
    queryFn: () => searchByPantry(have, exclude, 30, 0, maxMissing),
    enabled: have.length > 0,
  });

  const recipes = data?.items ?? [];

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.h1}>Cook from your pantry</Text>

        <PantryChipPicker label="Have" items={have} onAdd={addHave} onRemove={removeHave} />
        <PantryChipPicker label="Exclude" items={exclude} onAdd={addExclude} onRemove={removeExclude} negative />

        {have.length > 0 && (
          <View style={s.modeRow}>
            {(['all', 'exact', 'almost'] as const).map((m) => (
              <Pressable
                key={m}
                onPress={() => setMode(m)}
                style={[s.modeChip, m === mode && s.modeChipActive]}
              >
                <Text style={[s.modeText, m === mode && s.modeTextActive]}>
                  {m === 'all' ? 'All' : m === 'exact' ? 'Exact' : 'Almost'}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {have.length === 0 ? (
          <Text style={s.empty}>Add ingredients above to find recipes you can cook.</Text>
        ) : isLoading ? (
          <Text style={s.loading}>Searching…</Text>
        ) : recipes.length === 0 ? (
          <Text style={s.empty}>
            No recipes found. {mode === 'exact' ? 'Try "Almost" or add more ingredients.' : 'Try different ingredients.'}
          </Text>
        ) : (
          <FlatList
            data={recipes}
            keyExtractor={(r) => r.id}
            renderItem={({ item }) => <PantryResultCard recipe={item} />}
            scrollEnabled={false}
          />
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 20, paddingBottom: 40 },
  h1: { fontFamily: fonts.serifItalic, fontSize: 32, color: colors.ink, marginBottom: 16 },
  modeRow: { flexDirection: 'row', gap: 8, marginVertical: 12 },
  modeChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.rule },
  modeChipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  modeText: { fontFamily: fonts.mono, fontSize: 11, textTransform: 'uppercase', color: colors.ink },
  modeTextActive: { color: colors.bg },
  empty: { fontFamily: fonts.serif, fontSize: 16, color: colors.ink2, paddingVertical: 40, textAlign: 'center' },
  loading: { fontFamily: fonts.mono, fontSize: 12, color: colors.ink2, paddingVertical: 40, textAlign: 'center' },
});
