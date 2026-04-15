import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

function ShimmerBlock({ style }: { style?: object }) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[{ backgroundColor: '#E5E5E3', borderRadius: 6 }, style, animatedStyle]}
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
      {/* Image placeholder */}
      <ShimmerBlock style={{ width: '100%', aspectRatio: 16 / 10 }} />

      <View className="p-3">
        {/* Title line 1 */}
        <ShimmerBlock style={{ width: '85%', height: 16, marginBottom: 6 }} />
        {/* Title line 2 */}
        <ShimmerBlock style={{ width: '55%', height: 16 }} />

        <View className="flex-row items-center gap-2 mt-2">
          {/* Domain badge placeholder */}
          <ShimmerBlock style={{ width: 80, height: 20, borderRadius: 10 }} />
          {/* Time chip placeholder */}
          <ShimmerBlock style={{ width: 50, height: 16 }} />
        </View>
      </View>
    </View>
  );
}
