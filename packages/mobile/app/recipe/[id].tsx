import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useSQLiteContext } from "expo-sqlite";

import { useRecipe } from "@/hooks/useRecipe";
import { useSavedRecipes } from "@/hooks/useSavedRecipes";
import { TagPill } from "@/components/TagPill";
import { TimeChip } from "@/components/TimeChip";
import { DomainBadge } from "@/components/DomainBadge";
import { IngredientList } from "@/components/IngredientList";
import { InstructionList } from "@/components/InstructionList";
import { ErrorState } from "@/components/ErrorState";
import { BookmarkIcon } from "@/components/icons";
import { colors, fonts } from "@/constants/theme";

type Tab = "ingredients" | "instructions";

const HEADER_HEIGHT = 300;
const HEADER_FADE_DISTANCE = 120;

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const db = useSQLiteContext();
  const { data: recipe, isLoading, error, refetch } = useRecipe(id ?? "");
  const { isSaved, save, unsave } = useSavedRecipes({ db });
  const [activeTab, setActiveTab] = useState<Tab>("ingredients");

  const scrollY = useRef(new Animated.Value(0)).current;

  const headerBgOpacity = scrollY.interpolate({
    inputRange: [0, HEADER_FADE_DISTANCE],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const saved = useMemo(() => {
    if (!recipe) return false;
    return isSaved(recipe.id);
  }, [recipe, isSaved]);

  const handleBookmarkPress = useCallback(async () => {
    if (!recipe) return;
    if (saved) {
      await unsave(recipe.id);
    } else {
      await save(recipe);
    }
  }, [recipe, saved, save, unsave]);

  const handleShare = useCallback(async () => {
    if (!recipe) return;
    await Share.share({
      message: `Check out this recipe: https://reducedrecipes.com/recipe/${recipe.id}`,
    });
  }, [recipe]);

  const handleViewOriginal = useCallback(async () => {
    if (!recipe) return;
    await WebBrowser.openBrowserAsync(recipe.source_url);
  }, [recipe]);

  const handleStartCooking = useCallback(() => {
    if (!recipe) return;
    router.push(`/cook/${recipe.id}`);
  }, [recipe, router]);

  if (isLoading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View className="flex-1 bg-[#FAFAF8] items-center justify-center">
          <View className="w-12 h-12 rounded-full bg-gray-200 animate-pulse" />
          <Text className="mt-4 text-gray-400" style={{ fontFamily: fonts.body }}>
            Loading recipe...
          </Text>
        </View>
      </>
    );
  }

  if (error || !recipe) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View className="flex-1 bg-[#FAFAF8]">
          <View className="pt-14 px-4">
            <Pressable
              onPress={() => router.back()}
              className="w-11 h-11 items-center justify-center"
              accessibilityLabel="Go back"
            >
              <Text className="text-2xl">×</Text>
            </Pressable>
          </View>
          <ErrorState
            message={error?.message ?? "Recipe not found"}
            onRetry={() => refetch()}
          />
        </View>
      </>
    );
  }

  const cookTime = recipe.cook_time ?? recipe.total_time;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Animated header overlay */}
      <Animated.View
        className="absolute top-0 left-0 right-0 z-10 pt-14 pb-3 px-4 flex-row items-center justify-between"
        style={{ opacity: headerBgOpacity, backgroundColor: colors.bg }}
        pointerEvents="box-none"
      >
        <Text
          className="flex-1 text-center"
          style={{ fontFamily: fonts.display, color: colors.ink }}
          numberOfLines={1}
        >
          {recipe.title}
        </Text>
      </Animated.View>

      {/* Floating action buttons */}
      <View className="absolute top-14 left-4 right-4 z-20 flex-row justify-between">
        <Pressable
          onPress={() => router.back()}
          className="w-11 h-11 rounded-full bg-black/40 items-center justify-center"
          accessibilityLabel="Go back"
        >
          <Text className="text-white text-xl font-bold">×</Text>
        </Pressable>
        <View className="flex-row gap-2">
          <Pressable
            onPress={handleBookmarkPress}
            className="w-11 h-11 rounded-full bg-black/40 items-center justify-center"
            accessibilityLabel={saved ? "Remove bookmark" : "Bookmark recipe"}
          >
            <BookmarkIcon
              color={saved ? colors.orange : "#FFFFFF"}
              size={22}
            />
          </Pressable>
          <Pressable
            onPress={handleShare}
            className="w-11 h-11 rounded-full bg-black/40 items-center justify-center"
            accessibilityLabel="Share recipe"
          >
            <Text className="text-white text-lg">↗</Text>
          </Pressable>
        </View>
      </View>

      <Animated.ScrollView
        className="flex-1 bg-[#FAFAF8]"
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
      >
        {/* Hero image */}
        <View style={{ width: "100%", aspectRatio: 16 / 9 }}>
          {recipe.image_url ? (
            <Image
              source={{ uri: recipe.image_url }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
              placeholder={{ blurhash: "L6PZfSi_.AyE_3t7t7R**0o#DgR4" }}
            />
          ) : (
            <View className="w-full h-full bg-gray-200 items-center justify-center">
              <Text className="text-4xl">🍳</Text>
            </View>
          )}
        </View>

        {/* Recipe info */}
        <View className="px-4 pt-5 pb-3">
          <Text
            style={{ fontFamily: fonts.display, fontSize: 28, color: colors.ink }}
            accessibilityRole="header"
          >
            {recipe.title}
          </Text>

          <View className="flex-row items-center mt-2 gap-1">
            {recipe.author && (
              <Text style={{ fontFamily: fonts.body, color: colors.inkMuted, fontSize: 14 }}>
                By {recipe.author}
              </Text>
            )}
            {recipe.author && recipe.domain && (
              <Text style={{ color: colors.inkFaint }}> · </Text>
            )}
            {recipe.domain && <DomainBadge domain={recipe.domain} />}
          </View>

          {/* Metadata row */}
          <View className="flex-row items-center mt-3 gap-3">
            {cookTime != null && <TimeChip minutes={cookTime} />}
            {recipe.yields && (
              <View className="flex-row items-center px-2 py-1 rounded-full bg-[#F3F2EF]">
                <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.inkMuted }}>
                  {recipe.yields}
                </Text>
              </View>
            )}
            {recipe.schema_valid && (
              <View className="flex-row items-center px-2 py-1 rounded-full bg-green-50">
                <Text style={{ fontSize: 13, color: "#16a34a" }}>✓ Valid</Text>
              </View>
            )}
          </View>
        </View>

        {/* Segmented control */}
        <View className="flex-row mx-4 mt-2 mb-4 rounded-lg bg-[#F3F2EF] p-1">
          <Pressable
            onPress={() => setActiveTab("ingredients")}
            className={`flex-1 py-2.5 rounded-md items-center ${
              activeTab === "ingredients" ? "bg-white" : ""
            }`}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === "ingredients" }}
          >
            <Text
              style={{
                fontFamily: fonts.bodyMed,
                fontSize: 14,
                color: activeTab === "ingredients" ? colors.ink : colors.inkMuted,
              }}
            >
              Ingredients
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab("instructions")}
            className={`flex-1 py-2.5 rounded-md items-center ${
              activeTab === "instructions" ? "bg-white" : ""
            }`}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === "instructions" }}
          >
            <Text
              style={{
                fontFamily: fonts.bodyMed,
                fontSize: 14,
                color: activeTab === "instructions" ? colors.ink : colors.inkMuted,
              }}
            >
              Instructions
            </Text>
          </Pressable>
        </View>

        {/* Tab content */}
        <View className="px-4">
          {activeTab === "ingredients" ? (
            <IngredientList ingredients={recipe.ingredients} />
          ) : (
            <InstructionList instructions={recipe.instructions} />
          )}
        </View>

        {/* Actions */}
        <View className="px-4 mt-6 gap-3">
          <Pressable
            onPress={handleStartCooking}
            className="py-4 rounded-2xl items-center"
            style={{ backgroundColor: colors.orange }}
            accessibilityLabel="Start cooking"
          >
            <Text
              style={{ fontFamily: fonts.bodyMed, fontSize: 16, color: "#FFFFFF" }}
            >
              Start Cooking
            </Text>
          </Pressable>

          <Pressable
            onPress={handleViewOriginal}
            className="py-3.5 rounded-2xl items-center border border-gray-200"
            accessibilityLabel="View full recipe on original site"
          >
            <Text
              style={{ fontFamily: fonts.bodyMed, fontSize: 14, color: colors.inkMuted }}
            >
              View Full Recipe ↗
            </Text>
          </Pressable>
        </View>

        {/* Tags */}
        {recipe.tags.length > 0 && (
          <View className="px-4 mt-6 mb-8">
            <Text
              className="mb-2"
              style={{ fontFamily: fonts.bodyMed, fontSize: 14, color: colors.inkMuted }}
            >
              Tags
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {recipe.tags.map((tag) => (
                <TagPill key={tag} tag={tag} />
              ))}
            </View>
          </View>
        )}

        {/* Bottom spacing */}
        <View className="h-8" />
      </Animated.ScrollView>
    </>
  );
}
