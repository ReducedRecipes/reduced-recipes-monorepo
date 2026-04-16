import * as Haptics from "expo-haptics";

type HapticStyle = "light" | "medium" | "heavy";

const styleMap: Record<HapticStyle, Haptics.ImpactFeedbackStyle> = {
  light: Haptics.ImpactFeedbackStyle.Light,
  medium: Haptics.ImpactFeedbackStyle.Medium,
  heavy: Haptics.ImpactFeedbackStyle.Heavy,
};

export async function triggerHaptic(style: HapticStyle = "medium"): Promise<void> {
  try {
    await Haptics.impactAsync(styleMap[style]);
  } catch {
    // Silently fail on unsupported devices (e.g. Android without haptic hardware)
  }
}
