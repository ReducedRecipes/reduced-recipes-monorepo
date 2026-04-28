import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { joinSharedList } from '@/lib/api';
import { useShoppingStore } from '@/stores/shopping.store';
import { colors, fonts, fontSizes } from '@/constants/theme';

type Status = 'loading' | 'success' | 'error';

export default function SharedListScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();

  const [status, setStatus] = useState<Status>('loading');
  const [listName, setListName] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const fetchLists = useShoppingStore((s) => s.fetchLists);
  const selectList = useShoppingStore((s) => s.selectList);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMessage('Invalid share link.');
      return;
    }

    let cancelled = false;

    async function join() {
      try {
        const result = await joinSharedList(token!);
        if (cancelled) return;

        if (result.success) {
          setListName(result.list_name);
          setStatus('success');

          // Refresh lists and select the joined list
          await fetchLists();
          await selectList(result.list_id);

          // Navigate to the shopping list tab
          router.replace('/(tabs)/list');
        } else {
          setStatus('error');
          setErrorMessage('Could not join this list.');
        }
      } catch (err) {
        if (cancelled) return;
        setStatus('error');
        setErrorMessage(
          err instanceof Error ? err.message : 'Something went wrong.',
        );
      }
    }

    join();

    return () => {
      cancelled = true;
    };
  }, [token, fetchLists, selectList, router]);

  if (status === 'loading') {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={colors.orange} />
        <Text style={s.loadingText}>Joining shared list...</Text>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={s.center}>
        <Text style={s.errorTitle}>Unable to join list</Text>
        <Text style={s.errorMessage}>{errorMessage}</Text>
        <TouchableOpacity
          onPress={() => router.replace('/(tabs)/list')}
          style={s.button}
        >
          <Text style={s.buttonText}>Go to my lists</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // success state (brief flash before redirect)
  return (
    <View style={s.center}>
      <Text style={s.successTitle}>Joined "{listName}"</Text>
      <Text style={s.successSub}>Redirecting to your shopping list...</Text>
    </View>
  );
}

const s = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  loadingText: {
    fontFamily: fonts.body,
    fontSize: fontSizes.base,
    color: colors.inkMuted,
    marginTop: 16,
  },
  errorTitle: {
    fontFamily: fonts.display,
    fontSize: fontSizes.xl,
    color: colors.ink,
    marginBottom: 8,
  },
  errorMessage: {
    fontFamily: fonts.body,
    fontSize: fontSizes.base,
    color: colors.inkMuted,
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    backgroundColor: colors.orange,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  buttonText: {
    fontFamily: fonts.bodyMed,
    fontSize: fontSizes.base,
    color: '#FFFFFF',
  },
  successTitle: {
    fontFamily: fonts.display,
    fontSize: fontSizes.xl,
    color: colors.ink,
    marginBottom: 8,
  },
  successSub: {
    fontFamily: fonts.body,
    fontSize: fontSizes.base,
    color: colors.inkMuted,
  },
});
