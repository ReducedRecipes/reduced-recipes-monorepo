import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  Alert,
  ActivityIndicator,
  BackHandler,
  StyleSheet,
} from "react-native";
import { Stack, useLocalSearchParams, router } from "expo-router";
import { useRecipe } from "@/hooks/useRecipe";
import { useCookingSession } from "@/hooks/useCookingSession";
import { useVoiceGuidance } from "@/hooks/useVoiceGuidance";
import { CookingStep } from "@/components/CookingStep";
import { ErrorState } from "@/components/ErrorState";
import { colors, fonts } from "@/constants/theme";
import { useEffect } from "react";

/** Extract a duration in seconds from step text (e.g. "cook for 5 minutes"). */
function parseTimerSeconds(text: string): number | undefined {
  const match = text.match(/(\d+)\s*(?:-\s*\d+\s*)?minute/i);
  if (match) return parseInt(match[1]!, 10) * 60;
  const secMatch = text.match(/(\d+)\s*(?:-\s*\d+\s*)?second/i);
  if (secMatch) return parseInt(secMatch[1]!, 10);
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
  const recipeId = (id as string) ?? "";
  const { data: recipe, isLoading, error, refetch } = useRecipe(recipeId);
  const [longPressActive, setLongPressActive] = useState(false);

  const instructions = useMemo(
    () => recipe?.instructions ?? [],
    [recipe?.instructions],
  );

  const session = useCookingSession(recipeId, instructions);
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
        <View style={st.loadingRoot}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={st.loadingText}>Loading recipe…</Text>
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

      <View style={st.root}>
        <View style={st.topBar}>
          <Pressable
            onPress={confirmExit}
            accessibilityRole="button"
            accessibilityLabel="Exit cooking mode"
            style={st.exitButton}
          >
            <Text style={st.exitButtonText}>✕</Text>
          </Pressable>
          {longPressActive && <Text style={st.speakingLabel}>Speaking…</Text>}
        </View>

        <Pressable
          onLongPress={handleLongPress}
          delayLongPress={400}
          style={st.stepWrap}
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

const st = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  loadingRoot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
  },
  loadingText: {
    marginTop: 16,
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.inkMuted,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 8,
  },
  exitButton: {
    height: 44,
    width: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.bgMuted,
  },
  exitButtonText: {
    fontFamily: fonts.sans,
    fontSize: 18,
    color: colors.ink,
  },
  speakingLabel: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.accent,
  },
  stepWrap: {
    flex: 1,
  },
});
