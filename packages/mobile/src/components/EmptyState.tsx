import React from 'react';
import { View, Text } from 'react-native';
import type { ReactNode } from 'react';

export interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  subtitle?: string;
}

export function EmptyState({ icon, title, subtitle }: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center px-8 py-12">
      <View className="mb-4">{icon}</View>
      <Text className="text-center font-display text-xl text-ink mb-2">
        {title}
      </Text>
      {subtitle && (
        <Text className="text-center font-body text-base text-ink-muted">
          {subtitle}
        </Text>
      )}
    </View>
  );
}
