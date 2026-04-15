import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  Pressable,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { Text } from 'react-native';

export interface SearchBarProps {
  onSearch: (query: string) => void;
  autoFocus?: boolean;
}

export function SearchBar({ onSearch, autoFocus = false }: SearchBarProps) {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);

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
    <View className="flex-row items-center px-4 py-2">
      <View className="flex-1 flex-row items-center rounded-full bg-bgMuted px-4 py-3">
        <Text className="mr-2 text-inkFaint">🔍</Text>
        <TextInput
          ref={inputRef}
          className="flex-1 text-base text-ink"
          placeholder="Search recipes..."
          placeholderTextColor="#9CA3AF"
          value={text}
          onChangeText={setText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoFocus={autoFocus}
          returnKeyType="search"
          accessibilityLabel="Search recipes"
        />
      </View>
      {focused && (
        <Pressable
          onPress={handleCancel}
          className="ml-3"
          style={{ minHeight: 44, minWidth: 44, justifyContent: 'center' }}
          accessibilityRole="button"
          accessibilityLabel="Cancel search"
        >
          <Text className="text-base text-orange">Cancel</Text>
        </Pressable>
      )}
    </View>
  );
}
