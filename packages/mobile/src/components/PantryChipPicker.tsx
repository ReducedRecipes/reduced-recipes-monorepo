import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { colors, fonts } from '@/constants/theme';

interface Props {
  label: string;
  items: string[];
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
  negative?: boolean;
}

export function PantryChipPicker({ label, items, onAdd, onRemove, negative }: Props) {
  const [value, setValue] = useState('');
  const submit = () => {
    const v = value.trim();
    if (!v) return;
    onAdd(v);
    setValue('');
  };
  return (
    <View style={s.box}>
      <Text style={s.label}>{label}</Text>
      <View style={s.chips}>
        {items.map((it) => (
          <Pressable key={it} onPress={() => onRemove(it)} style={[s.chip, negative && s.chipNeg]}>
            <Text style={[s.chipText, negative && s.chipTextNeg]}>{it} ×</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        value={value}
        onChangeText={setValue}
        onSubmitEditing={submit}
        returnKeyType="done"
        placeholder={negative ? 'Add to avoid…' : 'Add ingredient…'}
        placeholderTextColor={colors.ink2}
        style={s.input}
      />
    </View>
  );
}

const s = StyleSheet.create({
  box: { paddingVertical: 12 },
  label: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: colors.accent, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: { backgroundColor: colors.ink, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  chipNeg: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.rule },
  chipText: { color: colors.bg, fontFamily: fonts.mono, fontSize: 12 },
  chipTextNeg: { color: colors.ink },
  input: { borderBottomWidth: 1, borderBottomColor: colors.rule, paddingVertical: 8, fontFamily: fonts.serif, fontSize: 16, color: colors.ink },
});
