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
import * as SQLite from 'expo-sqlite';
import { runMigrations } from '@/db/migrations';
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
  const [db, setDb] = useState<SQLite.SQLiteDatabase | null>(null);
  useEffect(() => {
    SQLite.openDatabaseAsync('recipes.db')
      .then(async (database) => {
        await runMigrations(database);
        setDb(database);
      })
      .catch(() => {});
  }, []);
  const [downloadedCount, setDownloadedCount] = useState<number | null>(null);

  // Auth state
  const sessionToken = useAuthStore((s) => s.sessionToken);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setSession = useAuthStore((s) => s.setSession);
  const clearSession = useAuthStore((s) => s.clearSession);
  const hydrateFromStorage = useAuthStore((s) => s.hydrateFromStorage);
  const [userInfo, setUserInfo] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const dietarySyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    hydrateFromStorage();
  }, [hydrateFromStorage]);

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
    if (!db) return;
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
      const returnTo = `${APP_SCHEME}://auth/callback`;
      const urlRes = await fetch(`${API_BASE}/auth/google/url?platform=mobile&return_to=${encodeURIComponent(returnTo)}`);
      if (!urlRes.ok) throw new Error('Failed to get auth URL');
      const { url } = (await urlRes.json()) as { url: string };

      const result = await WebBrowser.openAuthSessionAsync(url, returnTo);

      if (result.type === 'success' && result.url) {
        const parsed = new URL(result.url);
        const token = parsed.searchParams.get('token');
        if (token) {
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
      // Ignore logout API errors
    }
    clearSession();
    setUserInfo(null);
  };

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
      }).catch(() => {});
    },
    [sessionToken],
  );

  const handleToggleDietary = (filter: string) => {
    toggleDietary(filter);
    if (sessionToken) {
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
              await db?.runAsync('DELETE FROM saved_recipes');
              setDownloadedCount(0);
            } catch {}
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
        { text: 'Clear', style: 'destructive', onPress: () => clearAll() },
      ],
    );
  };

  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <ScrollView style={st.container} contentContainerStyle={st.content}>
      <Text style={st.title}>Settings</Text>

      {/* ACCOUNT */}
      <Text style={st.sectionHeader}>ACCOUNT</Text>
      <View style={st.section}>
        {isAuthenticated && userInfo ? (
          <>
            <View style={st.accountRow}>
              {userInfo.picture_url ? (
                <Image source={{ uri: userInfo.picture_url }} style={st.avatar} />
              ) : (
                <View style={[st.avatar, st.avatarPlaceholder]}>
                  <Text style={st.avatarInitial}>
                    {userInfo.name?.charAt(0)?.toUpperCase() || '?'}
                  </Text>
                </View>
              )}
              <View style={st.accountInfo}>
                <Text style={st.accountName}>{userInfo.name}</Text>
                <Text style={st.accountEmail}>{userInfo.email}</Text>
              </View>
            </View>
            <TouchableOpacity style={st.row} onPress={handleSignOut}>
              <Text style={[st.rowLabel, st.destructiveText]}>Sign Out</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={st.signInButton}
            onPress={handleSignIn}
            disabled={isLoading}
          >
            <Text style={st.signInText}>
              {isLoading ? 'Signing in…' : 'SIGN IN WITH GOOGLE →'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* PREFERENCES */}
      <Text style={st.sectionHeader}>PREFERENCES</Text>
      <View style={st.section}>
        <TouchableOpacity style={st.row} onPress={() => {}}>
          <Text style={st.rowLabel}>Dietary filters</Text>
          <Text style={st.rowValue}>
            {dietaryFilters.length > 0 ? dietaryFilters.join(', ') : 'None'}
          </Text>
        </TouchableOpacity>
        <View style={st.dietaryOptions}>
          {ALL_DIETARY_OPTIONS.map(({ key, label }) => (
            <TouchableOpacity
              key={key}
              style={[
                st.dietaryChip,
                dietaryFilters.includes(key) && st.dietaryChipActive,
              ]}
              onPress={() => handleToggleDietary(key)}
            >
              <Text
                style={[
                  st.dietaryChipText,
                  dietaryFilters.includes(key) && st.dietaryChipTextActive,
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={st.row}>
          <Text style={st.rowLabel}>Default serving size</Text>
          <View style={st.stepper}>
            <TouchableOpacity
              style={st.stepperButton}
              onPress={() => setDefaultServings(Math.max(1, defaultServings - 1))}
            >
              <Text style={st.stepperText}>−</Text>
            </TouchableOpacity>
            <Text style={st.stepperValue}>{defaultServings}</Text>
            <TouchableOpacity
              style={st.stepperButton}
              onPress={() => setDefaultServings(Math.min(20, defaultServings + 1))}
            >
              <Text style={st.stepperText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity style={st.row} onPress={cycleTextSize}>
          <Text style={st.rowLabel}>Text size</Text>
          <Text style={st.rowValue}>{TEXT_SIZE_LABELS[textSize]}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={st.row} onPress={cycleTheme}>
          <Text style={st.rowLabel}>Theme</Text>
          <Text style={st.rowValue}>{THEME_LABELS[theme]}</Text>
        </TouchableOpacity>
      </View>

      {/* NOTIFICATIONS */}
      <Text style={st.sectionHeader}>NOTIFICATIONS</Text>
      <View style={st.section}>
        <View style={st.row}>
          <Text style={st.rowLabel}>New recipes from saved sites</Text>
          <Switch value={false} disabled trackColor={{ true: colors.accent }} />
        </View>
        <View style={st.row}>
          <Text style={st.rowLabel}>Cooking reminders</Text>
          <Switch value={false} disabled trackColor={{ true: colors.accent }} />
        </View>
      </View>

      {/* DATA */}
      <Text style={st.sectionHeader}>DATA</Text>
      <View style={st.section}>
        <View style={st.row}>
          <Text style={st.rowLabel}>Downloaded recipes</Text>
          <Text style={st.rowValue}>
            {downloadedCount !== null ? `${downloadedCount}` : '…'}
          </Text>
        </View>
        <TouchableOpacity style={st.row} onPress={handleClearCache}>
          <Text style={[st.rowLabel, st.destructiveText]}>Clear offline cache</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.row} onPress={handleClearShoppingList}>
          <Text style={[st.rowLabel, st.destructiveText]}>Clear shopping list</Text>
        </TouchableOpacity>
      </View>

      {/* ABOUT */}
      <Text style={st.sectionHeader}>ABOUT</Text>
      <View style={st.section}>
        <View style={st.row}>
          <Text style={st.rowLabel}>Version</Text>
          <Text style={st.rowValue}>{version}</Text>
        </View>
        <TouchableOpacity
          style={st.row}
          onPress={() => WebBrowser.openBrowserAsync('https://reducedrecipes.com/privacy')}
        >
          <Text style={st.rowLabel}>Privacy Policy</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={st.row}
          onPress={() => WebBrowser.openBrowserAsync('https://reducedrecipes.com/remove')}
        >
          <Text style={st.rowLabel}>Request Recipe Removal</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.row} onPress={() => {}}>
          <Text style={st.rowLabel}>Rate the App</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const st = StyleSheet.create({
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
    fontFamily: fonts.serif,
    fontSize: 28,
    color: colors.ink,
    marginBottom: 24,
  },
  sectionHeader: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.inkFaint,
    letterSpacing: 1.5,
    marginTop: 24,
    marginBottom: 8,
  },
  section: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.rule,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
  },
  rowLabel: {
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.ink,
    flex: 1,
  },
  rowValue: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: colors.inkFaint,
    letterSpacing: 0.5,
  },
  destructiveText: {
    color: colors.error,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  avatarPlaceholder: {
    backgroundColor: colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontFamily: fonts.sansMedium,
    fontSize: 18,
    color: colors.accent,
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.ink,
  },
  accountEmail: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.inkFaint,
    marginTop: 2,
  },
  signInButton: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  signInText: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.accent,
    letterSpacing: 1,
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
    borderWidth: 1,
    borderColor: colors.rule,
  },
  dietaryChipActive: {
    backgroundColor: colors.accentLight,
    borderColor: colors.accent,
  },
  dietaryChipText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.inkFaint,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  dietaryChipTextActive: {
    color: colors.accent,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepperButton: {
    width: 32,
    height: 32,
    borderWidth: 1,
    borderColor: colors.rule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperText: {
    fontFamily: fonts.sansMedium,
    fontSize: 18,
    color: colors.ink,
  },
  stepperValue: {
    fontFamily: fonts.mono,
    fontSize: 15,
    color: colors.ink,
    minWidth: 20,
    textAlign: 'center',
  },
});
