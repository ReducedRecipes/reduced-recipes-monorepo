import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, fonts } from '@/constants/theme';

export interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <View style={s.container}>
      <Text style={s.message}>{message}</Text>
      <Pressable onPress={onRetry} style={s.button} accessibilityRole="button" accessibilityLabel="Retry">
        <Text style={s.buttonText}>Retry</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
    backgroundColor: colors.bg,
  },
  message: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.error,
    textAlign: 'center',
    marginBottom: 16,
  },
  button: {
    backgroundColor: colors.ink,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  buttonText: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: '#FFFFFF',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
