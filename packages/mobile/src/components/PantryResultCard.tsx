import { Link } from 'expo-router';
import { View, Text, Image, StyleSheet } from 'react-native';
import { colors, fonts } from '@/constants/theme';
import type { PantryRecipeResult } from '@rr/shared/pantry';

export function PantryResultCard({ recipe }: { recipe: PantryRecipeResult }) {
  const pct = recipe.match.total > 0 ? Math.round((recipe.match.have / recipe.match.total) * 100) : 0;
  return (
    <Link href={`/recipe/${recipe.id}`} asChild>
      <View style={s.row}>
        {recipe.image_url ? (
          <Image source={{ uri: recipe.image_url }} style={s.thumb} />
        ) : (
          <View style={[s.thumb, s.thumbFallback]} />
        )}
        <View style={s.body}>
          <Text style={s.title} numberOfLines={2}>{recipe.title}</Text>
          {recipe.match.missing.length > 0 && (
            <Text style={s.missing} numberOfLines={1}>
              Need: {recipe.match.missing.slice(0, 3).join(', ')}
              {recipe.match.missing.length > 3 ? ` +${recipe.match.missing.length - 3}` : ''}
            </Text>
          )}
          <Text style={s.meta}>{recipe.domain} · {pct}% match</Text>
        </View>
      </View>
    </Link>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.rule },
  thumb: { width: 88, height: 72 },
  thumbFallback: { backgroundColor: colors.accentLight },
  body: { flex: 1, justifyContent: 'center' },
  title: { fontFamily: fonts.serif, fontSize: 18, color: colors.ink, lineHeight: 22 },
  missing: { fontFamily: fonts.mono, fontSize: 11, color: colors.accent, marginTop: 2 },
  meta: { fontFamily: fonts.mono, fontSize: 10, color: colors.ink2, marginTop: 4, textTransform: 'uppercase' },
});
