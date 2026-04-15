import React, { useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  useWindowDimensions,
  type ViewToken,
  type ListRenderItemInfo,
} from "react-native";
import { useRouter } from "expo-router";
import { mmkv } from "@/lib/mmkv";
import { usePreferencesStore } from "@/stores/preferences.store";
import { colors, fonts } from "@/constants/theme";

const DIETARY_OPTIONS = [
  "None",
  "Vegan",
  "Vegetarian",
  "Gluten-free",
  "Dairy-free",
  "Keto",
] as const;

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
  const [selectedDietary, setSelectedDietary] = useState<string[]>([]);
  const toggleDietary = usePreferencesStore((s) => s.toggleDietary);
  const dietaryFilters = usePreferencesStore((s) => s.dietaryFilters);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

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

  const handleDietaryToggle = useCallback(
    (option: string) => {
      if (option === "None") {
        // Deselect all dietary filters
        for (const filter of dietaryFilters) {
          toggleDietary(filter);
        }
        setSelectedDietary([]);
      } else {
        toggleDietary(option);
        setSelectedDietary((prev) => {
          const isSelected = prev.includes(option);
          if (isSelected) {
            return prev.filter((o) => o !== option);
          }
          return prev.filter((o) => o !== "None").concat(option);
        });
      }
    },
    [toggleDietary, dietaryFilters],
  );

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const first = viewableItems[0];
      if (first && first.index != null) {
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
                  marginBottom: 32,
                }}
              >
                Any dietary preferences?
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 12 }}>
                {DIETARY_OPTIONS.map((option) => {
                  const isActive = option === "None"
                    ? selectedDietary.length === 0
                    : selectedDietary.includes(option);
                  return (
                    <Pressable
                      key={option}
                      onPress={() => handleDietaryToggle(option)}
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
                        {option}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={{ flex: 1 }} />
              <Pressable
                onPress={goNext}
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
    [width, goNext, selectedDietary, handleDietaryToggle, completeOnboarding, notificationsEnabled],
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
