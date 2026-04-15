import React from 'react';
import { View, Text, Pressable } from 'react-native';

export interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <View className="flex-1 items-center justify-center px-8 py-12">
      <Text className="text-center font-body text-base text-error mb-4">
        {message}
      </Text>
      <Pressable
        onPress={onRetry}
        className="rounded-lg bg-orange px-6 py-3 active:opacity-80"
        accessibilityRole="button"
        accessibilityLabel="Retry"
      >
        <Text className="font-body-med text-base text-white">Retry</Text>
      </Pressable>
    </View>
  );
}
