import React from "react";
import { View, Text, Pressable } from "react-native";

export interface CookingStepProps {
  /** The instruction text for this step. */
  stepText: string;
  /** 1-based current step number. */
  currentStep: number;
  /** Total number of steps. */
  totalSteps: number;
  /** Ingredients relevant to this step (optional). */
  stepIngredients?: string[];
  /** Timer duration in seconds for this step (optional). */
  timerSeconds?: number;
  /** Whether the timer is currently running. */
  timerRunning?: boolean;
  /** Remaining seconds on the timer. */
  timerRemaining?: number;
  /** Called when timer start/pause is pressed. */
  onTimerToggle?: () => void;
  /** Navigate to previous step. */
  onPrev?: () => void;
  /** Navigate to next step. */
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
    <View
      className="flex-1 bg-bg dark:bg-dark-bg px-6 py-8 justify-between"
      accessibilityLiveRegion="polite"
    >
      {/* Progress indicator */}
      <View>
        <Text className="text-sm text-inkMuted dark:text-dark-inkMuted text-center mb-2">
          Step {currentStep} of {totalSteps}
        </Text>
        <View className="h-1.5 bg-bgMuted dark:bg-dark-bgMuted rounded-full overflow-hidden">
          <View
            className="h-full bg-orange rounded-full"
            style={{ width: `${progress * 100}%` }}
          />
        </View>
      </View>

      {/* Step text — large for readability */}
      <View className="flex-1 justify-center py-8">
        <Text className="text-2xl leading-9 text-ink dark:text-dark-ink text-center font-medium">
          {stepText}
        </Text>

        {/* Step-relevant ingredients */}
        {stepIngredients && stepIngredients.length > 0 && (
          <View className="mt-6 bg-bgMuted dark:bg-dark-bgMuted rounded-lg px-4 py-3">
            <Text className="text-sm font-medium text-inkMuted dark:text-dark-inkMuted mb-1">
              Ingredients for this step
            </Text>
            {stepIngredients.map((ing, i) => (
              <Text
                key={i}
                className="text-base text-ink dark:text-dark-ink py-0.5"
              >
                • {ing}
              </Text>
            ))}
          </View>
        )}

        {/* Optional timer */}
        {timerSeconds != null && timerSeconds > 0 && (
          <Pressable
            onPress={onTimerToggle}
            accessibilityRole="button"
            accessibilityLabel={
              timerRunning
                ? `Timer running: ${formatTime(timerRemaining ?? timerSeconds)}. Tap to pause.`
                : `Timer: ${formatTime(timerRemaining ?? timerSeconds)}. Tap to start.`
            }
            className="mt-6 self-center bg-orangeLight dark:bg-dark-orangeLight rounded-xl px-6 py-3"
          >
            <Text className="text-3xl font-bold text-orange dark:text-dark-orange text-center">
              {formatTime(timerRemaining ?? timerSeconds)}
            </Text>
            <Text className="text-sm text-orange dark:text-dark-orange text-center mt-1">
              {timerRunning ? "Tap to pause" : "Tap to start"}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Prev / Next navigation */}
      <View className="flex-row justify-between">
        <Pressable
          onPress={onPrev}
          disabled={isFirst}
          accessibilityRole="button"
          accessibilityLabel="Previous step"
          className={`px-6 py-3 rounded-lg ${
            isFirst ? "opacity-30" : "bg-bgMuted dark:bg-dark-bgMuted"
          }`}
        >
          <Text className="text-base font-medium text-ink dark:text-dark-ink">
            ← Prev
          </Text>
        </Pressable>
        <Pressable
          onPress={onNext}
          disabled={isLast}
          accessibilityRole="button"
          accessibilityLabel={isLast ? "Last step" : "Next step"}
          className={`px-6 py-3 rounded-lg ${
            isLast ? "bg-success" : "bg-orange"
          }`}
        >
          <Text className="text-base font-medium text-white">
            {isLast ? "Done ✓" : "Next →"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
