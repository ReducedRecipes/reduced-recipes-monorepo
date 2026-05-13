import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  Pressable,
  Share,
  Text,
  View,
  StyleSheet,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useRecipe } from "@/hooks/useRecipe";
import { IngredientList } from "@/components/IngredientList";
import { InstructionList } from "@/components/InstructionList";
import { ErrorState } from "@/components/ErrorState";
import { HeartIcon } from "@/components/icons";
import { useHeart } from "@/hooks/useHeart";
import { useSimilarRecipes } from "@/hooks/useSimilarRecipes";
import { RecipeCard } from "@/components/RecipeCard";
import { NutritionPanel } from "@/components/NutritionPanel";
import {
  AddToShoppingListSheet,
  type AddToShoppingListSheetRef,
} from "@/components/AddToShoppingListSheet";
import { useAuthStore } from "@/stores/auth.store";
import { colors, fonts } from "@/constants/theme";

type Tab = "ingredients" | "instructions";

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: recipe, isLoading, error, refetch } = useRecipe(id ?? "");
  const [activeTab, setActiveTab] = useState<Tab>("ingredients");
  const heart = useHeart(id ?? "", recipe?.vote_count);
  const { data: similarRecipes } = useSimilarRecipes(id ?? "");
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const shoppingSheetRef = useRef<AddToShoppingListSheetRef>(null);
  const [addedTo, setAddedTo] = useState<{ listId: string; listName: string } | null>(null);

  useEffect(() => {
    if (!addedTo) return;
    const timer = setTimeout(() => setAddedTo(null), 4000);
    return () => clearTimeout(timer);
  }, [addedTo]);

  const handleAddedToList = useCallback((listId: string, listName: string) => {
    // The sheet already switched the active list and fetched its items via the
    // shopping store, so View → just needs to navigate.
    setAddedTo({ listId, listName });
  }, []);

  const scrollY = useRef(new Animated.Value(0)).current;

  const headerBgOpacity = scrollY.interpolate({
    inputRange: [0, 120],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const handleShare = useCallback(async () => {
    if (!recipe) return;
    await Share.share({
      message: `Check out this recipe: https://reduced.recipes/recipe/${recipe.id}`,
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
          <Pressable onPress={heart.toggle} style={s.floatingBtn} accessibilityLabel={heart.hearted ? "Unlike recipe" : "Like recipe"}>
            <HeartIcon color={heart.hearted ? colors.accent : "#FFFFFF"} size={20} filled={heart.hearted} />
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
            {heart.count > 0 && (
              <View style={[s.chip, { borderColor: colors.accent }]}>
                <Text style={[s.chipText, { color: colors.accent }]}>♥ {heart.count}</Text>
              </View>
            )}
            {cookTime != null && (
              <View style={s.chip}>
                <Text style={s.chipText}>{cookTime < 60 ? `${cookTime} min` : `${Math.floor(cookTime / 60)}h ${cookTime % 60}m`}</Text>
              </View>
            )}
            {recipe.yields && (
              <View style={s.chip}>
                <Text style={s.chipText}>{recipe.yields}</Text>
              </View>
            )}
            {recipe.cuisine && (
              <View style={[s.chip, { borderColor: colors.accent }]}>
                <Text style={[s.chipText, { color: colors.accent }]}>{recipe.cuisine}</Text>
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
              INGREDIENTS ({recipe.ingredients.length})
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab("instructions")}
            style={[s.segmentBtn, activeTab === "instructions" && s.segmentActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === "instructions" }}
          >
            <Text style={[s.segmentText, activeTab === "instructions" && s.segmentTextActive]}>
              STEPS ({recipe.instructions.length})
            </Text>
          </Pressable>
        </View>

        {/* Tab content */}
        <View style={s.tabContent}>
          {activeTab === "ingredients" ? (
            <>
              <IngredientList ingredients={recipe.ingredients} />
              {isAuthenticated && recipe.ingredients.length > 0 && (
                <View style={s.shoppingPillWrap}>
                  <Pressable
                    onPress={() =>
                      shoppingSheetRef.current?.open({
                        recipeId: recipe.id,
                        recipeTitle: recipe.title,
                        ingredients: recipe.ingredients,
                      })
                    }
                    style={s.shoppingPill}
                    accessibilityRole="button"
                    accessibilityLabel="Add ingredients to shopping list"
                  >
                    <Text style={s.shoppingPillText}>+ ADD TO SHOPPING LIST</Text>
                  </Pressable>
                  {addedTo && (
                    <Pressable
                      onPress={() => {
                        setAddedTo(null);
                        router.push("/(tabs)/list");
                      }}
                      style={s.shoppingConfirm}
                      accessibilityRole="button"
                      accessibilityLabel={`View ${addedTo.listName}`}
                    >
                      <Text style={s.shoppingConfirmText}>
                        Added to {addedTo.listName} · View →
                      </Text>
                    </Pressable>
                  )}
                </View>
              )}
            </>
          ) : (
            <InstructionList instructions={recipe.instructions} />
          )}
        </View>

        {/* Actions */}
        <View style={s.actions}>
          {/* Start Cooking temporarily hidden while the cook flow's iOS crash is being diagnosed. Re-enable by restoring this Pressable with onPress={handleStartCooking}. */}
          <Pressable onPress={handleViewOriginal} style={s.primaryBtn} accessibilityLabel="View full recipe on original site">
            <Text style={s.primaryBtnText}>OPEN RECIPE → {recipe.domain}</Text>
          </Pressable>
        </View>

        {/* Tags */}
        {recipe.tags.length > 0 && (
          <View style={s.tagsSection}>
            <Text style={s.tagsLabel}>TAGS</Text>
            <View style={s.tagsRow}>
              {recipe.tags.map((tag) => (
                <View key={tag} style={s.tag}>
                  <Text style={s.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Nutrition panel */}
        {recipe.nutrition && <NutritionPanel nutrition={recipe.nutrition} />}

        {/* Similar recipes shelf */}
        {similarRecipes && similarRecipes.length > 0 && (
          <View style={s.similarSection}>
            <View style={s.similarLabelRow}>
              <Text style={s.similarDiamond}>◆</Text>
              <Text style={s.similarLabel}>MORE LIKE THIS</Text>
              <View style={s.similarRule} />
            </View>
            <FlatList
              data={similarRecipes}
              renderItem={({ item }) => (
                <View style={{ width: 220, marginRight: 12 }}>
                  <RecipeCard recipe={item} />
                </View>
              )}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16 }}
            />
          </View>
        )}

        <View style={{ height: 40 }} />
      </Animated.ScrollView>

      <AddToShoppingListSheet ref={shoppingSheetRef} onAdded={handleAddedToList} />
    </>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  loadingContainer: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  loadingText: { fontFamily: fonts.sans, fontSize: 15, color: colors.inkFaint },
  errorContainer: { flex: 1, backgroundColor: colors.bg },
  errorBackRow: { paddingTop: 56, paddingHorizontal: 16 },

  headerOverlay: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
    paddingTop: 56, paddingBottom: 12, paddingHorizontal: 60,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
  },
  headerTitle: { fontFamily: fonts.serif, fontSize: 16, color: colors.ink, textAlign: "center" },

  floatingRow: {
    position: "absolute", top: 56, left: 16, right: 16, zIndex: 20,
    flexDirection: "row", justifyContent: "space-between",
  },
  floatingRight: { flexDirection: "row", gap: 8 },
  floatingBtn: {
    width: 44, height: 44,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center", justifyContent: "center",
  },
  floatingBtnText: { color: "#FFFFFF", fontSize: 20, fontWeight: "600", lineHeight: 22, textAlign: "center" },

  heroWrap: { width: "100%", aspectRatio: 16 / 9 },
  heroImage: { width: "100%", height: "100%" },
  heroPlaceholder: { backgroundColor: colors.bgMuted, alignItems: "center", justifyContent: "center" },

  infoSection: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 12 },
  title: { fontFamily: fonts.serif, fontSize: 28, color: colors.ink, lineHeight: 34 },
  authorRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  authorText: { fontFamily: fonts.sans, fontSize: 14, color: colors.inkFaint },
  dot: { color: colors.inkFaint, fontSize: 14 },
  domainText: { fontFamily: fonts.mono, fontSize: 12, color: colors.accent, letterSpacing: 0.5 },

  chipRow: { flexDirection: "row", alignItems: "center", marginTop: 12, gap: 8, flexWrap: "wrap" },
  chip: {
    borderWidth: 1, borderColor: colors.rule, paddingHorizontal: 10, paddingVertical: 5,
  },
  chipText: { fontFamily: fonts.mono, fontSize: 11, color: colors.inkFaint, letterSpacing: 0.5, textTransform: "uppercase" },

  segmentWrap: {
    flexDirection: "row", marginHorizontal: 16, marginTop: 8, marginBottom: 16,
    borderWidth: 1, borderColor: colors.rule,
  },
  segmentBtn: { flex: 1, paddingVertical: 12, alignItems: "center" },
  segmentActive: { backgroundColor: colors.ink },
  segmentText: { fontFamily: fonts.mono, fontSize: 11, color: colors.inkFaint, letterSpacing: 1, textTransform: "uppercase" },
  segmentTextActive: { color: "#FFFFFF" },

  tabContent: { paddingHorizontal: 16 },

  shoppingPillWrap: { marginTop: 20, alignItems: "flex-start" },
  shoppingPill: {
    borderWidth: 1,
    borderColor: colors.rule,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  shoppingPillText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.accent,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  shoppingConfirm: { marginTop: 8 },
  shoppingConfirmText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.accent,
    letterSpacing: 0.5,
  },

  actions: { paddingHorizontal: 16, marginTop: 24, gap: 10 },
  primaryBtn: {
    backgroundColor: colors.accent, paddingVertical: 16, alignItems: "center",
  },
  primaryBtnText: { fontFamily: fonts.mono, fontSize: 13, color: "#FFFFFF", letterSpacing: 1.5, textTransform: "uppercase" },
  secondaryBtn: {
    paddingVertical: 14, alignItems: "center",
    borderWidth: 1, borderColor: colors.rule,
  },
  secondaryBtnText: { fontFamily: fonts.mono, fontSize: 12, color: colors.inkFaint, letterSpacing: 1, textTransform: "uppercase" },

  tagsSection: { paddingHorizontal: 16, marginTop: 24 },
  tagsLabel: { fontFamily: fonts.mono, fontSize: 11, color: colors.inkFaint, marginBottom: 8, letterSpacing: 1.5, textTransform: "uppercase" },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { borderWidth: 1, borderColor: colors.rule, paddingHorizontal: 12, paddingVertical: 6 },
  tagText: { fontFamily: fonts.mono, fontSize: 11, color: colors.ink2, letterSpacing: 0.5 },

  similarSection: { marginTop: 32 },
  similarLabelRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, marginBottom: 16, gap: 8 },
  similarDiamond: { fontFamily: fonts.mono, fontSize: 10, color: colors.accent },
  similarLabel: { fontFamily: fonts.mono, fontSize: 11, color: colors.inkFaint, letterSpacing: 1.5 },
  similarRule: { flex: 1, height: 1, backgroundColor: colors.rule },
});
