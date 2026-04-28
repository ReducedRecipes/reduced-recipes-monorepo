import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import type { RecipeSummary } from '@rr/shared';
import { colors, fonts } from '@/constants/theme';
import { HeartIcon } from './icons';
import { useHeart } from '@/hooks/useHeart';

export interface RecipeCardProps {
  recipe: RecipeSummary;
}

function formatTime(minutes: number | null): string | null {
  if (minutes == null || minutes <= 0) return null;
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function RecipeCard({ recipe }: RecipeCardProps) {
  const router = useRouter();
  const time = formatTime(recipe.total_time ?? recipe.cook_time);
  const heart = useHeart(recipe.id, recipe.vote_count);

  return (
    <Pressable
      onPress={() => router.push(`/recipe/${recipe.id}`)}
      style={s.card}
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
              <Text style={s.domain} numberOfLines={1}>{recipe.domain}</Text>
            ) : null}
            {time ? (
              <Text style={s.time}>{time}</Text>
            ) : null}
          </View>

          <Pressable
            onPress={heart.toggle}
            hitSlop={8}
            style={s.heartBtn}
            accessible
            accessibilityRole="button"
            accessibilityLabel={heart.hearted ? 'Unlike recipe' : 'Like recipe'}
          >
            <HeartIcon
              color={heart.hearted ? colors.accent : colors.inkFaint}
              size={16}
              filled={heart.hearted}
            />
            {heart.count > 0 && (
              <Text style={[s.heartCount, heart.hearted && { color: colors.accent }]}>
                {heart.count}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.rule,
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
    fontFamily: fonts.serif,
    fontSize: 16,
    lineHeight: 22,
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
    flex: 1,
  },
  domain: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.inkFaint,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flexShrink: 1,
  },
  time: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.inkFaint,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  heartBtn: {
    minWidth: 36,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 3,
  },
  heartCount: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.inkFaint,
    letterSpacing: 0.5,
  },
});
