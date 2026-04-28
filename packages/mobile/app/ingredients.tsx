import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts } from "@/constants/theme";
import { RecipeCard } from "@/components/RecipeCard";
import { RecipeCardSkeleton } from "@/components/RecipeCardSkeleton";
import {
  useIngredientSuggest,
  useIngredientSearch,
  type IngredientSearchItem,
} from "@/hooks/useIngredientSearch";
import type { RecipeSummary } from "@rr/shared";

/* ── Section header (diamond + mono caps + rule) ─────────────── */
function SectionLabel({ label }: { label: string }) {
  return (
    <View style={s.sectionLabelRow}>
      <Text style={s.sectionDiamond}>◆</Text>
      <Text style={s.sectionLabel}>{label}</Text>
      <View style={s.sectionRule} />
    </View>
  );
}

/* ── Ingredient pill with remove button ──────────────────────── */
function IngredientPill({
  name,
  onRemove,
  variant,
}: {
  name: string;
  onRemove: () => void;
  variant: "have" | "exclude";
}) {
  const isExclude = variant === "exclude";
  return (
    <View
      style={[
        s.pill,
        isExclude && { borderColor: colors.accent, backgroundColor: colors.accentLight },
      ]}
    >
      <Text
        style={[s.pillText, isExclude && { color: colors.accent }]}
        numberOfLines={1}
      >
        {name}
      </Text>
      <Pressable onPress={onRemove} hitSlop={6} accessibilityLabel={`Remove ${name}`}>
        <Text style={[s.pillRemove, isExclude && { color: colors.accent }]}>
          ×
        </Text>
      </Pressable>
    </View>
  );
}

/* ── Main screen ─────────────────────────────────────────────── */
export default function IngredientsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [query, setQuery] = useState("");
  const [haveList, setHaveList] = useState<string[]>([]);
  const [excludeList, setExcludeList] = useState<string[]>([]);
  const [activeSection, setActiveSection] = useState<"have" | "exclude">("have");
  const [searchTriggered, setSearchTriggered] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const suggestions = useIngredientSuggest(query);
  const results = useIngredientSearch(haveList, excludeList, searchTriggered);

  const addIngredient = useCallback(
    (name: string) => {
      const normalised = name.trim().toLowerCase();
      if (!normalised) return;

      if (activeSection === "have") {
        if (!haveList.includes(normalised)) {
          setHaveList((prev) => [...prev, normalised]);
        }
      } else {
        if (!excludeList.includes(normalised)) {
          setExcludeList((prev) => [...prev, normalised]);
        }
      }
      setQuery("");
      setShowSuggestions(false);
      setSearchTriggered(false);
    },
    [activeSection, haveList, excludeList],
  );

  const removeHave = useCallback(
    (name: string) => {
      setHaveList((prev) => prev.filter((i) => i !== name));
      setSearchTriggered(false);
    },
    [],
  );

  const removeExclude = useCallback(
    (name: string) => {
      setExcludeList((prev) => prev.filter((i) => i !== name));
      setSearchTriggered(false);
    },
    [],
  );

  const handleSearch = useCallback(() => {
    if (haveList.length === 0) return;
    setSearchTriggered(true);
  }, [haveList]);

  const suggestionItems = (suggestions.data ?? []).filter(
    (item): item is string => typeof item === "string" && item.length > 0,
  );
  const filteredSuggestions = suggestionItems.filter(
    (item) => !haveList.includes(item.toLowerCase()) && !excludeList.includes(item.toLowerCase()),
  );

  return (
    <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={s.container}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={[s.header, { paddingTop: insets.top + 12 }]}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={s.backBtn}>← BACK</Text>
          </Pressable>
          <Text style={s.heading}>What's in{"\n"}your fridge?</Text>
          <Text style={s.subheading}>
            Add ingredients you have on hand. We'll find recipes you can make
            right now.
          </Text>
        </View>

        {/* Section toggle */}
        <View style={s.toggleRow}>
          <Pressable
            onPress={() => setActiveSection("have")}
            style={[
              s.toggleBtn,
              activeSection === "have" && s.toggleBtnActive,
            ]}
          >
            <Text
              style={[
                s.toggleBtnText,
                activeSection === "have" && s.toggleBtnTextActive,
              ]}
            >
              I HAVE
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveSection("exclude")}
            style={[
              s.toggleBtn,
              activeSection === "exclude" && s.toggleBtnActive,
            ]}
          >
            <Text
              style={[
                s.toggleBtnText,
                activeSection === "exclude" && s.toggleBtnTextActive,
              ]}
            >
              DON'T HAVE
            </Text>
          </Pressable>
        </View>

        {/* Search input */}
        <View style={s.inputWrap}>
          <TextInput
            style={s.input}
            placeholder={
              activeSection === "have"
                ? "e.g. chicken, garlic, rice..."
                : "e.g. nuts, dairy..."
            }
            placeholderTextColor={colors.inkFaint}
            value={query}
            onChangeText={(text) => {
              setQuery(text);
              setShowSuggestions(true);
            }}
            onSubmitEditing={() => {
              if (query.trim()) addIngredient(query);
            }}
            returnKeyType="done"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.trim().length > 0 && (
            <Pressable
              onPress={() => addIngredient(query)}
              style={s.addBtn}
              accessibilityLabel="Add ingredient"
            >
              <Text style={s.addBtnText}>ADD</Text>
            </Pressable>
          )}
        </View>

        {/* Autocomplete dropdown */}
        {showSuggestions && filteredSuggestions.length > 0 && (
          <View style={s.suggestionsWrap}>
            {filteredSuggestions.slice(0, 8).map((item) => (
              <Pressable
                key={item}
                onPress={() => addIngredient(item)}
                style={s.suggestionItem}
              >
                <Text style={s.suggestionText}>{item}</Text>
                <Text style={s.suggestionPlus}>+</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* "Have" pills */}
        {haveList.length > 0 && (
          <View style={s.pillSection}>
            <SectionLabel label="INGREDIENTS I HAVE" />
            <View style={s.pillGrid}>
              {haveList.map((name) => (
                <IngredientPill
                  key={name}
                  name={name}
                  variant="have"
                  onRemove={() => removeHave(name)}
                />
              ))}
            </View>
          </View>
        )}

        {/* "Exclude" pills */}
        {excludeList.length > 0 && (
          <View style={s.pillSection}>
            <SectionLabel label="INGREDIENTS TO EXCLUDE" />
            <View style={s.pillGrid}>
              {excludeList.map((name) => (
                <IngredientPill
                  key={name}
                  name={name}
                  variant="exclude"
                  onRemove={() => removeExclude(name)}
                />
              ))}
            </View>
          </View>
        )}

        {/* Find recipes button */}
        {haveList.length > 0 && (
          <View style={s.searchBtnWrap}>
            <Pressable
              onPress={handleSearch}
              style={s.searchBtn}
              accessibilityRole="button"
              accessibilityLabel="Find recipes"
            >
              <Text style={s.searchBtnText}>
                → FIND RECIPES ({haveList.length} INGREDIENT
                {haveList.length > 1 ? "S" : ""})
              </Text>
            </Pressable>
          </View>
        )}

        {/* Results */}
        {searchTriggered && (
          <View style={s.resultsSection}>
            <SectionLabel label="MATCHING RECIPES" />

            {results.isLoading && (
              <View style={s.resultsList}>
                {[1, 2, 3].map((i) => (
                  <View key={i} style={s.resultCard}>
                    <RecipeCardSkeleton />
                  </View>
                ))}
              </View>
            )}

            {results.isError && (
              <View style={s.emptyWrap}>
                <Text style={s.emptyText}>
                  Something went wrong. Please try again.
                </Text>
                <Pressable onPress={handleSearch} style={s.retryBtn}>
                  <Text style={s.retryBtnText}>RETRY</Text>
                </Pressable>
              </View>
            )}

            {results.isSuccess && results.data.items.length === 0 && (
              <View style={s.emptyWrap}>
                <Text style={s.emptyText}>
                  No recipes found with those ingredients. Try adding more items
                  or removing exclusions.
                </Text>
              </View>
            )}

            {results.isSuccess && results.data.items.length > 0 && (
              <View style={s.resultsList}>
                {results.data.items.map((item) => {
                  const summary: RecipeSummary = {
                    id: item.id,
                    title: item.title,
                    domain: item.domain,
                    image_url: item.image_url,
                    total_time: item.total_time,
                    cook_time: item.cook_time,
                    yields: item.yields,
                    cuisine: item.cuisine,
                    category: item.category,
                    tags: [],
                  };
                  return (
                    <View key={item.id} style={s.resultCard}>
                      {(item.match.have > 0 || item.match.total > 0) && (
                        <View style={s.matchBar}>
                          <Text style={s.matchText}>
                            {item.match.have}/{item.match.total} INGREDIENTS
                          </Text>
                          {item.match.missing.length > 0 && (
                            <Text style={s.missingText}>
                              MISSING: {item.match.missing.join(", ")}
                            </Text>
                          )}
                        </View>
                      )}
                      <RecipeCard recipe={summary} />
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* ── Styles ─────────────────────────────────────────────────────── */
const s = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  backBtn: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.inkFaint,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 20,
  },
  heading: {
    fontFamily: fonts.serif,
    fontSize: 28,
    color: colors.ink,
    lineHeight: 34,
  },
  subheading: {
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.ink2,
    lineHeight: 22,
    marginTop: 12,
  },

  /* Toggle */
  toggleRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 16,
  },
  toggleBtn: {
    borderWidth: 1,
    borderColor: colors.rule,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: colors.bgCard,
  },
  toggleBtnActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  toggleBtnText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.ink,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  toggleBtnTextActive: {
    color: "#FFFFFF",
  },

  /* Input */
  inputWrap: {
    flexDirection: "row",
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.bgCard,
    marginBottom: 4,
  },
  input: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.ink,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  addBtn: {
    backgroundColor: colors.accent,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  addBtnText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: "#FFFFFF",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },

  /* Suggestions */
  suggestionsWrap: {
    marginHorizontal: 16,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: colors.rule,
    backgroundColor: colors.bgCard,
    marginBottom: 8,
  },
  suggestionItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
  },
  suggestionText: {
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.ink,
  },
  suggestionPlus: {
    fontFamily: fonts.mono,
    fontSize: 16,
    color: colors.accent,
  },

  /* Pills */
  pillSection: {
    marginTop: 20,
    paddingHorizontal: 16,
  },
  pillGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.bgCard,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 8,
    gap: 6,
  },
  pillText: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.ink,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  pillRemove: {
    fontFamily: fonts.sans,
    fontSize: 18,
    color: colors.inkFaint,
    lineHeight: 18,
  },

  /* Section label (same pattern as home screen) */
  sectionLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 8,
  },
  sectionDiamond: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.accent,
  },
  sectionLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.inkFaint,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  sectionRule: {
    flex: 1,
    height: 1,
    backgroundColor: colors.rule,
  },

  /* Search button */
  searchBtnWrap: {
    paddingHorizontal: 16,
    marginTop: 24,
  },
  searchBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 16,
    alignItems: "center",
  },
  searchBtnText: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: "#FFFFFF",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },

  /* Results */
  resultsSection: {
    marginTop: 32,
    paddingHorizontal: 16,
  },
  resultsList: {
    gap: 12,
  },
  resultCard: {
    marginBottom: 0,
  },
  matchBar: {
    backgroundColor: colors.bgMuted,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.rule,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  matchText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.accent,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  missingText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.inkFaint,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginTop: 2,
  },

  /* Empty / error */
  emptyWrap: {
    paddingVertical: 32,
    alignItems: "center",
  },
  emptyText: {
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.inkFaint,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 280,
  },
  retryBtn: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.ink,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  retryBtnText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.ink,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
});
