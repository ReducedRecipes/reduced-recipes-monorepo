import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import type { RecipeSummary } from '@rr/shared';
import { colors, fonts } from '@/constants/theme';
import { BookmarkIcon } from './icons';

export interface RecipeCardProps {
  recipe: RecipeSummary;
  bookmarked?: boolean;
  onToggleBookmark?: (id: string) => void;
}

function formatTime(minutes: number | null): string | null {
  if (minutes == null || minutes <= 0) return null;
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function RecipeCard({ recipe, bookmarked = false, onToggleBookmark }: RecipeCardProps) {
  const router = useRouter();
  const time = formatTime(recipe.total_time ?? recipe.cook_time);

  return (
    <Pressable
      onPress={() => router.push(`/recipe/${recipe.id}`)}
      className="bg-white rounded-2xl overflow-hidden shadow-sm"
      style={{ minHeight: 44 }}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`View recipe: ${recipe.title}`}
    >
      {recipe.image_url && (
        <Image
          source={{ uri: recipe.image_url }}
          style={{ width: '100%', aspectRatio: 16 / 10 }}
          contentFit="cover"
          transition={200}
          recyclingKey={recipe.id}
        />
      )}

      <View className="p-3">
        <Text
          className="text-ink text-base leading-5"
          style={{ fontFamily: fonts.display }}
          numberOfLines={2}
        >
          {recipe.title}
        </Text>

        <View className="flex-row items-center justify-between mt-2">
          <View className="flex-row items-center gap-2">
            {recipe.domain ? (
              <Text
                className="text-xs px-2 py-0.5 rounded-full"
                style={{
                  fontFamily: fonts.body,
                  color: colors.inkMuted,
                  backgroundColor: colors.bgMuted,
                }}
              >
                {recipe.domain}
              </Text>
            ) : null}

            {time ? (
              <Text
                className="text-xs"
                style={{ fontFamily: fonts.body, color: colors.inkMuted }}
              >
                {time}
              </Text>
            ) : null}
          </View>

          {onToggleBookmark && (
            <Pressable
              onPress={() => onToggleBookmark(recipe.id)}
              hitSlop={12}
              style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
              accessible
              accessibilityRole="button"
              accessibilityLabel={bookmarked ? 'Remove bookmark' : 'Add bookmark'}
            >
              <BookmarkIcon
                color={bookmarked ? colors.orange : colors.inkFaint}
                size={20}
              />
            </Pressable>
          )}
        </View>
      </View>
    </Pressable>
  );
}
