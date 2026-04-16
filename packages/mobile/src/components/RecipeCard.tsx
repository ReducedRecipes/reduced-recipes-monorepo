import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import type { RecipeSummary } from '@rr/shared';
import { colors, fonts, shadow } from '@/constants/theme';
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
      style={[s.card, shadow.sm]}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`View recipe: ${recipe.title}`}
    >
      {recipe.image_url && (
        <Image
          source={{ uri: recipe.image_url }}
          style={s.image}
          contentFit="cover"
          transition={200}
          recyclingKey={recipe.id}
        />
      )}

      <View style={s.body}>
        <Text style={s.title} numberOfLines={2}>
          {recipe.title}
        </Text>

        <View style={s.meta}>
          <View style={s.metaLeft}>
            {recipe.domain ? (
              <Text style={s.domain}>{recipe.domain}</Text>
            ) : null}
            {time ? (
              <Text style={s.time}>{time}</Text>
            ) : null}
          </View>

          {onToggleBookmark && (
            <Pressable
              onPress={() => onToggleBookmark(recipe.id)}
              hitSlop={12}
              style={s.bookmarkBtn}
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

const s = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    aspectRatio: 16 / 10,
  },
  body: {
    padding: 12,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 15,
    lineHeight: 20,
    color: colors.ink,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  metaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  domain: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.inkMuted,
    backgroundColor: colors.bgMuted,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 99,
    overflow: 'hidden',
  },
  time: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.inkMuted,
  },
  bookmarkBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
