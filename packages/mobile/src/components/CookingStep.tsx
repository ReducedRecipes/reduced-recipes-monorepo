import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { colors, fonts } from "@/constants/theme";

export interface CookingStepProps {
  stepText: string;
  currentStep: number;
  totalSteps: number;
  stepIngredients?: string[];
  timerSeconds?: number;
  timerRunning?: boolean;
  timerRemaining?: number;
  onTimerToggle?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}

export function CookingStep({
  stepText,
  currentStep,
  totalSteps,
  stepIngredients,
  timerSeconds,
  timerRunning,
  timerRemaining,
  onTimerToggle,
  onPrev,
  onNext,
}: CookingStepProps) {
  const progress = totalSteps > 0 ? currentStep / totalSteps : 0;
  const isFirst = currentStep <= 1;
  const isLast = currentStep >= totalSteps;

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <View style={st.root} accessibilityLiveRegion="polite">
      <View>
        <Text style={st.progressLabel}>
          Step {String(currentStep).padStart(2, "0")} of {String(totalSteps).padStart(2, "0")}
        </Text>
        <View style={st.progressTrack}>
          <View style={[st.progressFill, { width: `${progress * 100}%` }]} />
        </View>
      </View>

      <View style={st.stepBlock}>
        <Text style={st.stepText}>{stepText}</Text>

        {stepIngredients && stepIngredients.length > 0 && (
          <View style={st.ingredientsBox}>
            <Text style={st.ingredientsLabel}>Ingredients for this step</Text>
            {stepIngredients.map((ing, i) => (
              <Text key={i} style={st.ingredientItem}>
                • {ing}
              </Text>
            ))}
          </View>
        )}

        {timerSeconds != null && timerSeconds > 0 && (
          <Pressable
            onPress={onTimerToggle}
            accessibilityRole="button"
            accessibilityLabel={
              timerRunning
                ? `Timer running: ${formatTime(timerRemaining ?? timerSeconds)}. Tap to pause.`
                : `Timer: ${formatTime(timerRemaining ?? timerSeconds)}. Tap to start.`
            }
            style={st.timerButton}
          >
            <Text style={st.timerValue}>{formatTime(timerRemaining ?? timerSeconds)}</Text>
            <Text style={st.timerHint}>{timerRunning ? "Tap to pause" : "Tap to start"}</Text>
          </Pressable>
        )}
      </View>

      <View style={st.navRow}>
        <Pressable
          onPress={onPrev}
          disabled={isFirst}
          accessibilityRole="button"
          accessibilityLabel="Previous step"
          style={[st.navButton, st.navButtonPrev, isFirst && st.navButtonDisabled]}
        >
          <Text style={st.navButtonPrevText}>← PREV</Text>
        </Pressable>
        <Pressable
          onPress={onNext}
          disabled={isLast}
          accessibilityRole="button"
          accessibilityLabel={isLast ? "Last step" : "Next step"}
          style={[st.navButton, isLast ? st.navButtonDone : st.navButtonNext]}
        >
          <Text style={st.navButtonNextText}>{isLast ? "DONE ✓" : "NEXT →"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 24,
    paddingVertical: 32,
    justifyContent: "space-between",
  },
  progressLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.5,
    color: colors.inkMuted,
    textAlign: "center",
    marginBottom: 8,
    textTransform: "uppercase",
  },
  progressTrack: {
    height: 2,
    backgroundColor: colors.rule,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.accent,
  },
  stepBlock: {
    flex: 1,
    justifyContent: "center",
    paddingVertical: 32,
  },
  stepText: {
    fontFamily: fonts.serif,
    fontSize: 24,
    lineHeight: 36,
    color: colors.ink,
    textAlign: "center",
  },
  ingredientsBox: {
    marginTop: 24,
    borderWidth: 1,
    borderColor: colors.rule,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  ingredientsLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.5,
    color: colors.inkMuted,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  ingredientItem: {
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.ink,
    paddingVertical: 2,
  },
  timerButton: {
    marginTop: 24,
    alignSelf: "center",
    borderWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  timerValue: {
    fontFamily: fonts.mono,
    fontSize: 30,
    color: colors.accent,
    textAlign: "center",
  },
  timerHint: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.accent,
    textAlign: "center",
    marginTop: 4,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  navRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  navButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  navButtonPrev: {
    borderWidth: 1,
    borderColor: colors.rule,
  },
  navButtonDisabled: {
    opacity: 0.3,
  },
  navButtonPrevText: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: colors.ink,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  navButtonNext: {
    backgroundColor: colors.accent,
  },
  navButtonDone: {
    backgroundColor: colors.success,
  },
  navButtonNextText: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: "#FFFFFF",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
});
