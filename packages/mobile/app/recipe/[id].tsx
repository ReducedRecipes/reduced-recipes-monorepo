import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
  StyleSheet,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useRecipe } from "@/hooks/useRecipe";
import { useSavedRecipes } from "@/hooks/useSavedRecipes";
import { IngredientList } from "@/components/IngredientList";
import { InstructionList } from "@/components/InstructionList";
import { ErrorState } from "@/components/ErrorState";
import { BookmarkIcon } from "@/components/icons";
import { colors, fonts, shadow } from "@/constants/theme";

type Tab = "ingredients" | "instructions";

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: recipe, isLoading, error, refetch } = useRecipe(id ?? "");
  const { isSaved, save, unsave } = useSavedRecipes();
  const [activeTab, setActiveTab] = useState<Tab>("ingredients");

  const scrollY = useRef(new Animated.Value(0)).current;

  const headerBgOpacity = scrollY.interpolate({
    inputRange: [0, 120],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const saved = useMemo(() => {
    if (!recipe) return false;
    return isSaved(recipe.id);
  }, [recipe, isSaved]);

  const handleBookmarkPress = useCallback(async () => {
    if (!recipe) return;
    if (saved) await unsave(recipe.id);
    else await save(recipe);
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
        <View style={s.loadingContainer}>
          <Text style={s.loadingText}>Loading recipe...</Text>
        </View>
      </>
    );
  }

  if (error || !recipe) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={s.errorContainer}>
          <View style={s.errorBackRow}>
            <Pressable onPress={() => router.back()} style={s.floatingBtn} accessibilityLabel="Go back">
              <Text style={s.floatingBtnText}>←</Text>
            </Pressable>
          </View>
          <ErrorState message={error?.message ?? "Recipe not found"} onRetry={() => refetch()} />
        </View>
      </>
    );
  }

  const cookTime = recipe.cook_time ?? recipe.total_time;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Animated header overlay */}
      <Animated.View style={[s.headerOverlay, { opacity: headerBgOpacity }]} pointerEvents="box-none">
        <Text style={s.headerTitle} numberOfLines={1}>{recipe.title}</Text>
      </Animated.View>

      {/* Floating action buttons */}
      <View style={s.floatingRow}>
        <Pressable onPress={() => router.back()} style={s.floatingBtn} accessibilityLabel="Go back">
          <Text style={s.floatingBtnText}>←</Text>
        </Pressable>
        <View style={s.floatingRight}>
          <Pressable onPress={handleBookmarkPress} style={s.floatingBtn} accessibilityLabel={saved ? "Remove bookmark" : "Bookmark recipe"}>
            <BookmarkIcon color={saved ? colors.orange : "#FFFFFF"} size={22} />
          </Pressable>
          <Pressable onPress={handleShare} style={s.floatingBtn} accessibilityLabel="Share recipe">
            <Text style={s.floatingBtnText}>↗</Text>
          </Pressable>
        </View>
      </View>

      <Animated.ScrollView
        style={s.scroll}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
      >
        {/* Hero image */}
        <View style={s.heroWrap}>
          {recipe.image_url ? (
            <Image source={{ uri: recipe.image_url }} style={s.heroImage} contentFit="cover" />
          ) : (
            <View style={[s.heroImage, s.heroPlaceholder]}>
              <Text style={{ fontSize: 48 }}>🍳</Text>
            </View>
          )}
        </View>

        {/* Recipe info */}
        <View style={s.infoSection}>
          <Text style={s.title} accessibilityRole="header">{recipe.title}</Text>

          <View style={s.authorRow}>
            {recipe.author && <Text style={s.authorText}>By {recipe.author}</Text>}
            {recipe.author && recipe.domain && <Text style={s.dot}> · </Text>}
            {recipe.domain && <Text style={s.domainText}>{recipe.domain}</Text>}
          </View>

          {/* Metadata chips */}
          <View style={s.chipRow}>
            {cookTime != null && (
              <View style={s.chip}>
                <Text style={s.chipText}>⏱ {cookTime < 60 ? `${cookTime} min` : `${Math.floor(cookTime / 60)}h ${cookTime % 60}m`}</Text>
              </View>
            )}
            {recipe.yields && (
              <View style={s.chip}>
                <Text style={s.chipText}>{recipe.yields}</Text>
              </View>
            )}
            {recipe.cuisine && (
              <View style={[s.chip, { backgroundColor: colors.orangeLight }]}>
                <Text style={[s.chipText, { color: colors.orange }]}>{recipe.cuisine}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Segmented control */}
        <View style={s.segmentWrap}>
          <Pressable
            onPress={() => setActiveTab("ingredients")}
            style={[s.segmentBtn, activeTab === "ingredients" && s.segmentActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === "ingredients" }}
          >
            <Text style={[s.segmentText, activeTab === "ingredients" && s.segmentTextActive]}>
              Ingredients ({recipe.ingredients.length})
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab("instructions")}
            style={[s.segmentBtn, activeTab === "instructions" && s.segmentActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === "instructions" }}
          >
            <Text style={[s.segmentText, activeTab === "instructions" && s.segmentTextActive]}>
              Steps ({recipe.instructions.length})
            </Text>
          </Pressable>
        </View>

        {/* Tab content */}
        <View style={s.tabContent}>
          {activeTab === "ingredients" ? (
            <IngredientList ingredients={recipe.ingredients} />
          ) : (
            <InstructionList instructions={recipe.instructions} />
          )}
        </View>

        {/* Actions */}
        <View style={s.actions}>
          <Pressable onPress={handleStartCooking} style={s.primaryBtn} accessibilityLabel="Start cooking">
            <Text style={s.primaryBtnText}>Start Cooking</Text>
          </Pressable>

          <Pressable onPress={handleViewOriginal} style={s.secondaryBtn} accessibilityLabel="View full recipe on original site">
            <Text style={s.secondaryBtnText}>View Original Recipe ↗</Text>
          </Pressable>
        </View>

        {/* Tags */}
        {recipe.tags.length > 0 && (
          <View style={s.tagsSection}>
            <Text style={s.tagsLabel}>Tags</Text>
            <View style={s.tagsRow}>
              {recipe.tags.map((tag) => (
                <View key={tag} style={s.tag}>
                  <Text style={s.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </Animated.ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  loadingContainer: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  loadingText: { fontFamily: fonts.body, fontSize: 15, color: colors.inkMuted },
  errorContainer: { flex: 1, backgroundColor: colors.bg },
  errorBackRow: { paddingTop: 56, paddingHorizontal: 16 },

  headerOverlay: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
    paddingTop: 56, paddingBottom: 12, paddingHorizontal: 60,
    backgroundColor: colors.bg,
  },
  headerTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.ink, textAlign: "center" },

  floatingRow: {
    position: "absolute", top: 56, left: 16, right: 16, zIndex: 20,
    flexDirection: "row", justifyContent: "space-between",
  },
  floatingRight: { flexDirection: "row", gap: 8 },
  floatingBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center", justifyContent: "center",
  },
  floatingBtnText: { color: "#FFFFFF", fontSize: 20, fontWeight: "600" },

  heroWrap: { width: "100%", aspectRatio: 16 / 9 },
  heroImage: { width: "100%", height: "100%" },
  heroPlaceholder: { backgroundColor: colors.bgMuted, alignItems: "center", justifyContent: "center" },

  infoSection: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 12 },
  title: { fontFamily: fonts.display, fontSize: 26, color: colors.ink, lineHeight: 32 },
  authorRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  authorText: { fontFamily: fonts.body, fontSize: 14, color: colors.inkMuted },
  dot: { color: colors.inkFaint, fontSize: 14 },
  domainText: { fontFamily: fonts.body, fontSize: 14, color: colors.orange },

  chipRow: { flexDirection: "row", alignItems: "center", marginTop: 12, gap: 8, flexWrap: "wrap" },
  chip: {
    backgroundColor: colors.bgMuted, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99,
  },
  chipText: { fontFamily: fonts.body, fontSize: 13, color: colors.inkMuted },

  segmentWrap: {
    flexDirection: "row", marginHorizontal: 16, marginTop: 8, marginBottom: 16,
    backgroundColor: colors.bgMuted, borderRadius: 10, padding: 3,
  },
  segmentBtn: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 8 },
  segmentActive: { backgroundColor: "#FFFFFF", ...shadow.sm },
  segmentText: { fontFamily: fonts.bodyMed, fontSize: 14, color: colors.inkMuted },
  segmentTextActive: { color: colors.ink },

  tabContent: { paddingHorizontal: 16 },

  actions: { paddingHorizontal: 16, marginTop: 24, gap: 10 },
  primaryBtn: {
    backgroundColor: colors.orange, paddingVertical: 16, borderRadius: 16, alignItems: "center",
  },
  primaryBtnText: { fontFamily: fonts.bodyMed, fontSize: 16, color: "#FFFFFF" },
  secondaryBtn: {
    paddingVertical: 14, borderRadius: 16, alignItems: "center",
    borderWidth: 1, borderColor: colors.bgMuted,
  },
  secondaryBtnText: { fontFamily: fonts.bodyMed, fontSize: 14, color: colors.inkMuted },

  tagsSection: { paddingHorizontal: 16, marginTop: 24 },
  tagsLabel: { fontFamily: fonts.bodyMed, fontSize: 14, color: colors.inkMuted, marginBottom: 8 },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { backgroundColor: colors.orangeLight, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99 },
  tagText: { fontFamily: fonts.body, fontSize: 13, color: colors.orange },
});
