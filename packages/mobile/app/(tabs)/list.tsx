import React, { useCallback, useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  SectionList,
  ScrollView,
  TextInput,
  Alert,
  Share,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useShoppingList } from '@/hooks/useShoppingList';
import { useShoppingListSync } from '@/hooks/useShoppingListSync';
import { useAuthStore } from '@/stores/auth.store';
import { BottomSheet, type BottomSheetRef } from '@/components/BottomSheet';
import { EmptyState } from '@/components/EmptyState';
import { ShoppingCartIcon } from '@/components/icons';
import { shareShoppingList } from '@/lib/api';
import type { ShoppingItem } from '@/stores/shopping.store';
import { colors, fonts, fontSizes } from '@/constants/theme';

const CATEGORY_ORDER = ['PRODUCE', 'DAIRY', 'MEAT', 'PANTRY', 'SPICES', 'OTHER'];

interface RecipePill {
  recipeId: string;
  recipeTitle: string;
}

export default function ShoppingListScreen() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const {
    items,
    lists,
    activeListId,
    isLoading: listLoading,
    toggle,
    remove,
    addManual,
    clearChecked,
    clearAll,
    selectList,
    groupedByCategory,
    checkedCount,
    totalCount,
  } = useShoppingList();

  const bottomSheetRef = useRef<BottomSheetRef>(null);
  const [manualText, setManualText] = useState('');
  const [isSharing, setIsSharing] = useState(false);

  // Determine if the active list is shared
  const activeList = useMemo(
    () => lists.find((l) => l.id === activeListId) ?? null,
    [lists, activeListId],
  );
  const isSharedList = activeList?.share_token != null;

  // Connect WebSocket for real-time sync on shared lists
  useShoppingListSync(activeListId, isSharedList);

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

  const handleShareList = useCallback(async () => {
    if (!activeListId) {
      Alert.alert('No list selected', 'Please select a shopping list first.');
      return;
    }

    setIsSharing(true);
    try {
      const result = await shareShoppingList(activeListId);
      await Share.share({
        message: `Join my shopping list: ${result.share_url}`,
        url: result.share_url,
      });
    } catch {
      Alert.alert('Sharing failed', 'Could not share this list. Please try again.');
    } finally {
      setIsSharing(false);
    }
  }, [activeListId]);

  const handleShareText = useCallback(async () => {
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

  if (!isAuthenticated && totalCount === 0) {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <Text style={s.headerTitle}>Shopping List</Text>
        </View>
        <View style={s.ctaWrap}>
          <ShoppingCartIcon color={colors.rule} size={64} />
          <Text style={s.ctaTitle}>Your shopping list</Text>
          <Text style={s.ctaSubtitle}>
            Sign in to create shopping lists, add ingredients from recipes, and share lists with others.
          </Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/settings')} style={s.ctaButton}>
            <Text style={s.ctaButtonText}>SIGN IN →</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (isAuthenticated && listLoading && totalCount === 0) {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <Text style={s.headerTitle}>Shopping List</Text>
        </View>
        <View style={s.ctaWrap}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </View>
    );
  }

  if (totalCount === 0) {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <View style={s.headerTitleRow}>
            <Text style={s.headerTitle}>Shopping List</Text>
            {isSharedList && (
              <View style={s.sharedBadge}>
                <Text style={s.sharedBadgeText}>SHARED</Text>
              </View>
            )}
          </View>
          <TouchableOpacity onPress={openAddSheet} style={s.addButton}>
            <Text style={s.addButtonText}>+ Add</Text>
          </TouchableOpacity>
        </View>
        <EmptyState
          icon={<ShoppingCartIcon color={colors.inkFaint} size={48} />}
          title="Your shopping list is empty"
          subtitle="Add ingredients from recipe pages"
        />
        <BottomSheet ref={bottomSheetRef} snapPoints={['30%']} onClose={() => setManualText('')}>
          <View style={s.sheetContent}>
            <Text style={s.sheetTitle}>Add item</Text>
            <TextInput
              style={s.textInput}
              placeholder="e.g. 2 cups flour"
              placeholderTextColor={colors.inkFaint}
              value={manualText}
              onChangeText={setManualText}
              onSubmitEditing={handleAddManual}
              returnKeyType="done"
              autoFocus
            />
            <TouchableOpacity onPress={handleAddManual} style={s.sheetButton}>
              <Text style={s.sheetButtonText}>Add to list</Text>
            </TouchableOpacity>
          </View>
        </BottomSheet>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={s.headerCompact}>
        <View style={s.headerTitleRow}>
          <Text style={s.headerTitle}>{activeList?.name ?? 'Shopping List'}</Text>
          {isSharedList && (
            <View style={s.sharedBadge}>
              <Text style={s.sharedBadgeText}>SHARED</Text>
            </View>
          )}
        </View>
        <TouchableOpacity onPress={openAddSheet} style={s.addButton}>
          <Text style={s.addButtonText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {/* List picker */}
      {lists.length > 1 && (
        <View style={{ marginBottom: 8 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
          >
            {lists.map((list) => {
              const isActive = list.id === activeListId;
              return (
                <TouchableOpacity
                  key={list.id}
                  onPress={() => selectList(list.id)}
                  style={[s.listChip, isActive && s.listChipActive]}
                >
                  <Text style={[s.listChipText, isActive && s.listChipTextActive]}>
                    {list.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {recipePills.length > 0 && (
        <View style={s.pillsRow}>
          {recipePills.map((pill) => (
            <TouchableOpacity
              key={pill.recipeId}
              onPress={() => handleRemoveRecipeItems(pill.recipeId)}
              style={s.pill}
            >
              <Text style={s.pillText}>{pill.recipeTitle}</Text>
              <Text style={s.pillClose}>{'\u2715'}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderSectionHeader={({ section: { title } }) => (
          <View style={s.sectionHeader}>
            <Text style={s.sectionHeaderText}>{title}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => toggle(item.id)} style={s.itemRow}>
            <View
              style={[
                s.checkbox,
                item.checked ? s.checkboxChecked : s.checkboxUnchecked,
              ]}
            >
              {item.checked && <Text style={s.checkmark}>{'\u2713'}</Text>}
            </View>
            <Text
              style={[
                s.itemText,
                item.checked && s.itemTextChecked,
              ]}
            >
              {item.text}
            </Text>
          </TouchableOpacity>
        )}
        stickySectionHeadersEnabled
        contentContainerStyle={{ paddingBottom: 120 }}
      />

      <View style={s.bottomBar}>
        {checkedCount > 0 && (
          <TouchableOpacity onPress={handleClearChecked} style={s.bottomAction}>
            <Text style={s.clearText}>Clear completed</Text>
          </TouchableOpacity>
        )}
        <View style={s.bottomBarRight}>
          <TouchableOpacity onPress={handleShareText} style={s.bottomAction}>
            <Text style={s.shareTextAction}>Share text</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleShareList}
            disabled={isSharing}
            style={[s.shareButton, isSharing && s.shareButtonDisabled]}
          >
            {isSharing ? (
              <ActivityIndicator size="small" color={colors.bg} />
            ) : (
              <Text style={s.shareButtonText}>Share list</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <BottomSheet ref={bottomSheetRef} snapPoints={['30%']} onClose={() => setManualText('')}>
        <View style={s.sheetContent}>
          <Text style={s.sheetTitle}>Add item</Text>
          <TextInput
            style={s.textInput}
            placeholder="e.g. 2 cups flour"
            placeholderTextColor={colors.inkFaint}
            value={manualText}
            onChangeText={setManualText}
            onSubmitEditing={handleAddManual}
            returnKeyType="done"
          />
          <TouchableOpacity onPress={handleAddManual} style={s.sheetButton}>
            <Text style={s.sheetButtonText}>Add to list</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
  },
  headerCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 8,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontFamily: fonts.display,
    fontSize: fontSizes['2xl'],
    color: colors.ink,
  },
  sharedBadge: {
    backgroundColor: colors.orangeLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  sharedBadgeText: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.xs,
    color: colors.orange,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  addButton: {
    backgroundColor: colors.orange,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.orangeLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pillText: {
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    color: colors.orange,
    marginRight: 4,
  },
  pillClose: {
    color: colors.orange,
    fontSize: fontSizes.xs,
  },
  sectionHeader: {
    backgroundColor: colors.bgMuted,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  sectionHeaderText: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.xs,
    color: colors.inkMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: colors.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: colors.bgMuted,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.orange,
    borderColor: colors.orange,
  },
  checkboxUnchecked: {
    borderColor: colors.inkFaint,
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: fontSizes.xs,
  },
  itemText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: fontSizes.base,
    color: colors.ink,
  },
  itemTextChecked: {
    textDecorationLine: 'line-through',
    color: colors.inkMuted,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.bgCard,
    borderTopWidth: 1,
    borderTopColor: colors.bgMuted,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bottomBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginLeft: 'auto',
  },
  bottomAction: {
    paddingVertical: 8,
  },
  clearText: {
    fontFamily: fonts.body,
    fontSize: fontSizes.base,
    color: colors.error,
  },
  shareTextAction: {
    fontFamily: fonts.body,
    fontSize: fontSizes.base,
    color: colors.inkMuted,
  },
  shareButton: {
    backgroundColor: colors.orange,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  shareButtonDisabled: {
    opacity: 0.6,
  },
  shareButtonText: {
    fontFamily: fonts.bodyMed,
    fontSize: fontSizes.sm,
    color: '#FFFFFF',
  },
  sheetContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  sheetTitle: {
    fontFamily: fonts.display,
    fontSize: fontSizes.lg,
    color: colors.ink,
    marginBottom: 12,
  },
  textInput: {
    borderWidth: 1,
    borderColor: colors.inkFaint,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontFamily: fonts.body,
    fontSize: fontSizes.base,
    color: colors.ink,
  },
  sheetButton: {
    backgroundColor: colors.orange,
    marginTop: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  sheetButtonText: {
    color: '#FFFFFF',
    fontFamily: fonts.bodyMed,
    fontSize: fontSizes.base,
  },
  ctaWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 48,
  },
  ctaTitle: {
    fontFamily: fonts.serif,
    fontSize: 24,
    color: colors.ink,
    textAlign: 'center',
    marginTop: 20,
  },
  ctaSubtitle: {
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.inkFaint,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 8,
  },
  ctaButton: {
    backgroundColor: colors.ink,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginTop: 24,
  },
  ctaButtonText: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
  listChip: {
    borderWidth: 1,
    borderColor: colors.rule,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  listChipActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  listChipText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.ink,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  listChipTextActive: {
    color: '#FFFFFF',
  },
});
