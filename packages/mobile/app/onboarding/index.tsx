import React, { useRef, useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  ActivityIndicator,
  useWindowDimensions,
  type ViewToken,
  type ListRenderItemInfo,
} from "react-native";
import { useRouter } from "expo-router";
import { mmkv } from "@/lib/mmkv";
import { usePreferencesStore } from "@/stores/preferences.store";
import { useAuthStore } from "@/stores/auth.store";
import { colors, fonts } from "@/constants/theme";
import { DIETARY_LABELS, type DietaryRestriction } from "@rr/shared/dietary";

const BASE_URL = `${process.env.EXPO_PUBLIC_API_BASE || "https://reducedrecipes.com"}/api/v1`;

const ALL_DIETARY_OPTIONS: { key: DietaryRestriction; label: string }[] = (
  Object.entries(DIETARY_LABELS) as [DietaryRestriction, string][]
).map(([key, label]) => ({ key, label }));

type SlideKey = "welcome" | "dietary" | "notifications";

interface SlideData {
  key: SlideKey;
}

const SLIDES: SlideData[] = [
  { key: "welcome" },
  { key: "dietary" },
  { key: "notifications" },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const flatListRef = useRef<FlatList<SlideData>>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedRestrictions, setSelectedRestrictions] = useState<DietaryRestriction[]>([]);
  const toggleDietary = usePreferencesStore((s) => s.toggleDietary);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  // Live recipe count state
  const [recipeCount, setRecipeCount] = useState<number | null>(null);
  const [recipeCountLoading, setRecipeCountLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auth state for server sync
  const sessionToken = useAuthStore((s) => s.sessionToken);

  // Fetch live recipe count when selections change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (selectedRestrictions.length === 0) {
      setRecipeCount(null);
      return;
    }

    setRecipeCountLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const qs = selectedRestrictions.join(",");
        const res = await fetch(
          `${BASE_URL}/dietary-preferences/recipe-count?restrictions=${encodeURIComponent(qs)}`,
        );
        if (res.ok) {
          const data = (await res.json()) as { count: number };
          setRecipeCount(data.count);
        }
      } catch {
        // Silently fail — recipe count is informational
      } finally {
        setRecipeCountLoading(false);
      }
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [selectedRestrictions]);

  const goToSlide = useCallback(
    (index: number) => {
      flatListRef.current?.scrollToIndex({ index, animated: true });
    },
    [],
  );

  const goNext = useCallback(() => {
    if (currentIndex < SLIDES.length - 1) {
      goToSlide(currentIndex + 1);
    }
  }, [currentIndex, goToSlide]);

  const completeOnboarding = useCallback(() => {
    mmkv.set("ONBOARDING_COMPLETE", "true");
    router.replace("/(tabs)/");
  }, [router]);

  const handleDietaryNext = useCallback(async () => {
    // Sync dietary preferences to local store
    const currentLocal = usePreferencesStore.getState().dietaryFilters;
    // Clear old and set new
    for (const f of currentLocal) {
      toggleDietary(f);
    }
    for (const r of selectedRestrictions) {
      toggleDietary(r);
    }

    // If authenticated, sync to server
    if (sessionToken) {
      try {
        await fetch(`${BASE_URL}/users/me/dietary-preferences`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({ restrictions: selectedRestrictions }),
        });
      } catch {
        // Fall back silently — local save already done
      }
    }

    goNext();
  }, [selectedRestrictions, sessionToken, toggleDietary, goNext]);

  const handleDietaryToggle = useCallback((restriction: DietaryRestriction) => {
    setSelectedRestrictions((prev) => {
      if (prev.includes(restriction)) {
        return prev.filter((r) => r !== restriction);
      }
      return [...prev, restriction];
    });
  }, []);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const first = viewableItems[0];
      if (viewableItems.length > 0 && first && first.index != null) {
        setCurrentIndex(first.index);
      }
    },
    [],
  );

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const renderSlide = useCallback(
    ({ item }: ListRenderItemInfo<SlideData>) => {
      switch (item.key) {
        case "welcome":
          return (
            <View
              style={{ width, flex: 1, justifyContent: "center", alignItems: "center", padding: 32, backgroundColor: colors.bg }}
            >
              <View
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: 60,
                  backgroundColor: colors.orangeLight,
                  justifyContent: "center",
                  alignItems: "center",
                  marginBottom: 48,
                }}
              >
                <Text style={{ fontSize: 48 }}>🍳</Text>
              </View>
              <Text
                style={{
                  fontFamily: fonts.display,
                  fontSize: 32,
                  color: colors.ink,
                  textAlign: "center",
                  marginBottom: 12,
                }}
              >
                Recipes without the story.
              </Text>
              <Text
                style={{
                  fontFamily: fonts.body,
                  fontSize: 18,
                  color: colors.inkMuted,
                  textAlign: "center",
                  marginBottom: 48,
                }}
              >
                Just the good stuff.
              </Text>
              <Pressable
                onPress={goNext}
                style={{
                  backgroundColor: colors.orange,
                  paddingVertical: 16,
                  paddingHorizontal: 48,
                  borderRadius: 9999,
                  minHeight: 44,
                }}
              >
                <Text
                  style={{
                    fontFamily: fonts.bodyMed,
                    fontSize: 17,
                    color: "#FFFFFF",
                    textAlign: "center",
                  }}
                >
                  Next
                </Text>
              </Pressable>
            </View>
          );

        case "dietary":
          return (
            <View style={{ width, flex: 1, padding: 32, backgroundColor: colors.bg }}>
              <View style={{ flexDirection: "row", justifyContent: "flex-end", marginBottom: 16 }}>
                <Pressable onPress={goNext} style={{ minHeight: 44, justifyContent: "center" }}>
                  <Text style={{ fontFamily: fonts.bodyMed, fontSize: 15, color: colors.inkMuted }}>
                    Skip
                  </Text>
                </Pressable>
              </View>
              <Text
                style={{
                  fontFamily: fonts.display,
                  fontSize: 28,
                  color: colors.ink,
                  textAlign: "center",
                  marginBottom: 16,
                }}
              >
                Any dietary preferences?
              </Text>
              {/* Live recipe count */}
              {selectedRestrictions.length > 0 && (
                <View style={{ alignItems: "center", marginBottom: 16 }}>
                  {recipeCountLoading ? (
                    <ActivityIndicator size="small" color={colors.orange} />
                  ) : recipeCount !== null ? (
                    <Text
                      style={{
                        fontFamily: fonts.body,
                        fontSize: 14,
                        color: colors.inkMuted,
                      }}
                    >
                      {recipeCount} {recipeCount === 1 ? "recipe matches" : "recipes match"} your preferences
                    </Text>
                  ) : null}
                </View>
              )}
              <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 12 }}>
                {ALL_DIETARY_OPTIONS.map(({ key, label }) => {
                  const isActive = selectedRestrictions.includes(key);
                  return (
                    <Pressable
                      key={key}
                      onPress={() => handleDietaryToggle(key)}
                      style={{
                        paddingVertical: 12,
                        paddingHorizontal: 24,
                        borderRadius: 9999,
                        borderWidth: 2,
                        borderColor: isActive ? colors.orange : colors.inkFaint,
                        backgroundColor: isActive ? colors.orangeLight : "transparent",
                        minHeight: 44,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: fonts.bodyMed,
                          fontSize: 15,
                          color: isActive ? colors.orange : colors.ink,
                        }}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={{ flex: 1 }} />
              <Pressable
                onPress={handleDietaryNext}
                style={{
                  backgroundColor: colors.orange,
                  paddingVertical: 16,
                  borderRadius: 9999,
                  alignItems: "center",
                  minHeight: 44,
                }}
              >
                <Text style={{ fontFamily: fonts.bodyMed, fontSize: 17, color: "#FFFFFF" }}>
                  Next
                </Text>
              </Pressable>
            </View>
          );

        case "notifications":
          return (
            <View style={{ width, flex: 1, padding: 32, backgroundColor: colors.bg }}>
              <View style={{ flexDirection: "row", justifyContent: "flex-end", marginBottom: 16 }}>
                <Pressable onPress={completeOnboarding} style={{ minHeight: 44, justifyContent: "center" }}>
                  <Text style={{ fontFamily: fonts.bodyMed, fontSize: 15, color: colors.inkMuted }}>
                    Skip
                  </Text>
                </Pressable>
              </View>
              <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                <Text
                  style={{
                    fontFamily: fonts.display,
                    fontSize: 28,
                    color: colors.ink,
                    textAlign: "center",
                    marginBottom: 16,
                  }}
                >
                  Stay updated
                </Text>
                <Text
                  style={{
                    fontFamily: fonts.body,
                    fontSize: 16,
                    color: colors.inkMuted,
                    textAlign: "center",
                    marginBottom: 32,
                    lineHeight: 24,
                  }}
                >
                  Get notified when new recipes are added from your favorite sites
                </Text>
                <Pressable
                  onPress={() => {
                    mmkv.set("NOTIFICATIONS_ENABLED", "true");
                    setNotificationsEnabled(true);
                  }}
                  style={{
                    backgroundColor: notificationsEnabled ? colors.bgMuted : colors.orange,
                    paddingVertical: 16,
                    paddingHorizontal: 32,
                    borderRadius: 9999,
                    minHeight: 44,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: fonts.bodyMed,
                      fontSize: 17,
                      color: notificationsEnabled ? colors.inkMuted : "#FFFFFF",
                      textAlign: "center",
                    }}
                  >
                    {notificationsEnabled ? "Notifications Enabled" : "Enable Notifications"}
                  </Text>
                </Pressable>
              </View>
              <Pressable
                onPress={completeOnboarding}
                style={{
                  backgroundColor: colors.orange,
                  paddingVertical: 16,
                  borderRadius: 9999,
                  alignItems: "center",
                  minHeight: 44,
                }}
              >
                <Text style={{ fontFamily: fonts.bodyMed, fontSize: 17, color: "#FFFFFF" }}>
                  Get Started
                </Text>
              </Pressable>
            </View>
          );

        default:
          return null;
      }
    },
    [width, goNext, selectedRestrictions, handleDietaryToggle, handleDietaryNext, completeOnboarding, notificationsEnabled, recipeCount, recipeCountLoading],
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        renderItem={renderSlide}
        keyExtractor={(item) => item.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, index) => ({
          length: width,
          offset: width * index,
          index,
        })}
      />
      {/* Page indicator dots */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "center",
          paddingBottom: 48,
          gap: 8,
          backgroundColor: colors.bg,
        }}
      >
        {SLIDES.map((slide, index) => (
          <View
            key={slide.key}
            style={{
              width: index === currentIndex ? 24 : 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: index === currentIndex ? colors.orange : colors.inkFaint,
            }}
          />
        ))}
      </View>
    </View>
  );
}
