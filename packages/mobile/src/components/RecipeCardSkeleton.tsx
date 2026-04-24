import React from 'react';
import { View } from 'react-native';
import { colors } from '@/constants/theme';

function ShimmerBlock({ style }: { style?: object }) {
  return (
    <View
      style={[{ backgroundColor: colors.rule, opacity: 0.6 }, style]}
    />
  );
}

export function RecipeCardSkeleton() {
  return (
    <View
      style={{ backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.rule, overflow: 'hidden' }}
      accessible
      accessibilityLabel="Loading recipe"
    >
      <ShimmerBlock style={{ width: '100%', aspectRatio: 16 / 10 }} />
      <View style={{ padding: 12 }}>
        <ShimmerBlock style={{ width: '85%', height: 16, marginBottom: 6 }} />
        <ShimmerBlock style={{ width: '55%', height: 16 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <ShimmerBlock style={{ width: 80, height: 16 }} />
          <ShimmerBlock style={{ width: 50, height: 16 }} />
        </View>
      </View>
    </View>
  );
}
