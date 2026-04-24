import React from "react";
import { View, Text, Pressable } from "react-native";

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
    <View
      className="flex-1 bg-bg dark:bg-dark-bg px-6 py-8 justify-between"
      accessibilityLiveRegion="polite"
    >
      {/* Progress indicator */}
      <View>
        <Text className="font-mono text-xs tracking-widest text-ink-muted dark:text-dark-ink-muted text-center mb-2 uppercase">
          Step {String(currentStep).padStart(2, '0')} of {String(totalSteps).padStart(2, '0')}
        </Text>
        <View className="h-0.5 bg-rule dark:bg-dark-rule overflow-hidden">
          <View
            className="h-full bg-accent"
            style={{ width: `${progress * 100}%` }}
          />
        </View>
      </View>

      {/* Step text */}
      <View className="flex-1 justify-center py-8">
        <Text className="font-serif text-2xl leading-9 text-ink dark:text-dark-ink text-center">
          {stepText}
        </Text>

        {stepIngredients && stepIngredients.length > 0 && (
          <View className="mt-6 border border-rule dark:border-dark-rule px-4 py-3">
            <Text className="font-mono text-xs tracking-widest text-ink-muted dark:text-dark-ink-muted mb-1 uppercase">
              Ingredients for this step
            </Text>
            {stepIngredients.map((ing, i) => (
              <Text
                key={i}
                className="font-sans text-base text-ink dark:text-dark-ink py-0.5"
              >
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
            className="mt-6 self-center border border-accent px-6 py-3"
          >
            <Text className="font-mono text-3xl text-accent dark:text-dark-accent text-center">
              {formatTime(timerRemaining ?? timerSeconds)}
            </Text>
            <Text className="font-mono text-xs text-accent dark:text-dark-accent text-center mt-1 uppercase tracking-widest">
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
          className={`px-6 py-3 border border-rule ${
            isFirst ? "opacity-30" : ""
          }`}
        >
          <Text className="font-mono text-sm text-ink dark:text-dark-ink uppercase tracking-wider">
            ← PREV
          </Text>
        </Pressable>
        <Pressable
          onPress={onNext}
          disabled={isLast}
          accessibilityRole="button"
          accessibilityLabel={isLast ? "Last step" : "Next step"}
          className={`px-6 py-3 ${
            isLast ? "bg-success" : "bg-accent"
          }`}
        >
          <Text className="font-mono text-sm text-white uppercase tracking-wider">
            {isLast ? "DONE ✓" : "NEXT →"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
