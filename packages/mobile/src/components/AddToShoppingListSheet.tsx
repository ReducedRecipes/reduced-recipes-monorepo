import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { BottomSheet, type BottomSheetRef } from '@/components/BottomSheet';
import {
  addRecipeToList,
  createShoppingList,
  fetchShoppingLists,
} from '@/lib/api';
import type { ShoppingList } from '@rr/shared';
import { colors, fonts } from '@/constants/theme';

type ListWithRecipeIds = ShoppingList & { recipe_ids?: string | null };

export interface AddToShoppingListSheetRef {
  open: (args: {
    recipeId: string;
    recipeTitle: string;
    ingredients: string[];
  }) => void;
  close: () => void;
}

export interface AddToShoppingListSheetProps {
  onAdded?: (listId: string, listName: string) => void;
}

export const AddToShoppingListSheet = forwardRef<
  AddToShoppingListSheetRef,
  AddToShoppingListSheetProps
>(function AddToShoppingListSheet({ onAdded }, ref) {
  const sheetRef = useRef<BottomSheetRef>(null);
  const [visible, setVisible] = useState(false);
  const [lists, setLists] = useState<ListWithRecipeIds[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [creatingForm, setCreatingForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<{
    recipeId: string;
    recipeTitle: string;
    ingredients: string[];
  } | null>(null);

  useImperativeHandle(ref, () => ({
    open: (args) => {
      setTarget(args);
      setError(null);
      setCreatingForm(false);
      setNewName('');
      setVisible(true);
      sheetRef.current?.expand();
    },
    close: () => {
      setVisible(false);
      sheetRef.current?.close();
    },
  }));

  const loadLists = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchShoppingLists();
      setLists(res.items as ListWithRecipeIds[]);
    } catch {
      setError('Could not load your shopping lists');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) loadLists();
  }, [visible, loadLists]);

  const handleAdd = useCallback(
    async (listId: string, listName: string) => {
      if (!target || addingTo) return;
      setAddingTo(listId);
      setError(null);
      try {
        const res = await addRecipeToList(listId, {
          recipe_id: target.recipeId,
          ingredients: target.ingredients,
        });
        if (res.already_added) {
          setError('Ingredients already on this list');
          return;
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onAdded?.(listId, listName);
        setVisible(false);
        sheetRef.current?.close();
      } catch {
        setError('Could not add ingredients. Try again.');
      } finally {
        setAddingTo(null);
      }
    },
    [target, addingTo, onAdded],
  );

  const handleCreateAndAdd = useCallback(async () => {
    if (!target || creating) return;
    const name = newName.trim() || target.recipeTitle;
    setCreating(true);
    setError(null);
    try {
      const list = await createShoppingList({ name });
      const res = await addRecipeToList(list.id, {
        recipe_id: target.recipeId,
        ingredients: target.ingredients,
      });
      if (res.already_added) {
        setError('Ingredients already on this list');
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onAdded?.(list.id, name);
      setVisible(false);
      sheetRef.current?.close();
    } catch {
      setError('Could not create list. Try again.');
    } finally {
      setCreating(false);
    }
  }, [target, creating, newName, onAdded]);

  const handleClose = useCallback(() => {
    setVisible(false);
    setCreatingForm(false);
    setNewName('');
    setError(null);
  }, []);

  return (
    <BottomSheet
      ref={sheetRef}
      index={visible ? 0 : -1}
      onClose={handleClose}
    >
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={s.title}>Add to shopping list</Text>

        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginVertical: 24 }} />
        ) : (
          <>
            {lists.map((list) => {
              const recipeIds = (list.recipe_ids ?? '').split(',').filter(Boolean);
              const already = target ? recipeIds.includes(target.recipeId) : false;
              const isAdding = addingTo === list.id;
              return (
                <Pressable
                  key={list.id}
                  onPress={() => handleAdd(list.id, list.name)}
                  disabled={isAdding || !!addingTo}
                  style={[s.row, isAdding && s.rowDisabled]}
                  accessibilityRole="button"
                  accessibilityLabel={`Add to ${list.name}`}
                >
                  <Text style={s.rowName} numberOfLines={1}>{list.name}</Text>
                  {isAdding ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : already ? (
                    <Text style={s.rowHint}>✓ Added</Text>
                  ) : (
                    <Text style={s.rowArrow}>→</Text>
                  )}
                </Pressable>
              );
            })}

            {lists.length === 0 && (
              <Text style={s.empty}>No lists yet. Create one below.</Text>
            )}

            <View style={s.createSection}>
              {creatingForm ? (
                <View>
                  <TextInput
                    style={s.input}
                    placeholder={target?.recipeTitle ?? 'New list'}
                    placeholderTextColor={colors.inkFaint}
                    value={newName}
                    onChangeText={setNewName}
                    onSubmitEditing={handleCreateAndAdd}
                    returnKeyType="done"
                    autoFocus
                  />
                  <Pressable
                    onPress={handleCreateAndAdd}
                    disabled={creating}
                    style={[s.primaryBtn, creating && s.rowDisabled]}
                    accessibilityRole="button"
                    accessibilityLabel="Create list and add ingredients"
                  >
                    {creating ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={s.primaryBtnText}>CREATE & ADD</Text>
                    )}
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={() => setCreatingForm(true)}
                  style={s.createBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Create new shopping list"
                >
                  <Text style={s.createBtnText}>+ Create new list</Text>
                </Pressable>
              )}
            </View>

            {error && <Text style={s.error}>{error}</Text>}
          </>
        )}
      </ScrollView>
    </BottomSheet>
  );
});

const s = StyleSheet.create({
  scroll: {
    maxHeight: 480,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 22,
    color: colors.ink,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.rule,
    marginBottom: 8,
  },
  rowDisabled: {
    opacity: 0.5,
  },
  rowName: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.ink,
    marginRight: 12,
  },
  rowHint: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.inkFaint,
    letterSpacing: 0.5,
  },
  rowArrow: {
    fontFamily: fonts.mono,
    fontSize: 16,
    color: colors.accent,
  },
  empty: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.inkFaint,
    paddingVertical: 12,
  },
  createSection: {
    marginTop: 12,
  },
  createBtn: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.rule,
    borderStyle: 'dashed',
  },
  createBtnText: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.accent,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.rule,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.ink,
    marginBottom: 8,
  },
  primaryBtn: {
    backgroundColor: colors.ink,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
  error: {
    marginTop: 12,
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.accent,
  },
});
