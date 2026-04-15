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
import GorhomBottomSheet from '@gorhom/bottom-sheet';
import { useShoppingList } from '@/hooks/useShoppingList';
import { BottomSheet } from '@/components/BottomSheet';
import { EmptyState } from '@/components/EmptyState';
import { ShoppingCartIcon } from '@/components/icons';
import type { ShoppingItem } from '@/stores/shopping.store';

const CATEGORY_ORDER = ['PRODUCE', 'DAIRY', 'MEAT', 'PANTRY', 'SPICES', 'OTHER'];

interface RecipePill {
  recipeId: string;
  recipeTitle: string;
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

  const bottomSheetRef = useRef<GorhomBottomSheet>(null);
  const [manualText, setManualText] = useState('');

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

  const handleShare = useCallback(async () => {
    const lines: string[] = [];
    for (const section of sections) {
      lines.push('\n' + section.title);
      for (const item of section.data) {
        const prefix = item.checked ? '\u2611' : '\u2610';
        lines.push('  ' + prefix + ' ' + item.text);
      }
    }
    const message = 'Shopping List\n' + lines.join('\n');
    await Share.share({ message });
  }, [sections]);

  const openAddSheet = useCallback(() => {
    bottomSheetRef.current?.snapToIndex(0);
  }, []);

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
        renderSectionHeader={({ section: { title } }) => (
          <View className="bg-bg-muted px-5 py-2">
            <Text className="font-body text-xs text-ink-muted font-medium tracking-wide">
              {title}
            </Text>
          </View>
        )}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => toggle(item.id)}
            className="flex-row items-center px-5 py-3 bg-bg-card border-b border-bg-muted"
          >
            <View
              className={`w-6 h-6 rounded-md border-2 mr-3 items-center justify-center ${
                item.checked ? 'bg-orange border-orange' : 'border-ink-faint'
              }`}
            >
              {item.checked && <Text className="text-white text-xs">{'\u2713'}</Text>}
            </View>
            <Text
              className={`flex-1 font-body text-base ${
                item.checked ? 'line-through text-ink-muted' : 'text-ink'
              }`}
            >
              {item.text}
            </Text>
          </TouchableOpacity>
        )}
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
