import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { ReactNode } from 'react';
import { colors, fonts } from '@/constants/theme';

export interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  subtitle?: string;
}

export function EmptyState({ icon, title, subtitle }: EmptyStateProps) {
  return (
    <View style={s.container}>
      <View style={s.iconWrap}>{icon}</View>
      <Text style={s.title}>{title}</Text>
      {subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 48 },
  iconWrap: { marginBottom: 16 },
  title: { fontFamily: fonts.display, fontSize: 20, color: colors.ink, textAlign: 'center', marginBottom: 8 },
  subtitle: { fontFamily: fonts.body, fontSize: 15, color: colors.inkMuted, textAlign: 'center' },
});
