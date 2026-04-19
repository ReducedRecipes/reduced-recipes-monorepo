import React, { useCallback, useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  SectionList,
  TextInput,
  Alert,
  Share,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useShoppingList } from '@/hooks/useShoppingList';
import { BottomSheet, type BottomSheetRef } from '@/components/BottomSheet';
import { EmptyState } from '@/components/EmptyState';
import { ShoppingCartIcon } from '@/components/icons';
import type { ShoppingItem } from '@/stores/shopping.store';

const CATEGORY_ORDER = [
  'Produce',
  'Dairy',
  'Meat & Seafood',
  'Pantry',
  'Frozen',
  'Bakery',
  'Beverages',
  'Spices & Seasonings',
  'Other',
];

const CATEGORY_ICONS: Record<string, string> = {
  'Produce': '🥬',
  'Dairy': '🧀',
  'Meat & Seafood': '🥩',
  'Pantry': '🫙',
  'Frozen': '🧊',
  'Bakery': '🍞',
  'Beverages': '🥤',
  'Spices & Seasonings': '🌿',
  'Other': '📦',
};

const CATEGORY_COLORS: Record<string, string> = {
  'Produce': 'bg-green-50 border-green-200',
  'Dairy': 'bg-yellow-50 border-yellow-200',
  'Meat & Seafood': 'bg-red-50 border-red-200',
  'Pantry': 'bg-amber-50 border-amber-200',
  'Frozen': 'bg-blue-50 border-blue-200',
  'Bakery': 'bg-orange-50 border-orange-200',
  'Beverages': 'bg-cyan-50 border-cyan-200',
  'Spices & Seasonings': 'bg-lime-50 border-lime-200',
  'Other': 'bg-gray-50 border-gray-200',
};

interface RecipePill {
  recipeId: string;
  recipeTitle: string;
}

interface RecipeSource {
  recipeId: string;
  recipeTitle: string;
  originalText: string;
}

/** Build a map of item ID → all recipe sources that contributed to the same ingredient text. */
function buildSourceMap(items: ShoppingItem[]): Map<string, RecipeSource[]> {
  const textToSources = new Map<string, RecipeSource[]>();
  for (const item of items) {
    if (!item.recipeId || !item.recipeTitle) continue;
    const key = item.text.toLowerCase().trim();
    const sources = textToSources.get(key) ?? [];
    const alreadyHas = sources.some((s) => s.recipeId === item.recipeId);
    if (!alreadyHas) {
      sources.push({
        recipeId: item.recipeId,
        recipeTitle: item.recipeTitle,
        originalText: item.text,
      });
    }
    textToSources.set(key, sources);
  }

  const itemToSources = new Map<string, RecipeSource[]>();
  for (const item of items) {
    const key = item.text.toLowerCase().trim();
    const sources = textToSources.get(key);
    if (sources && sources.length > 0) {
      itemToSources.set(item.id, sources);
    }
  }
  return itemToSources;
}

export default function ShoppingListScreen() {
  const {
    items,
    toggle,
    remove,
    addManual,
    clearChecked,
    clearAll,
    groupedByCategory,
    checkedCount,
    totalCount,
  } = useShoppingList();

  const router = useRouter();
  const bottomSheetRef = useRef<BottomSheetRef>(null);
  const [manualText, setManualText] = useState('');
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [toastVisible, setToastVisible] = useState(false);

  const recipePills = useMemo<RecipePill[]>(() => {
    const seen = new Map<string, string>();
    for (const item of items) {
      if (item.recipeId && item.recipeTitle && !seen.has(item.recipeId)) {
        seen.set(item.recipeId, item.recipeTitle);
      }
    }
    return Array.from(seen.entries()).map(([recipeId, recipeTitle]) => ({
      recipeId,
      recipeTitle,
    }));
  }, [items]);

  const sourceMap = useMemo(() => buildSourceMap(items), [items]);

  const sections = useMemo(() => {
    const result: { title: string; data: ShoppingItem[] }[] = [];
    for (const cat of CATEGORY_ORDER) {
      const catItems = groupedByCategory[cat];
      if (catItems && catItems.length > 0) {
        const sorted = [...catItems].sort((a, b) => {
          if (a.checked === b.checked) return 0;
          return a.checked ? 1 : -1;
        });
        result.push({ title: cat, data: sorted });
      }
    }
    for (const cat of Object.keys(groupedByCategory)) {
      if (!CATEGORY_ORDER.includes(cat)) {
        const catItems = groupedByCategory[cat];
        if (catItems && catItems.length > 0) {
          const sorted = [...catItems].sort((a, b) => {
            if (a.checked === b.checked) return 0;
            return a.checked ? 1 : -1;
          });
          result.push({ title: cat, data: sorted });
        }
      }
    }
    return result;
  }, [groupedByCategory]);

  const handleRemoveRecipeItems = useCallback(
    (recipeId: string) => {
      const toRemove = items.filter((i) => i.recipeId === recipeId);
      for (const item of toRemove) {
        remove(item.id);
      }
    },
    [items, remove],
  );

  const handleAddManual = useCallback(() => {
    const trimmed = manualText.trim();
    if (trimmed) {
      addManual(trimmed);
      setManualText('');
      bottomSheetRef.current?.close();
    }
  }, [manualText, addManual]);

  const handleClearChecked = useCallback(() => {
    Alert.alert(
      'Clear completed',
      'Remove ' + checkedCount + ' checked items?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: clearChecked },
      ],
    );
  }, [checkedCount, clearChecked]);

  const buildShareMessage = useCallback(() => {
    const lines: string[] = [];
    for (const section of sections) {
      const icon = CATEGORY_ICONS[section.title] ?? '';
      lines.push('\n' + icon + ' ' + section.title);
      for (const item of section.data) {
        const prefix = item.checked ? '\u2611' : '\u2610';
        lines.push('  ' + prefix + ' ' + item.text);
      }
    }
    return 'Shopping List\n' + lines.join('\n');
  }, [sections]);

  const handleShare = useCallback(async () => {
    const message = buildShareMessage();
    const result = await Share.share({ message });
    if (result.action === Share.sharedAction) {
      setToastVisible(true);
      setTimeout(() => setToastVisible(false), 2000);
    }
  }, [buildShareMessage]);

  const toggleExpanded = useCallback((itemId: string) => {
    setExpandedItems((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }, []);

  const navigateToRecipe = useCallback(
    (recipeId: string) => {
      router.push(`/recipe/${recipeId}`);
    },
    [router],
  );

  const openAddSheet = useCallback(() => {
    bottomSheetRef.current?.snapToIndex(0);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: ShoppingItem }) => {
      const sources = sourceMap.get(item.id) ?? [];
      const isMultiSource = sources.length > 1;
      const hasSources = sources.length > 0;
      const isExpanded = expandedItems.has(item.id);

      return (
        <View className="bg-bg-card border-b border-bg-muted">
          <TouchableOpacity
            onPress={() => toggle(item.id)}
            className="flex-row items-center px-5 py-3.5"
          >
            <View
              className={`w-6 h-6 rounded-full border-2 mr-3 items-center justify-center ${
                item.checked ? 'bg-orange border-orange' : 'border-ink-faint'
              }`}
            >
              {item.checked && <Text className="text-white text-xs">{'\u2713'}</Text>}
            </View>
            <View className="flex-1">
              <Text
                className={`font-body text-base ${
                  item.checked ? 'line-through text-ink-muted opacity-50' : 'text-ink'
                }`}
              >
                {item.text}
              </Text>
              {hasSources && (
                <TouchableOpacity
                  onPress={() => toggleExpanded(item.id)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  className="mt-1"
                >
                  <View className="flex-row items-center">
                    <View className="bg-bg-muted px-2 py-0.5 rounded-full">
                      <Text className="font-body text-xs text-ink-muted">
                        {isMultiSource
                          ? `from ${sources.length} recipes`
                          : sources[0].recipeTitle}
                      </Text>
                    </View>
                    <Text className="text-ink-muted text-xs ml-1">
                      {isExpanded ? '\u25B2' : '\u25BC'}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>
          </TouchableOpacity>

          {isExpanded && hasSources && (
            <View className="px-12 pb-3">
              {sources.map((source: RecipeSource) => (
                <TouchableOpacity
                  key={source.recipeId}
                  onPress={() => navigateToRecipe(source.recipeId)}
                  className="flex-row items-center py-1.5"
                >
                  <Text className="font-body text-sm text-orange mr-2">
                    {source.recipeTitle}
                  </Text>
                  <Text className="font-body text-xs text-ink-muted">
                    {source.originalText}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      );
    },
    [sourceMap, expandedItems, toggle, toggleExpanded, navigateToRecipe],
  );

  if (totalCount === 0) {
    return (
      <View className="flex-1 bg-bg">
        <View className="flex-row items-center justify-between px-5 pt-14 pb-4">
          <Text className="font-display text-2xl text-ink">Shopping List</Text>
          <TouchableOpacity
            onPress={openAddSheet}
            className="bg-orange px-4 py-2 rounded-lg"
          >
            <Text className="text-white font-body text-sm">+ Add</Text>
          </TouchableOpacity>
        </View>
        <EmptyState
          icon={<ShoppingCartIcon color="#9CA3AF" size={48} />}
          title="Your shopping list is empty"
          subtitle="Add ingredients from recipe pages"
        />
        <BottomSheet ref={bottomSheetRef} snapPoints={['30%']} onClose={() => setManualText('')}>
          <View className="px-5 pt-4">
            <Text className="font-display text-lg text-ink mb-3">Add item</Text>
            <TextInput
              className="border border-ink-faint rounded-lg px-4 py-3 font-body text-base text-ink"
              placeholder="e.g. 2 cups flour"
              value={manualText}
              onChangeText={setManualText}
              onSubmitEditing={handleAddManual}
              returnKeyType="done"
              autoFocus
            />
            <TouchableOpacity
              onPress={handleAddManual}
              className="bg-orange mt-3 py-3 rounded-lg items-center"
            >
              <Text className="text-white font-body text-base font-medium">Add to list</Text>
            </TouchableOpacity>
          </View>
        </BottomSheet>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-bg">
      <View className="flex-row items-center justify-between px-5 pt-14 pb-2">
        <Text className="font-display text-2xl text-ink">Shopping List</Text>
        <TouchableOpacity
          onPress={openAddSheet}
          className="bg-orange px-4 py-2 rounded-lg"
        >
          <Text className="text-white font-body text-sm">+ Add</Text>
        </TouchableOpacity>
      </View>

      {checkedCount > 0 && totalCount > 0 && (
        <View className="px-5 pb-2">
          <View className="bg-bg-muted rounded-full h-2 overflow-hidden">
            <View
              className="bg-orange h-full rounded-full"
              style={{ width: `${(checkedCount / totalCount) * 100}%` }}
            />
          </View>
          <Text className="font-body text-xs text-ink-muted mt-1">
            {checkedCount} of {totalCount} items checked
          </Text>
        </View>
      )}

      {recipePills.length > 0 && (
        <View className="flex-row flex-wrap px-5 pb-3 gap-2">
          {recipePills.map((pill) => (
            <TouchableOpacity
              key={pill.recipeId}
              onPress={() => handleRemoveRecipeItems(pill.recipeId)}
              className="flex-row items-center bg-orange-light px-3 py-1.5 rounded-full"
            >
              <Text className="font-body text-sm text-orange mr-1">{pill.recipeTitle}</Text>
              <Text className="text-orange text-xs">{'\u2715'}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderSectionHeader={({ section: { title } }) => {
          const icon = CATEGORY_ICONS[title] ?? '📦';
          const colorClass = CATEGORY_COLORS[title] ?? 'bg-gray-50 border-gray-200';
          return (
            <View className={`flex-row items-center px-5 py-2.5 border-b ${colorClass}`}>
              <Text className="text-base mr-2">{icon}</Text>
              <Text className="font-display text-sm text-ink font-semibold tracking-wide">
                {title}
              </Text>
              <View className="ml-auto bg-bg rounded-full px-2 py-0.5">
                <Text className="font-body text-xs text-ink-muted">
                  {sections.find((s) => s.title === title)?.data.length ?? 0}
                </Text>
              </View>
            </View>
          );
        }}
        renderItem={renderItem}
        stickySectionHeadersEnabled
        contentContainerStyle={{ paddingBottom: 120 }}
      />

      <View className="absolute bottom-0 left-0 right-0 bg-bg-card border-t border-bg-muted px-5 py-4 pb-8 flex-row justify-between">
        {checkedCount > 0 && (
          <TouchableOpacity onPress={handleClearChecked} className="py-2">
            <Text className="font-body text-base text-error">Clear completed</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={handleShare} className="py-2 ml-auto">
          <Text className="font-body text-base text-orange">Share list</Text>
        </TouchableOpacity>
      </View>

      {toastVisible && (
        <View className="absolute top-20 left-0 right-0 items-center" pointerEvents="none">
          <View className="bg-ink px-4 py-2 rounded-full">
            <Text className="font-body text-sm text-white">List shared successfully</Text>
          </View>
        </View>
      )}

      <BottomSheet ref={bottomSheetRef} snapPoints={['30%']} onClose={() => setManualText('')}>
        <View className="px-5 pt-4">
          <Text className="font-display text-lg text-ink mb-3">Add item</Text>
          <TextInput
            className="border border-ink-faint rounded-lg px-4 py-3 font-body text-base text-ink"
            placeholder="e.g. 2 cups flour"
            value={manualText}
            onChangeText={setManualText}
            onSubmitEditing={handleAddManual}
            returnKeyType="done"
          />
          <TouchableOpacity
            onPress={handleAddManual}
            className="bg-orange mt-3 py-3 rounded-lg items-center"
          >
            <Text className="text-white font-body text-base font-medium">Add to list</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>
    </View>
  );
}
