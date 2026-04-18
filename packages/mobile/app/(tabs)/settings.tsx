import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Image,
  StyleSheet,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { useSQLiteContext } from 'expo-sqlite';
import { usePreferences } from '@/hooks/usePreferences';
import { useShoppingList } from '@/hooks/useShoppingList';
import { colors, fonts } from '@/constants/theme';
import type { Theme, TextSize } from '@/stores/preferences.store';
import { useAuthStore } from '@/stores/auth.store';
import { DIETARY_LABELS, type DietaryRestriction } from '@rr/shared/dietary';
import type { User } from '@rr/shared';

const API_BASE = `${process.env.EXPO_PUBLIC_API_BASE || 'https://reducedrecipes.com'}/api/v1`;
const APP_SCHEME = 'reducedrecipes';

const ALL_DIETARY_OPTIONS = Object.entries(DIETARY_LABELS).map(([key, label]) => ({
  key: key as DietaryRestriction,
  label,
}));

const TEXT_SIZE_LABELS: Record<TextSize, string> = { sm: 'Small', md: 'Medium', lg: 'Large', xl: 'Extra Large' };
const TEXT_SIZE_ORDER: TextSize[] = ['sm', 'md', 'lg', 'xl'];
const THEME_ORDER: Theme[] = ['system', 'light', 'dark'];
const THEME_LABELS: Record<Theme, string> = { system: 'System', light: 'Light', dark: 'Dark' };

export default function SettingsScreen() {
  const {
    theme,
    textSize,
    defaultServings,
    dietaryFilters,
    setTheme,
    setTextSize,
    setDefaultServings,
    toggleDietary,
  } = usePreferences();
  const { clearAll } = useShoppingList();
  const db = useSQLiteContext();
  const [downloadedCount, setDownloadedCount] = useState<number | null>(null);

  // Auth state
  const sessionToken = useAuthStore((s) => s.sessionToken);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setSession = useAuthStore((s) => s.setSession);
  const clearSession = useAuthStore((s) => s.clearSession);
  const hydrateFromStorage = useAuthStore((s) => s.hydrateFromStorage);
  const [userInfo, setUserInfo] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Debounce timer for dietary sync
  const dietarySyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate auth on mount
  useEffect(() => {
    hydrateFromStorage();
  }, [hydrateFromStorage]);

  // Fetch user info when authenticated
  useEffect(() => {
    if (!sessionToken) {
      setUserInfo(null);
      return;
    }
    fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Not authenticated');
        return res.json() as Promise<{ user: User }>;
      })
      .then((data) => setUserInfo(data.user))
      .catch(() => {
        setUserInfo(null);
      });
  }, [sessionToken]);

  useEffect(() => {
    db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM saved_recipes')
      .then((row) => setDownloadedCount(row?.count ?? 0))
      .catch(() => setDownloadedCount(0));
  }, [db]);

  const cycleTextSize = () => {
    const idx = TEXT_SIZE_ORDER.indexOf(textSize);
    setTextSize(TEXT_SIZE_ORDER[(idx + 1) % TEXT_SIZE_ORDER.length]!);
  };

  const cycleTheme = () => {
    const idx = THEME_ORDER.indexOf(theme);
    setTheme(THEME_ORDER[(idx + 1) % THEME_ORDER.length]!);
  };

  const handleSignIn = async () => {
    setIsLoading(true);
    try {
      const urlRes = await fetch(`${API_BASE}/auth/google/url?platform=mobile`);
      if (!urlRes.ok) throw new Error('Failed to get auth URL');
      const { url } = (await urlRes.json()) as { url: string };

      const redirectUrl = `${APP_SCHEME}://auth/callback`;
      const result = await WebBrowser.openAuthSessionAsync(url, redirectUrl);

      if (result.type === 'success' && result.url) {
        const parsed = new URL(result.url);
        const token = parsed.searchParams.get('token');
        if (token) {
          // Fetch user info with the token
          const meRes = await fetch(`${API_BASE}/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (meRes.ok) {
            const data = (await meRes.json()) as { user: User };
            setSession(token, data.user);
          }
        }
      }
    } catch {
      Alert.alert('Sign In Failed', 'Could not complete sign in. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      if (sessionToken) {
        await fetch(`${API_BASE}/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${sessionToken}` },
        });
      }
    } catch {
      // Ignore logout API errors — clear local state regardless
    }
    clearSession();
    setUserInfo(null);
  };

  // Sync dietary preferences to server when authenticated
  const syncDietaryToServer = useCallback(
    (filters: string[]) => {
      if (!sessionToken) return;
      fetch(`${API_BASE}/users/me/dietary-preferences`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ restrictions: filters }),
      }).catch(() => {
        // Silent fail — local state is still saved via MMKV
      });
    },
    [sessionToken],
  );

  const handleToggleDietary = (filter: string) => {
    toggleDietary(filter);

    if (sessionToken) {
      // Debounce server sync
      if (dietarySyncTimer.current) clearTimeout(dietarySyncTimer.current);
      const newFilters = dietaryFilters.includes(filter)
        ? dietaryFilters.filter((f) => f !== filter)
        : [...dietaryFilters, filter];
      dietarySyncTimer.current = setTimeout(() => syncDietaryToServer(newFilters), 500);
    }
  };

  const handleClearCache = () => {
    Alert.alert(
      'Clear offline cache',
      'This will remove all downloaded recipes. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await db.runAsync('DELETE FROM saved_recipes');
              setDownloadedCount(0);
            } catch {
              // ignore
            }
          },
        },
      ],
    );
  };

  const handleClearShoppingList = () => {
    Alert.alert(
      'Clear shopping list',
      'This will remove all items from your shopping list. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => clearAll(),
        },
      ],
    );
  };

  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Settings</Text>

      {/* ACCOUNT */}
      <Text style={styles.sectionHeader}>ACCOUNT</Text>
      <View style={styles.section}>
        {isAuthenticated && userInfo ? (
          <>
            <View style={styles.accountRow}>
              {userInfo.picture_url ? (
                <Image source={{ uri: userInfo.picture_url }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Text style={styles.avatarInitial}>
                    {userInfo.name?.charAt(0)?.toUpperCase() || '?'}
                  </Text>
                </View>
              )}
              <View style={styles.accountInfo}>
                <Text style={styles.accountName}>{userInfo.name}</Text>
                <Text style={styles.accountEmail}>{userInfo.email}</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.row} onPress={handleSignOut}>
              <Text style={[styles.rowLabel, styles.destructiveText]}>Sign Out</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={styles.signInButton}
            onPress={handleSignIn}
            disabled={isLoading}
          >
            <Text style={styles.signInText}>
              {isLoading ? 'Signing in…' : 'Sign in with Google'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* PREFERENCES */}
      <Text style={styles.sectionHeader}>PREFERENCES</Text>
      <View style={styles.section}>
        <TouchableOpacity style={styles.row} onPress={() => {}}>
          <Text style={styles.rowLabel}>Dietary filters</Text>
          <Text style={styles.rowValue}>
            {dietaryFilters.length > 0 ? dietaryFilters.join(', ') : 'None'}
          </Text>
        </TouchableOpacity>
        <View style={styles.dietaryOptions}>
          {ALL_DIETARY_OPTIONS.map(({ key, label }) => (
            <TouchableOpacity
              key={key}
              style={[
                styles.dietaryChip,
                dietaryFilters.includes(key) && styles.dietaryChipActive,
              ]}
              onPress={() => handleToggleDietary(key)}
            >
              <Text
                style={[
                  styles.dietaryChipText,
                  dietaryFilters.includes(key) && styles.dietaryChipTextActive,
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>Default serving size</Text>
          <View style={styles.stepper}>
            <TouchableOpacity
              style={styles.stepperButton}
              onPress={() => setDefaultServings(Math.max(1, defaultServings - 1))}
            >
              <Text style={styles.stepperText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.stepperValue}>{defaultServings}</Text>
            <TouchableOpacity
              style={styles.stepperButton}
              onPress={() => setDefaultServings(Math.min(20, defaultServings + 1))}
            >
              <Text style={styles.stepperText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity style={styles.row} onPress={cycleTextSize}>
          <Text style={styles.rowLabel}>Text size</Text>
          <Text style={styles.rowValue}>{TEXT_SIZE_LABELS[textSize]}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.row} onPress={cycleTheme}>
          <Text style={styles.rowLabel}>Theme</Text>
          <Text style={styles.rowValue}>{THEME_LABELS[theme]}</Text>
        </TouchableOpacity>
      </View>

      {/* NOTIFICATIONS */}
      <Text style={styles.sectionHeader}>NOTIFICATIONS</Text>
      <View style={styles.section}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>New recipes from saved sites</Text>
          <Switch value={false} disabled />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Cooking reminders</Text>
          <Switch value={false} disabled />
        </View>
      </View>

      {/* DATA */}
      <Text style={styles.sectionHeader}>DATA</Text>
      <View style={styles.section}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Downloaded recipes</Text>
          <Text style={styles.rowValue}>
            {downloadedCount !== null ? `${downloadedCount}` : '…'}
          </Text>
        </View>
        <TouchableOpacity style={styles.row} onPress={handleClearCache}>
          <Text style={[styles.rowLabel, styles.destructiveText]}>Clear offline cache</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.row} onPress={handleClearShoppingList}>
          <Text style={[styles.rowLabel, styles.destructiveText]}>Clear shopping list</Text>
        </TouchableOpacity>
      </View>

      {/* ABOUT */}
      <Text style={styles.sectionHeader}>ABOUT</Text>
      <View style={styles.section}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Version</Text>
          <Text style={styles.rowValue}>{version}</Text>
        </View>
        <TouchableOpacity
          style={styles.row}
          onPress={() => WebBrowser.openBrowserAsync('https://reducedrecipes.com/privacy')}
        >
          <Text style={styles.rowLabel}>Privacy Policy</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.row}
          onPress={() => WebBrowser.openBrowserAsync('https://reducedrecipes.com/remove')}
        >
          <Text style={styles.rowLabel}>Request Recipe Removal</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.row} onPress={() => {}}>
          <Text style={styles.rowLabel}>Rate the App</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 40,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 28,
    color: colors.ink,
    marginBottom: 24,
  },
  sectionHeader: {
    fontFamily: fonts.bodyMed,
    fontSize: 12,
    color: colors.inkMuted,
    letterSpacing: 1,
    marginTop: 24,
    marginBottom: 8,
  },
  section: {
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.bgMuted,
  },
  rowLabel: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
    flex: 1,
  },
  rowValue: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.inkMuted,
  },
  destructiveText: {
    color: colors.error,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.bgMuted,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  avatarPlaceholder: {
    backgroundColor: colors.orangeLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontFamily: fonts.bodyMed,
    fontSize: 18,
    color: colors.orange,
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    fontFamily: fonts.bodyMed,
    fontSize: 16,
    color: colors.ink,
  },
  accountEmail: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkMuted,
    marginTop: 2,
  },
  signInButton: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  signInText: {
    fontFamily: fonts.bodyMed,
    fontSize: 15,
    color: colors.orange,
  },
  dietaryOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  dietaryChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.bgMuted,
  },
  dietaryChipActive: {
    backgroundColor: colors.orangeLight,
  },
  dietaryChipText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkMuted,
  },
  dietaryChipTextActive: {
    color: colors.orange,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepperButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.bgMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperText: {
    fontFamily: fonts.bodyMed,
    fontSize: 18,
    color: colors.ink,
  },
  stepperValue: {
    fontFamily: fonts.bodyMed,
    fontSize: 15,
    color: colors.ink,
    minWidth: 20,
    textAlign: 'center',
  },
});
