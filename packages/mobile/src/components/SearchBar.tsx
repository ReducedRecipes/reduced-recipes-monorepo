import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, TextInput, View, Text, StyleSheet } from 'react-native';
import { colors, fonts } from '@/constants/theme';
import { SearchIcon } from './icons';

export interface SearchBarProps {
  onSearch: (query: string) => void;
  autoFocus?: boolean;
}

export function SearchBar({ onSearch, autoFocus = false }: SearchBarProps) {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onSearch(text);
    }, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [text, onSearch]);

  const handleCancel = useCallback(() => {
    setText('');
    Keyboard.dismiss();
    onSearch('');
    setFocused(false);
  }, [onSearch]);

  return (
    <View style={s.wrap}>
      <View style={s.inputWrap}>
        <SearchIcon color={colors.inkFaint} size={18} />
        <TextInput
          style={s.input}
          placeholder="Search recipes..."
          placeholderTextColor={colors.inkFaint}
          value={text}
          onChangeText={setText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoFocus={autoFocus}
          returnKeyType="search"
          accessibilityLabel="Search recipes"
        />
        {text.length > 0 && (
          <Pressable onPress={() => setText('')} hitSlop={8}>
            <Text style={s.clearBtn}>✕</Text>
          </Pressable>
        )}
      </View>
      {focused && (
        <Pressable onPress={handleCancel} style={s.cancelBtn} accessibilityRole="button" accessibilityLabel="Cancel search">
          <Text style={s.cancelText}>Cancel</Text>
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  inputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.bgMuted, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  input: {
    flex: 1, fontFamily: fonts.body, fontSize: 15,
    color: colors.ink, marginLeft: 10, padding: 0,
  },
  clearBtn: { fontSize: 14, color: colors.inkFaint, padding: 4 },
  cancelBtn: { marginLeft: 12, minHeight: 44, justifyContent: 'center' },
  cancelText: { fontFamily: fonts.bodyMed, fontSize: 15, color: colors.orange },
});
