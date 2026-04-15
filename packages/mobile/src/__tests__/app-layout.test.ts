import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const appDir = resolve(__dirname, '../../app');

function readFile(relativePath: string): string {
  return readFileSync(resolve(appDir, relativePath), 'utf8');
}

describe('app/_layout.tsx (root layout)', () => {
  const content = readFile('_layout.tsx');

  it('exists', () => {
    expect(existsSync(resolve(appDir, '_layout.tsx'))).toBe(true);
  });

  it('wraps with QueryClientProvider', () => {
    expect(content).toContain('QueryClientProvider');
    expect(content).toContain('QueryClient');
  });

  it('configures QueryClient with offlineFirst networkMode', () => {
    expect(content).toContain("networkMode: 'offlineFirst'");
  });

  it('configures QueryClient with 5min staleTime', () => {
    expect(content).toContain('staleTime: 5 * 60 * 1000');
  });

  it('wraps with GestureHandlerRootView', () => {
    expect(content).toContain('GestureHandlerRootView');
  });

  it('wraps with SafeAreaProvider', () => {
    expect(content).toContain('SafeAreaProvider');
  });

  it('loads fonts via expo-font/useFonts', () => {
    expect(content).toContain('useFonts');
    expect(content).toContain('Lora_600SemiBold');
    expect(content).toContain('DMSans_400Regular');
    expect(content).toContain('DMSans_500Medium');
  });

  it('manages splash screen visibility', () => {
    expect(content).toContain('SplashScreen.preventAutoHideAsync');
    expect(content).toContain('SplashScreen.hideAsync');
  });

  it('hides splash after fonts are ready', () => {
    expect(content).toContain('fontsLoaded');
    expect(content).toContain('useEffect');
  });

  it('exports a default function', () => {
    expect(content).toMatch(/export default function RootLayout/);
  });
});

describe('app/(tabs)/_layout.tsx (tab layout)', () => {
  const content = readFile('(tabs)/_layout.tsx');

  it('exists', () => {
    expect(existsSync(resolve(appDir, '(tabs)/_layout.tsx'))).toBe(true);
  });

  it('renders 5 tab screens', () => {
    const tabScreenCount = (content.match(/Tabs\.Screen/g) || []).length;
    expect(tabScreenCount).toBe(5);
  });

  it('has Discover tab with HomeIcon', () => {
    expect(content).toContain("title: 'Discover'");
    expect(content).toContain('HomeIcon');
  });

  it('has Search tab with SearchIcon', () => {
    expect(content).toContain("title: 'Search'");
    expect(content).toContain('SearchIcon');
  });

  it('has Saved tab with BookmarkIcon', () => {
    expect(content).toContain("title: 'Saved'");
    expect(content).toContain('BookmarkIcon');
  });

  it('has List tab with ShoppingCartIcon', () => {
    expect(content).toContain("title: 'List'");
    expect(content).toContain('ShoppingCartIcon');
  });

  it('has Settings tab with SettingsIcon', () => {
    expect(content).toContain("title: 'Settings'");
    expect(content).toContain('SettingsIcon');
  });

  it('uses brand orange as active tab color', () => {
    expect(content).toContain('colors.orange');
    expect(content).toContain('tabBarActiveTintColor');
  });

  it('imports theme colors', () => {
    expect(content).toContain("from '@/constants/theme'");
  });

  it('imports icon components', () => {
    expect(content).toContain("from '@/components/icons'");
  });
});

describe('app/+not-found.tsx', () => {
  const content = readFile('+not-found.tsx');

  it('exists', () => {
    expect(existsSync(resolve(appDir, '+not-found.tsx'))).toBe(true);
  });

  it('renders a not found message', () => {
    expect(content).toContain('not found');
  });

  it('has a link to home', () => {
    expect(content).toContain('Link');
    expect(content).toContain('href="/"');
  });

  it('uses theme tokens for styling', () => {
    expect(content).toContain('colors.bg');
    expect(content).toContain('colors.ink');
    expect(content).toContain('fonts.display');
  });

  it('exports a default function', () => {
    expect(content).toMatch(/export default function NotFoundScreen/);
  });
});
