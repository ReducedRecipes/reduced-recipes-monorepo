import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Link, Stack } from 'expo-router';
import { colors, fonts, fontSizes, spacing } from '@/constants/theme';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not Found' }} />
      <View style={styles.container}>
        <Text style={styles.title}>Page not found</Text>
        <Text style={styles.subtitle}>
          The page you're looking for doesn't exist.
        </Text>
        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Go to home</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    padding: spacing[6],
  },
  title: {
    fontFamily: fonts.display,
    fontSize: fontSizes['2xl'],
    color: colors.ink,
    marginBottom: spacing[2],
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: fontSizes.base,
    color: colors.inkMuted,
    textAlign: 'center',
    marginBottom: spacing[6],
  },
  link: {
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[6],
  },
  linkText: {
    fontFamily: fonts.bodyMed,
    fontSize: fontSizes.base,
    color: colors.orange,
  },
});
