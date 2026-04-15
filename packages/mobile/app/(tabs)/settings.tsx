import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Share,
  StyleSheet,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { useSQLiteContext } from 'expo-sqlite';
import { usePreferences } from '@/hooks/usePreferences';
import { useShoppingList } from '@/hooks/useShoppingList';
import { colors, fonts } from '@/constants/theme';
import type { Theme, TextSize } from '@/stores/preferences.store';

const DIETARY_OPTIONS = ['Vegan', 'Vegetarian', 'Gluten-free', 'Dairy-free', 'Keto'];
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

  React.useEffect(() => {
    db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM saved_recipes')
      .then((row) => setDownloadedCount(row?.count ?? 0))
      .catch(() => setDownloadedCount(0));
  }, [db]);

  const cycleTextSize = () => {
    const idx = TEXT_SIZE_ORDER.indexOf(textSize);
    const next = TEXT_SIZE_ORDER[(idx + 1) % TEXT_SIZE_ORDER.length] ?? 'md';
    setTextSize(next);
  };

  const cycleTheme = () => {
    const idx = THEME_ORDER.indexOf(theme);
    const next = THEME_ORDER[(idx + 1) % THEME_ORDER.length] ?? 'system';
    setTheme(next);
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
          {DIETARY_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option}
              style={[
                styles.dietaryChip,
                dietaryFilters.includes(option) && styles.dietaryChipActive,
              ]}
              onPress={() => toggleDietary(option)}
            >
              <Text
                style={[
                  styles.dietaryChipText,
                  dietaryFilters.includes(option) && styles.dietaryChipTextActive,
                ]}
              >
                {option}
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
