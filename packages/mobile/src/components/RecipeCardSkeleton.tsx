import React from 'react';
import { View } from 'react-native';

function ShimmerBlock({ style }: { style?: object }) {
  return (
    <View
      style={[{ backgroundColor: '#E5E5E3', borderRadius: 6, opacity: 0.6 }, style]}
    />
  );
}

export function RecipeCardSkeleton() {
  return (
    <View
      className="bg-white rounded-2xl overflow-hidden shadow-sm"
      accessible
      accessibilityLabel="Loading recipe"
    >
      <ShimmerBlock style={{ width: '100%', aspectRatio: 16 / 10 }} />
      <View className="p-3">
        <ShimmerBlock style={{ width: '85%', height: 16, marginBottom: 6 }} />
        <ShimmerBlock style={{ width: '55%', height: 16 }} />
        <View className="flex-row items-center gap-2 mt-2">
          <ShimmerBlock style={{ width: 80, height: 20, borderRadius: 10 }} />
          <ShimmerBlock style={{ width: 50, height: 16 }} />
        </View>
      </View>
    </View>
  );
}
