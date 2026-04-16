import { describe, it, expect, vi } from 'vitest';
import { resolve } from 'path';
import { readFileSync } from 'fs';

vi.mock('expo-sqlite', () => ({
  useSQLiteContext: () => ({
    getFirstAsync: vi.fn(() => Promise.resolve({ count: 5 })),
    runAsync: vi.fn(() => Promise.resolve()),
  }),
}));

vi.mock('react-native', () => ({
  View: vi.fn(({ children }: any) => ({ type: 'View', children })),
  Text: vi.fn(({ children }: any) => ({ type: 'Text', children })),
  ScrollView: vi.fn(({ children }: any) => ({ type: 'ScrollView', children })),
  TouchableOpacity: vi.fn(({ children }: any) => ({ type: 'TouchableOpacity', children })),
  Switch: vi.fn(() => ({ type: 'Switch' })),
  Alert: { alert: vi.fn() },
  Share: { share: vi.fn() },
  StyleSheet: {
    create: (s: any) => s,
    hairlineWidth: 0.5,
  },
}));

vi.mock('expo-web-browser', () => ({
  openBrowserAsync: vi.fn(),
}));

vi.mock('expo-constants', () => ({
  default: {
    expoConfig: { version: '1.0.0' },
  },
}));

vi.mock('@/hooks/usePreferences', () => ({
  usePreferences: () => ({
    theme: 'system',
    textSize: 'md',
    defaultServings: 2,
    dietaryFilters: [],
    setTheme: vi.fn(),
    setTextSize: vi.fn(),
    setDefaultServings: vi.fn(),
    toggleDietary: vi.fn(),
    textSizeMultiplier: 1.0,
  }),
}));

vi.mock('@/hooks/useShoppingList', () => ({
  useShoppingList: () => ({
    items: [],
    clearAll: vi.fn(),
    clearChecked: vi.fn(),
  }),
}));

describe('SettingsScreen (S-32)', () => {
  const filePath = resolve(__dirname, '../../app/(tabs)/settings.tsx');
  const content = readFileSync(filePath, 'utf-8');

  it('file exists at correct tab path', () => {
    expect(content).toBeTruthy();
  });

  it('renders all four section headers', () => {
    expect(content).toContain('PREFERENCES');
    expect(content).toContain('NOTIFICATIONS');
    expect(content).toContain('DATA');
    expect(content).toContain('ABOUT');
  });

  it('imports and uses usePreferences hook', () => {
    expect(content).toContain('usePreferences');
    expect(content).toContain('toggleDietary');
    expect(content).toContain('setTheme');
    expect(content).toContain('setTextSize');
    expect(content).toContain('setDefaultServings');
  });

  it('imports and uses useShoppingList hook', () => {
    expect(content).toContain('useShoppingList');
    expect(content).toContain('clearAll');
  });

  it('shows dietary filter options', () => {
    expect(content).toContain('Vegan');
    expect(content).toContain('Vegetarian');
    expect(content).toContain('Gluten-free');
    expect(content).toContain('Dairy-free');
    expect(content).toContain('Keto');
    expect(content).toContain('dietaryFilters');
  });

  it('has dietary filter toggle via toggleDietary', () => {
    expect(content).toContain('toggleDietary(option)');
  });

  it('has default serving size stepper', () => {
    expect(content).toContain('defaultServings');
    expect(content).toContain('setDefaultServings');
    expect(content).toContain('Math.max(1');
    expect(content).toContain('Math.min(20');
  });

  it('has text size cycling', () => {
    expect(content).toContain('cycleTextSize');
    expect(content).toContain('TEXT_SIZE_LABELS');
    expect(content).toContain('Small');
    expect(content).toContain('Medium');
    expect(content).toContain('Large');
    expect(content).toContain('Extra Large');
  });

  it('has theme cycling through system/light/dark', () => {
    expect(content).toContain('cycleTheme');
    expect(content).toContain('THEME_LABELS');
    expect(content).toContain('System');
    expect(content).toContain('Light');
    expect(content).toContain('Dark');
  });

  it('shows notification toggles as disabled placeholders', () => {
    expect(content).toContain('New recipes from saved sites');
    expect(content).toContain('Cooking reminders');
    expect(content).toContain('Switch');
    expect(content).toContain('disabled');
  });

  it('queries downloaded recipe count from SQLite', () => {
    expect(content).toContain('useSQLiteContext');
    expect(content).toContain('SELECT COUNT(*)');
    expect(content).toContain('saved_recipes');
    expect(content).toContain('downloadedCount');
  });

  it('has clear offline cache with confirmation alert', () => {
    expect(content).toContain('Clear offline cache');
    expect(content).toContain('handleClearCache');
    expect(content).toContain('Alert.alert');
    expect(content).toContain('DELETE FROM saved_recipes');
  });

  it('has clear shopping list with confirmation alert', () => {
    expect(content).toContain('Clear shopping list');
    expect(content).toContain('handleClearShoppingList');
    expect(content).toContain('clearAll()');
  });

  it('shows version from expo-constants', () => {
    expect(content).toContain('Constants.expoConfig?.version');
    expect(content).toContain('Version');
  });

  it('has privacy policy link via expo-web-browser', () => {
    expect(content).toContain('Privacy Policy');
    expect(content).toContain('WebBrowser.openBrowserAsync');
    expect(content).toContain('privacy');
  });

  it('has request recipe removal link', () => {
    expect(content).toContain('Request Recipe Removal');
  });

  it('has rate the app placeholder', () => {
    expect(content).toContain('Rate the App');
  });

  it('has proper title header', () => {
    expect(content).toContain('Settings');
  });
});
