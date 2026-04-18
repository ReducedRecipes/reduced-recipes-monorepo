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
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { BottomSheet, type BottomSheetRef } from '@/components/BottomSheet';
import {
  fetchCollections,
  createCollection,
  moveBookmark,
} from '@/lib/api';
import type { Collection } from '@rr/shared';
import { colors, fonts } from '@/constants/theme';

export interface CollectionSheetRef {
  open: (bookmarkRecipeId?: string) => void;
  close: () => void;
}

export interface CollectionSheetProps {
  onMoved?: (targetCollectionId: string) => void;
  onCreated?: (collection: Collection) => void;
}

export const CollectionSheet = forwardRef<
  CollectionSheetRef,
  CollectionSheetProps
>(function CollectionSheet({ onMoved, onCreated }, ref) {
  const sheetRef = useRef<BottomSheetRef>(null);
  const [visible, setVisible] = useState(false);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [movingTo, setMovingTo] = useState<string | null>(null);
  const [activeRecipeId, setActiveRecipeId] = useState<string | undefined>();

  useImperativeHandle(ref, () => ({
    open: (bookmarkRecipeId?: string) => {
      setActiveRecipeId(bookmarkRecipeId);
      setVisible(true);
      sheetRef.current?.expand();
    },
    close: () => {
      setVisible(false);
      sheetRef.current?.close();
    },
  }));

  const loadCollections = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchCollections();
      setCollections(res.items);
    } catch {
      // silently fail — user can retry by reopening
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      loadCollections();
    }
  }, [visible, loadCollections]);

  const handleCreate = useCallback(async () => {
    const trimmed = newName.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      const col = await createCollection({ name: trimmed });
      setCollections((prev) => [...prev, col]);
      setNewName('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onCreated?.(col);
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  }, [newName, creating, onCreated]);

  const handleMove = useCallback(
    async (targetId: string) => {
      if (!activeRecipeId || movingTo) return;
      setMovingTo(targetId);
      try {
        await moveBookmark(activeRecipeId, targetId);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onMoved?.(targetId);
        sheetRef.current?.close();
        setVisible(false);
      } catch {
        // ignore
      } finally {
        setMovingTo(null);
      }
    },
    [activeRecipeId, movingTo, onMoved],
  );

  const handleClose = useCallback(() => {
    setVisible(false);
    setNewName('');
  }, []);

  return (
    <BottomSheet
      ref={sheetRef}
      snapPoints={['50%']}
      index={visible ? 0 : -1}
      onClose={handleClose}
    >
      <ScrollView className="px-4 pb-6">
        <Text
          className="mb-4 text-xl text-ink"
          style={{ fontFamily: fonts.display }}
        >
          {activeRecipeId ? 'Move to Collection' : 'Collections'}
        </Text>

        {loading ? (
          <ActivityIndicator
            color={colors.orange}
            style={{ marginVertical: 24 }}
          />
        ) : (
          <>
            {collections.map((col) => (
              <Pressable
                key={col.id}
                onPress={() =>
                  activeRecipeId ? handleMove(col.id) : undefined
                }
                className="mb-2 flex-row items-center justify-between rounded-xl bg-bgMuted px-4 py-3"
                accessibilityRole="button"
                accessibilityLabel={col.name}
                disabled={!!movingTo}
              >
                <Text
                  className="text-base text-ink"
                  style={{ fontFamily: fonts.body }}
                >
                  {col.name}
                </Text>
                {movingTo === col.id && (
                  <ActivityIndicator size="small" color={colors.orange} />
                )}
              </Pressable>
            ))}

            {collections.length === 0 && !loading && (
              <Text
                className="mb-4 text-sm"
                style={{ fontFamily: fonts.body, color: colors.inkMuted }}
              >
                No collections yet. Create one below.
              </Text>
            )}

            {/* Create new collection */}
            <View className="mt-4 flex-row items-center gap-2">
              <TextInput
                className="flex-1 rounded-xl bg-bgMuted px-4 py-3 text-base text-ink"
                style={{ fontFamily: fonts.body }}
                placeholder="New collection name"
                placeholderTextColor={colors.inkFaint}
                value={newName}
                onChangeText={setNewName}
                onSubmitEditing={handleCreate}
                returnKeyType="done"
              />
              <Pressable
                onPress={handleCreate}
                disabled={!newName.trim() || creating}
                className={`rounded-xl px-4 py-3 ${
                  newName.trim() ? 'bg-orange' : 'bg-bgMuted'
                }`}
                accessibilityRole="button"
                accessibilityLabel="Create collection"
              >
                {creating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text
                    className={`text-base font-medium ${
                      newName.trim() ? 'text-white' : 'text-inkFaint'
                    }`}
                  >
                    Add
                  </Text>
                )}
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </BottomSheet>
  );
});
