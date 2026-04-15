import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  Alert,
  ActivityIndicator,
  BackHandler,
} from "react-native";
import { Stack, useLocalSearchParams, router } from "expo-router";
import { useRecipe } from "@/hooks/useRecipe";
import { useCookingSession } from "@/hooks/useCookingSession";
import { useVoiceGuidance } from "@/hooks/useVoiceGuidance";
import { CookingStep } from "@/components/CookingStep";
import { ErrorState } from "@/components/ErrorState";
import { useEffect } from "react";

/** Extract a duration in seconds from step text (e.g. "cook for 5 minutes"). */
function parseTimerSeconds(text: string): number | undefined {
  const match = text.match(/(\d+)\s*(?:-\s*\d+\s*)?minute/i);
  if (match?.[1]) return parseInt(match[1], 10) * 60;
  const secMatch = text.match(/(\d+)\s*(?:-\s*\d+\s*)?second/i);
  if (secMatch?.[1]) return parseInt(secMatch[1], 10);
  return undefined;
}

/** Find ingredients that keyword-match the current instruction text. */
function matchIngredients(
  stepText: string,
  ingredients: string[],
): string[] {
  const lower = stepText.toLowerCase();
  return ingredients.filter((ing) => {
    // Extract the main ingredient word (skip quantities/units)
    const words = ing
      .toLowerCase()
      .replace(/[\d/.,]+/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 3);
    return words.some((w) => lower.includes(w));
  });
}

export default function CookingModeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: recipe, isLoading, error, refetch } = useRecipe(id ?? "");
  const [longPressActive, setLongPressActive] = useState(false);

  const instructions = useMemo(
    () => recipe?.instructions ?? [],
    [recipe?.instructions],
  );

  const session = useCookingSession(id ?? "", instructions);
  const { speakStep, stopSpeaking } = useVoiceGuidance();

  const confirmExit = useCallback(() => {
    Alert.alert(
      "Exit Cooking Mode?",
      "Your progress will be lost.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Exit",
          style: "destructive",
          onPress: () => {
            stopSpeaking();
            router.back();
          },
        },
      ],
    );
  }, [stopSpeaking]);

  // Android back button handler
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      confirmExit();
      return true;
    });
    return () => sub.remove();
  }, [confirmExit]);

  const handleLongPress = useCallback(() => {
    const text = instructions[session.currentStep - 1];
    if (text) {
      setLongPressActive(true);
      speakStep(text).finally(() => setLongPressActive(false));
    }
  }, [instructions, session.currentStep, speakStep]);

  const handleTimerToggle = useCallback(() => {
    if (session.timerRunning) {
      session.pauseTimer();
    } else {
      const stepText = instructions[session.currentStep - 1] ?? "";
      const seconds = parseTimerSeconds(stepText);
      if (seconds) {
        session.startTimer(seconds);
      }
    }
  }, [session, instructions]);

  const handleNext = useCallback(() => {
    stopSpeaking();
    if (session.currentStep >= session.totalSteps) {
      router.back();
    } else {
      session.nextStep();
    }
  }, [session, stopSpeaking]);

  const handlePrev = useCallback(() => {
    stopSpeaking();
    session.prevStep();
  }, [session, stopSpeaking]);

  if (isLoading) {
    return (
      <>
        <Stack.Screen
          options={{ headerShown: false, presentation: "fullScreenModal" }}
        />
        <View className="flex-1 items-center justify-center bg-bg dark:bg-dark-bg">
          <ActivityIndicator size="large" color="#E85D26" />
          <Text className="mt-4 text-base text-inkMuted dark:text-dark-inkMuted">
            Loading recipe…
          </Text>
        </View>
      </>
    );
  }

  if (error || !recipe) {
    return (
      <>
        <Stack.Screen
          options={{ headerShown: false, presentation: "fullScreenModal" }}
        />
        <ErrorState
          message={error?.message ?? "Recipe not found"}
          onRetry={refetch}
        />
      </>
    );
  }

  const currentStepText = instructions[session.currentStep - 1] ?? "";
  const timerSeconds = parseTimerSeconds(currentStepText);
  const stepIngredients = matchIngredients(
    currentStepText,
    recipe.ingredients,
  );

  return (
    <>
      <Stack.Screen
        options={{ headerShown: false, presentation: "fullScreenModal" }}
      />

      <View className="flex-1 bg-bg dark:bg-dark-bg">
        {/* Top bar: Exit button */}
        <View className="flex-row items-center justify-between px-4 pt-14 pb-2">
          <Pressable
            onPress={confirmExit}
            accessibilityRole="button"
            accessibilityLabel="Exit cooking mode"
            className="h-11 w-11 items-center justify-center rounded-full bg-bgMuted dark:bg-dark-bgMuted"
          >
            <Text className="text-lg text-ink dark:text-dark-ink">✕</Text>
          </Pressable>
          {longPressActive && (
            <Text className="text-sm text-orange">Speaking…</Text>
          )}
        </View>

        {/* Cooking step with voice guidance on long press */}
        <Pressable
          onLongPress={handleLongPress}
          delayLongPress={400}
          className="flex-1"
          accessibilityHint="Long press to hear this step read aloud"
        >
          <CookingStep
            stepText={currentStepText}
            currentStep={session.currentStep}
            totalSteps={session.totalSteps}
            stepIngredients={
              stepIngredients.length > 0 ? stepIngredients : undefined
            }
            timerSeconds={timerSeconds}
            timerRunning={session.timerRunning}
            timerRemaining={session.timerRemaining}
            onTimerToggle={handleTimerToggle}
            onPrev={handlePrev}
            onNext={handleNext}
          />
        </Pressable>
      </View>
    </>
  );
}
