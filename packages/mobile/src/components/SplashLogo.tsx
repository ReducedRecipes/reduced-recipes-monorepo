import React, { useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, G, Mask, Path, Rect } from 'react-native-svg';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '@/constants/theme';
import {
  LOGO_FILL,
  LOGO_PATH_BODY,
  LOGO_PATH_CORNER,
  LOGO_PATH_DOT1,
  LOGO_PATH_DOT2,
  LOGO_PATH_LEAF,
  LOGO_VIEWBOX,
} from '@/constants/logo-paths';

const AnimatedPath = Animated.createAnimatedComponent(Path);

const PATH_LENGTH = 1000;
const STROKE_BODY = 90;
const STROKE_LEAF = 60;
const STROKE_DETAIL = 90;

const TIMING_BODY_MS = 1200;
const TIMING_LEAF_DELAY_MS = 1100;
const TIMING_LEAF_MS = 400;
const TIMING_DETAIL_DELAY_MS = 1300;
const TIMING_DETAIL_MS = 400;

const EASE_BODY = Easing.bezier(0.5, 0, 0.5, 1);
const EASE_DETAIL = Easing.bezier(0.4, 0, 0.2, 1);

interface SplashLogoProps {
  onComplete: () => void;
}

export function SplashLogo({ onComplete }: SplashLogoProps) {
  const { width, height } = useWindowDimensions();
  const size = Math.min(width, height) * 0.55;

  const bodyOffset = useSharedValue(PATH_LENGTH);
  const leafOffset = useSharedValue(PATH_LENGTH);
  const detailOffset = useSharedValue(PATH_LENGTH);

  useEffect(() => {
    bodyOffset.value = withTiming(0, {
      duration: TIMING_BODY_MS,
      easing: EASE_BODY,
    });
    leafOffset.value = withDelay(
      TIMING_LEAF_DELAY_MS,
      withTiming(0, { duration: TIMING_LEAF_MS, easing: EASE_DETAIL }),
    );
    detailOffset.value = withDelay(
      TIMING_DETAIL_DELAY_MS,
      withTiming(0, { duration: TIMING_DETAIL_MS, easing: EASE_DETAIL }, (finished) => {
        if (finished) runOnJS(onComplete)();
      }),
    );
  }, [bodyOffset, leafOffset, detailOffset, onComplete]);

  const bodyProps = useAnimatedProps(() => ({ strokeDashoffset: bodyOffset.value }));
  const leafProps = useAnimatedProps(() => ({ strokeDashoffset: leafOffset.value }));
  const detailProps = useAnimatedProps(() => ({ strokeDashoffset: detailOffset.value }));

  return (
    <View style={styles.container}>
      <Svg width={size} height={size} viewBox={LOGO_VIEWBOX}>
        <Defs>
          <Mask id="reveal" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
            <Rect width="1024" height="1024" fill="black" />
            <AnimatedPath
              d={LOGO_PATH_BODY}
              fill="none"
              stroke="white"
              strokeWidth={STROKE_BODY}
              strokeLinecap="round"
              strokeLinejoin="round"
              {...({ pathLength: PATH_LENGTH } as object)}
              strokeDasharray={`${PATH_LENGTH}`}
              animatedProps={bodyProps}
            />
            <AnimatedPath
              d={LOGO_PATH_LEAF}
              fill="none"
              stroke="white"
              strokeWidth={STROKE_LEAF}
              strokeLinecap="round"
              strokeLinejoin="round"
              {...({ pathLength: PATH_LENGTH } as object)}
              strokeDasharray={`${PATH_LENGTH}`}
              animatedProps={leafProps}
            />
            <AnimatedPath
              d={LOGO_PATH_DOT1}
              fill="none"
              stroke="white"
              strokeWidth={STROKE_DETAIL}
              strokeLinecap="round"
              strokeLinejoin="round"
              {...({ pathLength: PATH_LENGTH } as object)}
              strokeDasharray={`${PATH_LENGTH}`}
              animatedProps={detailProps}
            />
            <AnimatedPath
              d={LOGO_PATH_DOT2}
              fill="none"
              stroke="white"
              strokeWidth={STROKE_DETAIL}
              strokeLinecap="round"
              strokeLinejoin="round"
              {...({ pathLength: PATH_LENGTH } as object)}
              strokeDasharray={`${PATH_LENGTH}`}
              animatedProps={detailProps}
            />
          </Mask>
        </Defs>
        <G mask="url(#reveal)">
          <Path d={LOGO_PATH_CORNER} fill={LOGO_FILL} />
          <Path d={LOGO_PATH_BODY} fill={LOGO_FILL} />
          <Path d={LOGO_PATH_LEAF} fill={LOGO_FILL} />
          <Path d={LOGO_PATH_DOT1} fill={LOGO_FILL} />
          <Path d={LOGO_PATH_DOT2} fill={LOGO_FILL} />
        </G>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
