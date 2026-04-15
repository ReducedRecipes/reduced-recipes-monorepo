# ReducedRecipes — Mobile App Specification

**Platforms:** iOS 16+ · Android 10+ (API 29+)  
**Framework:** Expo SDK 51 (managed workflow)  
**Language:** TypeScript throughout  
**Navigation:** Expo Router v3 (file-based, built on React Navigation)  
**Styling:** NativeWind v4 (Tailwind for React Native)  
**State:** TanStack Query v5 (server) · Zustand v4 (UI/local)  
**Storage:** Expo SecureStore (auth) · MMKV (fast local cache) · SQLite via expo-sqlite (offline recipes)  
**Package:** `@rr/mobile` — workspace package in the existing pnpm monorepo  
**Shared:** `@rr/shared` — same types and extraction utilities as the web/workers packages  

---

## Table of Contents

1. [Product Goals](#1-product-goals)
2. [Monorepo Integration](#2-monorepo-integration)
3. [Package Structure](#3-package-structure)
4. [Navigation Architecture](#4-navigation-architecture)
5. [Screen Inventory](#5-screen-inventory)
6. [Design System](#6-design-system)
7. [Screen Specifications](#7-screen-specifications)
8. [Offline Support](#8-offline-support)
9. [State Management](#9-state-management)
10. [API Client](#10-api-client)
11. [Push Notifications](#11-push-notifications)
12. [Search](#12-search)
13. [Saved Recipes](#13-saved-recipes)
14. [Shopping List](#14-shopping-list)
15. [Settings](#15-settings)
16. [Authentication](#16-authentication)
17. [Performance](#17-performance)
18. [Accessibility](#18-accessibility)
19. [Analytics](#19-analytics)
20. [Testing](#20-testing)
21. [Build & Release Pipeline](#21-build--release-pipeline)
22. [EAS Configuration](#22-eas-configuration)
23. [Environment Variables](#23-environment-variables)
24. [Feature Flags](#24-feature-flags)
25. [Cost Model](#25-cost-model)

---

## 1. Product Goals

### Core Value Proposition
The mobile app extends the web experience with native capabilities the web version cannot offer: offline access to saved recipes, shopping list integration, step-by-step cooking mode with screen-lock prevention, and voice-guided instructions.

### Feature Priority

| Priority | Feature |
|---|---|
| P0 | Browse, search, and view recipes |
| P0 | Save recipes for offline access |
| P0 | Step-by-step cooking mode |
| P1 | Shopping list with ingredient aggregation |
| P1 | Dietary filter preferences |
| P1 | Recently viewed history |
| P2 | Push notifications (new recipes from saved domains) |
| P2 | Voice-guided cooking instructions |
| P3 | Meal planning calendar |
| P3 | Household share (shared shopping list) |

### Platform Parity

Both iOS and Android ship from a single Expo codebase. Platform-specific behaviour is limited to:
- iOS: `UIBackgroundModes` for audio (voice guidance)
- Android: Back handler for cooking mode
- iOS: Haptics via `expo-haptics` (Android degrades gracefully)
- iOS: SF Symbols where appropriate (falls back to custom icons on Android)

---

## 2. Monorepo Integration

The mobile app lives as a fourth workspace package alongside `@rr/shared`, `@rr/workers`, and `@rr/frontend`.

### Updated `pnpm-workspace.yaml`

```yaml
packages:
  - 'packages/*'
```

No change — `packages/mobile` is automatically picked up.

### Updated root `package.json` scripts

```json
{
  "scripts": {
    "mobile":          "pnpm --filter @rr/mobile start",
    "mobile:ios":      "pnpm --filter @rr/mobile ios",
    "mobile:android":  "pnpm --filter @rr/mobile android",
    "mobile:build":    "pnpm --filter @rr/mobile build",
    "typecheck":       "pnpm -r typecheck"
  }
}
```

### Shared types consumed from `@rr/shared`

The mobile app imports `RecipeDocument` and utility functions directly:

```typescript
import type { RecipeDocument } from '@rr/shared';
import { cleanText, parseDuration } from '@rr/shared/utils';
```

Metro (Expo's bundler) resolves these via `tsconfig.json` path aliases — identical pattern to the workers package.

---

## 3. Package Structure

```
packages/mobile/                          ← @rr/mobile
├── app/                                  ← Expo Router file-based routes
│   ├── _layout.tsx                       ← Root layout (providers, fonts, splash)
│   ├── (tabs)/                           ← Bottom tab navigator
│   │   ├── _layout.tsx                   ← Tab bar config
│   │   ├── index.tsx                     ← Home / Discovery feed
│   │   ├── search.tsx                    ← Search screen
│   │   ├── saved.tsx                     ← Saved recipes
│   │   ├── list.tsx                      ← Shopping list
│   │   └── settings.tsx                  ← Settings
│   ├── recipe/
│   │   └── [id].tsx                      ← Recipe detail
│   ├── cook/
│   │   └── [id].tsx                      ← Cooking mode (full screen)
│   ├── tag/
│   │   └── [tag].tsx                     ← Browse by tag
│   ├── cuisine/
│   │   └── [cuisine].tsx                 ← Browse by cuisine
│   ├── site/
│   │   └── [domain].tsx                  ← Recipes from one domain
│   ├── onboarding/
│   │   └── index.tsx                     ← First-launch dietary preferences
│   └── +not-found.tsx
│
├── src/
│   ├── components/
│   │   ├── RecipeCard.tsx
│   │   ├── RecipeCardSkeleton.tsx
│   │   ├── RecipeHeader.tsx
│   │   ├── IngredientList.tsx
│   │   ├── InstructionList.tsx
│   │   ├── CookingStep.tsx
│   │   ├── SearchBar.tsx
│   │   ├── FilterSheet.tsx
│   │   ├── TagPill.tsx
│   │   ├── TimeChip.tsx
│   │   ├── DomainBadge.tsx
│   │   ├── EmptyState.tsx
│   │   ├── ErrorState.tsx
│   │   └── BottomSheet.tsx               ← Reusable @gorhom/bottom-sheet wrapper
│   │
│   ├── hooks/
│   │   ├── useRecipe.ts
│   │   ├── useRecipes.ts
│   │   ├── useSearch.ts
│   │   ├── useSavedRecipes.ts
│   │   ├── useShoppingList.ts
│   │   ├── usePreferences.ts
│   │   ├── useCookingSession.ts          ← Step tracking + screen wake lock
│   │   ├── useOfflineSync.ts
│   │   └── useVoiceGuidance.ts
│   │
│   ├── stores/
│   │   ├── saved.store.ts                ← Zustand: saved recipe IDs + offline cache
│   │   ├── shopping.store.ts             ← Zustand: shopping list items
│   │   ├── preferences.store.ts          ← Zustand: dietary prefs, theme, text size
│   │   └── cooking.store.ts              ← Zustand: active cooking session state
│   │
│   ├── db/
│   │   ├── schema.ts                     ← expo-sqlite table definitions
│   │   ├── migrations.ts                 ← SQLite migration runner
│   │   └── queries.ts                    ← Typed query helpers
│   │
│   ├── lib/
│   │   ├── api.ts                        ← Typed API client (shared with @rr/frontend pattern)
│   │   ├── notifications.ts              ← Expo push notification registration + handlers
│   │   ├── voice.ts                      ← expo-speech wrapper
│   │   └── haptics.ts                    ← expo-haptics wrapper with Android fallback
│   │
│   └── constants/
│       ├── theme.ts                      ← NativeWind design tokens
│       └── routes.ts                     ← Typed route helpers
│
├── assets/
│   ├── fonts/
│   │   ├── Lora-Regular.ttf              ← Display / recipe titles
│   │   ├── Lora-SemiBold.ttf
│   │   └── DMSans-Regular.ttf            ← UI body text
│   ├── images/
│   │   ├── icon.png                      ← 1024×1024 app icon
│   │   ├── splash.png                    ← Splash screen
│   │   ├── adaptive-icon.png             ← Android adaptive icon
│   │   └── placeholder-recipe.png        ← Fallback recipe image
│   └── animations/
│       └── cooking-loader.json           ← Lottie animation
│
├── app.json                              ← Expo config
├── eas.json                              ← EAS Build config
├── babel.config.js
├── metro.config.js
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

### `package.json`

```json
{
  "name": "@rr/mobile",
  "version": "1.0.0",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "start":      "expo start",
    "ios":        "expo run:ios",
    "android":    "expo run:android",
    "build":      "eas build",
    "submit":     "eas submit",
    "typecheck":  "tsc --noEmit",
    "lint":       "eslint . --ext .ts,.tsx"
  },
  "dependencies": {
    "@rr/shared":                    "workspace:*",
    "expo":                          "~51.0.0",
    "expo-router":                   "~3.5.0",
    "expo-status-bar":               "~1.12.0",
    "expo-font":                     "~12.0.0",
    "expo-splash-screen":            "~0.27.0",
    "expo-image":                    "~1.12.0",
    "expo-haptics":                  "~13.0.0",
    "expo-speech":                   "~12.0.0",
    "expo-notifications":            "~0.28.0",
    "expo-secure-store":             "~13.0.0",
    "expo-keep-awake":               "~13.0.0",
    "expo-sqlite":                   "~14.0.0",
    "expo-sharing":                  "~12.0.0",
    "react-native":                  "0.74.0",
    "react-native-mmkv":             "^2.12.0",
    "react-native-reanimated":       "~3.10.0",
    "react-native-gesture-handler":  "~2.16.0",
    "react-native-safe-area-context":"4.10.0",
    "react-native-screens":          "3.31.0",
    "@gorhom/bottom-sheet":          "^4.6.0",
    "nativewind":                    "^4.0.1",
    "@tanstack/react-query":         "^5.35.0",
    "zustand":                       "^4.5.0",
    "lottie-react-native":           "7.0.0",
    "react-native-svg":              "15.2.0"
  },
  "devDependencies": {
    "@babel/core":                   "^7.24.0",
    "@types/react":                  "~18.2.0",
    "@types/react-native":           "~0.73.0",
    "tailwindcss":                   "^3.4.0",
    "typescript":                    "^5.4.0"
  }
}
```

### `tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022"],
    "jsx": "react-jsx",
    "moduleResolution": "bundler",
    "strict": true,
    "paths": {
      "@rr/shared":   ["../shared/src/types.ts"],
      "@rr/shared/*": ["../shared/src/*"],
      "@/*":          ["./src/*"]
    }
  },
  "include": ["app", "src", "*.ts", "*.tsx"]
}
```

### `metro.config.js`

Metro must be told about the monorepo so it can resolve `@rr/shared`:

```javascript
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch the shared package
config.watchFolders = [monorepoRoot];

// Resolve modules from both the mobile package and the monorepo root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Alias @rr/shared to its source
config.resolver.alias = {
  '@rr/shared': path.resolve(monorepoRoot, 'packages/shared/src/types.ts'),
};

module.exports = withNativeWind(config, { input: './src/constants/global.css' });
```

---

## 4. Navigation Architecture

Expo Router v3 provides file-based routing with native stack and tab navigators.

### Navigator Tree

```
RootLayout (_layout.tsx)
  ├── Providers: QueryClient, GestureHandler, SafeArea, Theme
  │
  ├── (tabs)/                   ← BottomTabNavigator
  │   ├── index               → Home
  │   ├── search              → Search
  │   ├── saved               → Saved Recipes
  │   ├── list                → Shopping List
  │   └── settings            → Settings
  │
  ├── recipe/[id]               ← Modal stack (slides up from tab)
  ├── cook/[id]                 ← Full-screen modal (no header)
  ├── tag/[tag]                 ← Push onto stack
  ├── cuisine/[cuisine]         ← Push onto stack
  ├── site/[domain]             ← Push onto stack
  └── onboarding/index          ← Shown once on first launch, then never again
```

### Tab Bar Config (`(tabs)/_layout.tsx`)

```typescript
import { Tabs } from 'expo-router';
import { HomeIcon, SearchIcon, BookmarkIcon, ShoppingCartIcon, SettingsIcon } from '@/components/icons';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#E85D26',   // brand orange
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: {
          borderTopWidth: 0,
          elevation: 0,
          shadowOpacity: 0,
          backgroundColor: '#FAFAF8',
          paddingBottom: 4,
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen name="index"    options={{ title: 'Discover', tabBarIcon: HomeIcon }} />
      <Tabs.Screen name="search"   options={{ title: 'Search',   tabBarIcon: SearchIcon }} />
      <Tabs.Screen name="saved"    options={{ title: 'Saved',    tabBarIcon: BookmarkIcon }} />
      <Tabs.Screen name="list"     options={{ title: 'List',     tabBarIcon: ShoppingCartIcon }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: SettingsIcon }} />
    </Tabs>
  );
}
```

### Deep Linking

Configure in `app.json` under `scheme: "reducedrecipes"`. Supported deep links:

| Deep link | Resolves to |
|---|---|
| `reducedrecipes://recipe/[id]` | `app/recipe/[id].tsx` |
| `reducedrecipes://search?q=[query]` | `app/(tabs)/search.tsx` |
| `reducedrecipes://tag/[tag]` | `app/tag/[tag].tsx` |
| `https://reducedrecipes.com/recipe/[id]` | Universal link → `app/recipe/[id].tsx` |

---

## 5. Screen Inventory

| Screen | Route | Description |
|---|---|---|
| Home | `/(tabs)/` | Curated feed: featured, recent, by cuisine |
| Search | `/(tabs)/search` | Full-text search with filter sheet |
| Saved | `/(tabs)/saved` | Bookmarked recipes, available offline |
| Shopping List | `/(tabs)/list` | Aggregated ingredients from multiple recipes |
| Settings | `/(tabs)/settings` | Preferences, dietary filters, theme, about |
| Recipe Detail | `/recipe/[id]` | Full recipe card |
| Cooking Mode | `/cook/[id]` | Full-screen step navigator, screen stays awake |
| Tag Browse | `/tag/[tag]` | All recipes for a tag |
| Cuisine Browse | `/cuisine/[cuisine]` | All recipes for a cuisine |
| Domain Browse | `/site/[domain]` | All recipes from one site |
| Onboarding | `/onboarding` | First-launch dietary preference selection |

---

## 6. Design System

### Typography

Two fonts — Lora (editorial, warm) for recipe titles and display text, DM Sans for all UI chrome.

```typescript
// src/constants/theme.ts
export const fonts = {
  display:  'Lora_600SemiBold',
  body:     'DMSans_400Regular',
  bodyMed:  'DMSans_500Medium',
  mono:     'DMSans_400Regular',  // fallback — no mono in stack
};

export const fontSizes = {
  xs:   11,
  sm:   13,
  base: 15,
  lg:   17,
  xl:   20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
};
```

### Colour Palette

Warm, editorial — cream background, dark ink, signature orange accent.

```typescript
export const colors = {
  // Backgrounds
  bg:          '#FAFAF8',   // warm off-white
  bgCard:      '#FFFFFF',
  bgMuted:     '#F3F2EF',

  // Text
  ink:         '#1A1A18',   // near-black warm
  inkMuted:    '#6B7280',
  inkFaint:    '#9CA3AF',

  // Brand
  orange:      '#E85D26',   // primary CTA
  orangeLight: '#FEF0E7',   // tinted backgrounds

  // Semantic
  success:     '#16A34A',
  warning:     '#D97706',
  error:       '#DC2626',

  // Dark mode variants
  dark: {
    bg:        '#141412',
    bgCard:    '#1C1C1A',
    bgMuted:   '#242422',
    ink:       '#F5F4F0',
    inkMuted:  '#9CA3AF',
  }
};
```

### Spacing Scale

Follow Tailwind's 4px base unit, consistent with the web app.

```typescript
export const spacing = {
  px: 1,
  0.5: 2, 1: 4, 1.5: 6, 2: 8, 2.5: 10, 3: 12, 4: 16,
  5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64,
};
```

### Component Tokens

```typescript
export const radius = {
  sm: 6, md: 10, lg: 16, xl: 24, full: 9999,
};

export const shadow = {
  sm: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
  },
  md: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
  },
};
```

### Dark Mode

NativeWind v4 handles dark mode via `useColorScheme`. The `preferences.store.ts` exposes a `theme` setting (`system | light | dark`) that overrides the system default.

```typescript
// tailwind.config.js
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        brand: '#E85D26',
        ink: '#1A1A18',
        bg: '#FAFAF8',
      },
      fontFamily: {
        display: ['Lora_600SemiBold'],
        body:    ['DMSans_400Regular'],
      },
    },
  },
};
```

---

## 7. Screen Specifications

### 7.1 Home Screen (`/(tabs)/index.tsx`)

Curated discovery feed. Sections are loaded in parallel.

**Layout:**

```
┌─────────────────────────────────────────┐
│  Good morning ☀️                         │  ← personalised greeting (time-based)
│  What are you cooking today?            │
├─────────────────────────────────────────┤
│  [Search bar — tappable, goes to /search]│
├─────────────────────────────────────────┤
│  FEATURED                               │
│  ┌──────────────────────────────────┐   │
│  │  [Hero image — full width]       │   │  ← horizontal scroll of 5 featured cards
│  │  Title                           │   │
│  │  ⏱ 25 min · Italian              │   │
│  └──────────────────────────────────┘   │
├─────────────────────────────────────────┤
│  QUICK & EASY  (under 30 min)           │
│  [Card] [Card] [Card] →                 │  ← horizontal scroll
├─────────────────────────────────────────┤
│  CUISINE                                │
│  [🇮🇹 Italian] [🇯🇵 Japanese] [🇲🇽 Mexican]│  ← horizontal tag pills
├─────────────────────────────────────────┤
│  RECENTLY ADDED                         │
│  [Card]                                 │  ← vertical list, infinite scroll
│  [Card]                                 │
│  [Card]                                 │
└─────────────────────────────────────────┘
```

**Data:**
- Featured: `GET /api/v1/recipes?limit=5&sort=featured` (manual curation via admin flag — add `featured INTEGER DEFAULT 0` to D1 recipes table)
- Quick: `GET /api/v1/recipes?max_time=30&limit=10`
- Recent: `GET /api/v1/recipes?limit=20` (infinite scroll with cursor)

**Behaviour:**
- Pull-to-refresh on the `ScrollView`
- Search bar is a `Pressable` that navigates to `/search` — not a real input on this screen
- Recipe cards open `router.push('/recipe/[id]')`
- Cuisine pills navigate to `/cuisine/[cuisine]`

---

### 7.2 Search Screen (`/(tabs)/search.tsx`)

**Layout:**

```
┌─────────────────────────────────────────┐
│  [← Back]  Search recipes         [⚙️] │  ← filter sheet trigger
├─────────────────────────────────────────┤
│  🔍 [pasta carbonara____________]       │
├─────────────────────────────────────────┤
│  FILTERS (shown when active)            │
│  [⏱ Under 30m ×] [🌿 Vegan ×]         │
├─────────────────────────────────────────┤
│  [RecipeCard]                           │
│  [RecipeCard]                           │
│  [RecipeCard]                           │
└─────────────────────────────────────────┘
```

**Search behaviour:**
- Debounce 300ms on input change before firing API call
- Minimum 2 characters
- Cancel button clears query and hides keyboard
- Empty state shows recent searches (stored in MMKV)

**Filter Sheet (Bottom Sheet):**
Slides up on filter icon tap. Contains:
- Cook time slider: 15 / 30 / 45 / 60+ min
- Cuisine: multi-select from top 20 (loaded from `/api/v1/tags?type=cuisine`)
- Dietary: Vegan · Vegetarian · Gluten-free · Dairy-free · Keto
- Source domain: multi-select

Applied filters reflected as chips below the search bar. Each chip has an `×` to remove it individually.

---

### 7.3 Recipe Detail (`/recipe/[id].tsx`)

The core screen. Presented as a modal stack sliding up from the tab bar.

**Layout:**

```
┌─────────────────────────────────────────┐
│  [Dismiss ×]              [🔖] [Share]  │  ← floating header, transparent until scroll
├─────────────────────────────────────────┤
│                                         │
│  [Hero image — full width, 16:9]        │
│                                         │
├─────────────────────────────────────────┤
│  Title                                  │  ← Lora SemiBold, 28pt
│  By Author · seriouseats.com            │
│                                         │
│  ⏱ 30 min   👤 4 servings   ✅ Schema  │  ← metadata chips row
├─────────────────────────────────────────┤
│  [Ingredients]   [Instructions]         │  ← segmented control / tabs
├─────────────────────────────────────────┤
│  INGREDIENTS                            │
│  ○ 200g spaghetti                       │  ← checkboxes (local state)
│  ○ 100g guanciale                       │
│  ○ 2 eggs                               │
│                                         │
│  [+ Add all to shopping list]           │
├─────────────────────────────────────────┤
│  ┌───────────────────────────────────┐  │
│  │  🍳  Start Cooking  →             │  │  ← brand orange CTA
│  └───────────────────────────────────┘  │
│  📖 View Full Recipe on seriouseats.com │  ← secondary, opens in-app browser
├─────────────────────────────────────────┤
│  [pasta] [italian] [dinner] [quick]     │  ← tags
└─────────────────────────────────────────┘
```

**Behaviour:**
- Header fades from transparent to opaque on scroll past the image (`Animated.Value` on scroll position)
- Bookmark icon fills on tap — triggers `useSavedRecipes.save(id)` — haptic feedback
- Share uses `expo-sharing` to share the `reducedrecipes.com/recipe/[id]` URL
- Ingredient checkboxes are ephemeral — reset on navigation away (not persisted)
- "Add all to shopping list" opens a bottom sheet confirming the ingredient list before adding
- "Start Cooking" pushes to `/cook/[id]`
- "View Full Recipe" opens with `expo-web-browser` in-app (SFSafariViewController / Chrome Custom Tab)

**Serving size adjuster:**
A simple `+/-` stepper above the ingredients list. Multiplies all quantities where parseable. Non-parseable items (e.g. "a pinch of salt") are shown unchanged.

```typescript
// Quantity scaling logic
function scaleIngredient(ingredient: string, factor: number): string {
  return ingredient.replace(
    /(\d+(?:\.\d+)?(?:\/\d+)?)/g,
    (match) => {
      const num = eval(match); // safe — only matches numeric fractions
      const scaled = num * factor;
      return scaled % 1 === 0 ? String(scaled) : scaled.toFixed(1);
    }
  );
}
```

---

### 7.4 Cooking Mode (`/cook/[id].tsx`)

Full-screen experience. No tab bar, no header chrome. Screen stays awake via `expo-keep-awake`.

**Layout:**

```
┌─────────────────────────────────────────┐
│  [✕ Exit]          Step 2 of 7          │
│  ████████████░░░░░░░░░░  28%            │  ← progress bar (Animated)
├─────────────────────────────────────────┤
│                                         │
│                                         │
│   Fry the guanciale in a cold pan       │
│   over medium heat until the fat        │
│   renders and it becomes crispy,        │
│   about 4–5 minutes. Remove from        │
│   heat and set aside.                   │
│                                         │
│                                         │
├─────────────────────────────────────────┤
│  Ingredients for this step:             │
│  • 100g guanciale                       │  ← smart — parsed from instruction context
│                                         │
├─────────────────────────────────────────┤
│  ┌─────────────────────────────────┐    │
│  │        ⏱  4:30  START          │    │  ← optional step timer
│  └─────────────────────────────────┘    │
├─────────────────────────────────────────┤
│  [← Prev]          [Next Step →]        │
└─────────────────────────────────────────┘
```

**Behaviour:**
- `expo-keep-awake` activated on mount, deactivated on unmount
- Swipe left/right to navigate steps (React Native Gesture Handler)
- Step timer: tap to start, tap to pause, shows completion haptic + sound
- Voice guidance: long-press step text to have it read aloud via `expo-speech`
- "Exit" shows confirmation dialog — progress is lost
- Android back button shows same confirmation dialog
- Step transition: smooth horizontal slide animation (Reanimated)
- Auto-advance option: after timer completes, prompt to advance

**Cooking session state** (Zustand `cooking.store.ts`):
```typescript
interface CookingSession {
  recipeId: string;
  currentStep: number;
  totalSteps: number;
  startedAt: string;
  timerRunning: boolean;
  timerRemaining: number | null;
}
```

---

### 7.5 Saved Recipes (`/(tabs)/saved.tsx`)

All bookmarked recipes. Available offline.

**Layout:**

```
┌─────────────────────────────────────────┐
│  Saved  (42)                  [🔍] [⚙️] │
├─────────────────────────────────────────┤
│  [All] [Downloaded] [Italian] [Quick]   │  ← filter tabs (tags from saved recipes)
├─────────────────────────────────────────┤
│  [RecipeCard]   [RecipeCard]            │  ← 2-column grid
│  [RecipeCard]   [RecipeCard]            │
│  [RecipeCard]   [RecipeCard]            │
└─────────────────────────────────────────┘
```

**Behaviour:**
- Saved recipes are stored in local SQLite via `expo-sqlite`
- "Downloaded" filter shows only recipes with full offline data synced
- Swipe-to-delete on a card removes from saved list
- Long-press shows action sheet: Remove · Add to shopping list · Share
- Empty state shows "Save recipes by tapping the bookmark icon"

---

### 7.6 Shopping List (`/(tabs)/list.tsx`)

Aggregated ingredients from multiple saved recipes.

**Layout:**

```
┌─────────────────────────────────────────┐
│  Shopping List               [+ Add]    │
├─────────────────────────────────────────┤
│  FROM 3 RECIPES                         │
│  [Carbonara] [Risotto] [Tiramisu]       │  ← recipe pills — tap removes that recipe's items
├─────────────────────────────────────────┤
│  PRODUCE                                │
│  ○ 4 garlic cloves                      │
│  ✓ 200g cherry tomatoes     (strikethrough)
│                                         │
│  DAIRY                                  │
│  ○ 2 cups heavy cream                   │
│  ○ 100g Pecorino Romano                 │
│                                         │
│  PANTRY                                 │
│  ○ 400g spaghetti                       │
│  ○ 3 tbsp olive oil                     │
├─────────────────────────────────────────┤
│  [🗑 Clear completed]   [Share list]    │
└─────────────────────────────────────────┘
```

**Behaviour:**
- Ingredient categories auto-detected from a keyword lookup table (`produce`, `dairy`, `meat`, `pantry`, `spices`)
- Duplicate ingredients are merged with combined quantities where parseable
- Tap item to check off — checked items move to the bottom with strikethrough
- "+ Add" opens a bottom sheet to manually add freeform items
- "Share list" formats items as plain text and opens the share sheet
- List is persisted in Zustand + MMKV across app restarts

---

### 7.7 Settings (`/(tabs)/settings.tsx`)

```
┌─────────────────────────────────────────┐
│  Settings                               │
├─────────────────────────────────────────┤
│  PREFERENCES                            │
│  Dietary filters          [Vegan, GF >] │
│  Default serving size     [2 >]         │
│  Text size                [Medium >]    │
│  Theme                    [System >]    │
├─────────────────────────────────────────┤
│  NOTIFICATIONS                          │
│  New recipes from saved sites  [ON  ●] │
│  Cooking reminders              [OFF ○] │
├─────────────────────────────────────────┤
│  DATA                                   │
│  Downloaded recipes        42 recipes  │
│  Clear offline cache                   │
│  Clear shopping list                   │
├─────────────────────────────────────────┤
│  ABOUT                                  │
│  Version                        1.0.0  │
│  Privacy Policy                        │
│  Request Recipe Removal                │
│  Rate the App                          │
└─────────────────────────────────────────┘
```

---

### 7.8 Onboarding (`/onboarding/index.tsx`)

Shown only on first launch. Sets dietary preferences that pre-filter the entire app.

Three slides:
1. **Welcome** — "Recipes without the story. Just the good stuff." — brand hero image
2. **Dietary preferences** — multi-select: None · Vegan · Vegetarian · Gluten-free · Dairy-free · Keto
3. **Notifications** — opt-in to push notifications. Explains what they're for before requesting permission.

Slides use Reanimated horizontal swipe transitions. "Skip" available on slides 2 and 3. Completion sets `ONBOARDING_COMPLETE` in MMKV and redirects to `/(tabs)/`.

---

## 8. Offline Support

### Strategy

Saved recipes are fully available offline. Everything else degrades gracefully.

| Feature | Online | Offline |
|---|---|---|
| Browse / discover | ✓ Live | ✗ Show "No connection" state |
| Search | ✓ Live | Partial — search local SQLite saved recipes only |
| Recipe detail (saved) | ✓ Live | ✓ SQLite cache |
| Recipe detail (unsaved) | ✓ Live | ✗ "Save this recipe to view offline" |
| Cooking mode | ✓ Live | ✓ From SQLite cache |
| Shopping list | ✓ Live | ✓ MMKV persisted |

### Local SQLite Schema

```typescript
// src/db/schema.ts
export const SCHEMA = `
  CREATE TABLE IF NOT EXISTS saved_recipes (
    id           TEXT PRIMARY KEY,
    title        TEXT NOT NULL,
    domain       TEXT NOT NULL,
    source_url   TEXT NOT NULL,
    image_url    TEXT,
    author       TEXT,
    total_time   INTEGER,
    yields       TEXT,
    ingredients  TEXT NOT NULL,   -- JSON
    instructions TEXT NOT NULL,   -- JSON
    tags         TEXT,            -- JSON
    cuisine      TEXT,
    saved_at     TEXT NOT NULL DEFAULT (datetime('now')),
    last_synced  TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_saved_domain   ON saved_recipes(domain);
  CREATE INDEX IF NOT EXISTS idx_saved_saved_at ON saved_recipes(saved_at DESC);
`;
```

### Sync Flow

When a recipe is saved:
1. Immediately write the `RecipeDocument` (already in memory from the detail screen fetch) to SQLite
2. If image is available, pre-fetch and cache via `expo-image` disk cache
3. Set `last_synced` to current timestamp

When the app comes online after being offline:
1. `useOfflineSync` hook detects network change via `@react-native-community/netinfo`
2. Re-fetches all saved recipe IDs from the API to check for updates
3. Updates SQLite rows where `extracted_at` on server is newer than `last_synced`

```typescript
// src/hooks/useOfflineSync.ts
export function useOfflineSync() {
  const db = useSQLiteContext();
  const queryClient = useQueryClient();

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(async (state) => {
      if (!state.isConnected) return;

      const saved = await db.getAllAsync<{ id: string; last_synced: string }>(
        'SELECT id, last_synced FROM saved_recipes'
      );

      for (const recipe of saved) {
        try {
          const fresh = await fetchRecipe(recipe.id);
          if (fresh.extracted_at > recipe.last_synced) {
            await db.runAsync(
              `UPDATE saved_recipes SET
                 ingredients = ?, instructions = ?, last_synced = ?
               WHERE id = ?`,
              JSON.stringify(fresh.ingredients),
              JSON.stringify(fresh.instructions),
              new Date().toISOString(),
              recipe.id
            );
            queryClient.invalidateQueries({ queryKey: ['recipe', recipe.id] });
          }
        } catch { /* skip — will retry next sync */ }
      }
    });

    return unsubscribe;
  }, []);
}
```

---

## 9. State Management

### Zustand Stores

**`saved.store.ts`**
```typescript
interface SavedStore {
  ids: Set<string>;              // for O(1) isSaved() checks
  isSaved: (id: string) => boolean;
  save:   (id: string, recipe: RecipeDocument) => Promise<void>;
  unsave: (id: string) => Promise<void>;
  hydrate: () => Promise<void>;  // load from SQLite on app start
}
```

**`shopping.store.ts`**
```typescript
interface ShoppingItem {
  id: string;
  text: string;
  category: string;
  checked: boolean;
  recipeId: string | null;       // null = manually added
  recipeTitle: string | null;
}

interface ShoppingStore {
  items: ShoppingItem[];
  addFromRecipe: (recipe: RecipeDocument) => void;
  addManual: (text: string) => void;
  toggle: (id: string) => void;
  remove: (id: string) => void;
  clearChecked: () => void;
  clearAll: () => void;
}
```

**`preferences.store.ts`**
```typescript
interface PreferencesStore {
  theme: 'system' | 'light' | 'dark';
  textSize: 'sm' | 'md' | 'lg';
  defaultServings: number;
  dietaryFilters: DietaryFilter[];  // 'vegan' | 'vegetarian' | 'gf' | 'df' | 'keto'
  setTheme: (t: PreferencesStore['theme']) => void;
  toggleDietary: (f: DietaryFilter) => void;
}
```

All Zustand stores are persisted to MMKV via the `zustand/middleware` `persist` middleware with the MMKV storage adapter:

```typescript
import { MMKV } from 'react-native-mmkv';
import { StateStorage } from 'zustand/middleware';

const mmkv = new MMKV({ id: 'rr-store' });

export const mmkvStorage: StateStorage = {
  getItem:    (key) => mmkv.getString(key) ?? null,
  setItem:    (key, value) => mmkv.set(key, value),
  removeItem: (key) => mmkv.delete(key),
};
```

### TanStack Query Config

```typescript
// app/_layout.tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:          1000 * 60 * 5,   // 5 minutes
      gcTime:             1000 * 60 * 30,  // 30 minutes
      retry:              2,
      networkMode:        'offlineFirst',
    },
  },
});
```

`networkMode: 'offlineFirst'` means queries run from cache even without network, and retry when connectivity is restored.

---

## 10. API Client

Typed client that mirrors the web `@rr/frontend` API client, adapted for React Native (no `window`, use `Platform` for environment detection).

```typescript
// src/lib/api.ts
const BASE_URL = process.env.EXPO_PUBLIC_API_BASE ?? 'https://reducedrecipes.com';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Client': 'rr-mobile/1.0',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new ApiError(response.status, await response.text());
  }

  return response.json();
}

export const api = {
  recipes: {
    list: (params: RecipeListParams) =>
      request<PaginatedResponse<RecipeSummary>>(`/api/v1/recipes?${qs(params)}`),

    get: (id: string) =>
      request<RecipeDocument>(`/api/v1/recipes/${id}`),

    search: (q: string, params?: RecipeListParams) =>
      request<SearchResponse>(`/api/v1/search?q=${encodeURIComponent(q)}&${qs(params ?? {})}`),
  },

  tags: {
    list: () => request<TagCount[]>('/api/v1/tags'),
  },
};
```

---

## 11. Push Notifications

Notifications are used to alert users when new recipes from their saved/followed domains have been indexed.

### Registration Flow

```typescript
// src/lib/notifications.ts
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) return null; // Simulator — skip

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  const token = (await Notifications.getExpoPushTokenAsync({
    projectId: process.env.EXPO_PUBLIC_PROJECT_ID,
  })).data;

  // Send token to API for storage
  await api.notifications.register(token);
  return token;
}
```

### Notification Handler

```typescript
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});
```

### Backend requirement (add to Workers API)

Add two new endpoints:

```
POST /api/v1/notifications/register
  body: { token: string, platform: 'ios' | 'android' }
  → Store in a new D1 table: push_tokens(token, platform, registered_at)

POST /api/v1/notifications/send   (admin only)
  body: { domain: string, recipe_id: string, recipe_title: string }
  → Fan-out push via Expo Push API to all tokens that follow domain
```

**Notification payload:**

```json
{
  "to": "ExponentPushToken[xxxxx]",
  "title": "New recipe from Serious Eats",
  "body": "Classic French Onion Soup",
  "data": {
    "type": "new_recipe",
    "recipeId": "550e8400-...",
    "domain": "seriouseats.com"
  }
}
```

**Tap handler** navigates to `/recipe/[data.recipeId]`:

```typescript
useEffect(() => {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const { type, recipeId } = response.notification.request.content.data;
    if (type === 'new_recipe' && recipeId) {
      router.push(`/recipe/${recipeId}`);
    }
  });
  return () => sub.remove();
}, []);
```

---

## 12. Search

### `useSearch` hook

```typescript
export function useSearch(query: string, filters: SearchFilters) {
  return useQuery({
    queryKey: ['search', query, filters],
    queryFn: () => api.recipes.search(query, filters),
    enabled: query.trim().length >= 2,
    placeholderData: keepPreviousData,
  });
}
```

### Recent Searches

Stored in MMKV as a JSON array of strings, max 10 entries, LIFO:

```typescript
function saveRecentSearch(query: string) {
  const existing = JSON.parse(mmkv.getString('recent_searches') ?? '[]') as string[];
  const updated = [query, ...existing.filter(q => q !== query)].slice(0, 10);
  mmkv.set('recent_searches', JSON.stringify(updated));
}
```

### Offline Search

When network is unavailable, `useSearch` falls back to a SQLite FTS query on saved recipes only:

```typescript
if (!isConnected) {
  return db.getAllAsync<RecipeSummary>(
    `SELECT id, title, image_url, domain, total_time
     FROM saved_recipes
     WHERE title LIKE ?
     LIMIT 20`,
    [`%${query}%`]
  );
}
```

---

## 13. Saved Recipes

### `useSavedRecipes` hook

```typescript
export function useSavedRecipes() {
  const store = useSavedStore();
  const db = useSQLiteContext();

  const save = useCallback(async (recipe: RecipeDocument) => {
    await db.runAsync(
      `INSERT OR REPLACE INTO saved_recipes
         (id, title, domain, source_url, image_url, author,
          total_time, yields, ingredients, instructions, tags, cuisine, last_synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      recipe.id, recipe.title, recipe.domain, recipe.source_url,
      recipe.image_url ?? null, recipe.author ?? null,
      recipe.total_time ?? null, recipe.yields ?? null,
      JSON.stringify(recipe.ingredients),
      JSON.stringify(recipe.instructions),
      JSON.stringify(recipe.tags),
      recipe.cuisine ?? null,
      new Date().toISOString()
    );
    store.ids.add(recipe.id);
    triggerHaptic('medium');
  }, []);

  const unsave = useCallback(async (id: string) => {
    await db.runAsync('DELETE FROM saved_recipes WHERE id = ?', id);
    store.ids.delete(id);
    triggerHaptic('light');
  }, []);

  return { isSaved: store.isSaved, save, unsave };
}
```

---

## 14. Shopping List

### Ingredient Categorisation

```typescript
// src/lib/categorise.ts
const CATEGORIES: Record<string, string[]> = {
  Produce:  ['garlic', 'onion', 'tomato', 'lemon', 'lime', 'pepper', 'carrot',
             'potato', 'spinach', 'basil', 'parsley', 'thyme', 'rosemary'],
  Dairy:    ['butter', 'cream', 'milk', 'cheese', 'parmesan', 'pecorino',
             'mozzarella', 'yogurt', 'egg'],
  Meat:     ['chicken', 'beef', 'pork', 'bacon', 'guanciale', 'pancetta',
             'sausage', 'lamb', 'prawn', 'shrimp', 'salmon'],
  Pantry:   ['pasta', 'rice', 'flour', 'sugar', 'salt', 'pepper', 'olive oil',
             'vinegar', 'stock', 'broth', 'soy sauce', 'honey'],
  Spices:   ['cumin', 'coriander', 'paprika', 'turmeric', 'cinnamon',
             'chilli', 'oregano', 'nutmeg'],
};

export function categoriseIngredient(ingredient: string): string {
  const lower = ingredient.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORIES)) {
    if (keywords.some(kw => lower.includes(kw))) return category;
  }
  return 'Other';
}
```

### Quantity Merging

When adding a recipe, attempt to merge duplicate ingredients:

```typescript
function mergeIngredients(existing: string, incoming: string): string {
  // "2 cups flour" + "1 cup flour" → "3 cups flour"
  // Falls back to concatenation if units don't match: "200g + 100g = 300g" or "2 cups + 1 tbsp = 2 cups, 1 tbsp"
  // Library: fraction.js handles fractional quantities
}
```

---

## 15. Settings

Settings are stored in `preferences.store.ts` and persisted via MMKV.

### Dietary Filters

When dietary filters are active, they are passed as query params to all API calls:

```
GET /api/v1/recipes?tag=vegan&tag=gluten-free
```

The API already supports multiple `tag` params (covered in the main spec).

### Text Size

Applied globally via a React context that scales `fontSizes` by a multiplier:

| Setting | Multiplier |
|---|---|
| Small | 0.9 |
| Medium | 1.0 (default) |
| Large | 1.15 |
| Extra Large | 1.3 |

---

## 16. Authentication

**Phase 1 (launch): No authentication required.** All features work without an account. Saved recipes and shopping list are device-local.

**Phase 2 (post-launch): Optional account** for cross-device sync of saved recipes and shopping list.

When Phase 2 is implemented:
- Auth via **Expo Auth Session** (OAuth — Apple Sign-In on iOS required by App Store rules, Google on Android)
- Tokens stored in **Expo SecureStore** (encrypted, not accessible via MMKV)
- Sync: saved recipe IDs and shopping list pushed to a new API endpoint `POST /api/v1/sync`
- No PII collected beyond email — no passwords stored

---

## 17. Performance

### Image Loading

Use `expo-image` (not React Native's built-in `Image`). It provides:
- Disk and memory caching
- Blurhash placeholders while loading
- Smooth crossfade transitions
- Respects `Cache-Control` headers from origin servers

```typescript
<Image
  source={{ uri: recipe.image_url }}
  placeholder={{ blurhash: recipe.blurhash }}
  contentFit="cover"
  transition={300}
  style={{ width: '100%', aspectRatio: 16 / 9 }}
  recyclingKey={recipe.id}   // prevents stale images in FlashList
/>
```

### List Rendering

Use **FlashList** (from `@shopify/flash-list`) instead of `FlatList` for all recipe lists. FlashList recycles components more aggressively and significantly outperforms FlatList at 100+ items.

```typescript
import { FlashList } from '@shopify/flash-list';

<FlashList
  data={recipes}
  renderItem={({ item }) => <RecipeCard recipe={item} />}
  estimatedItemSize={220}
  keyExtractor={(item) => item.id}
  onEndReached={fetchNextPage}
  onEndReachedThreshold={0.3}
/>
```

Add `@shopify/flash-list` to `package.json` dependencies.

### Query Prefetching

On the Home screen, prefetch recipe details for the first 5 visible cards so that tapping is instant:

```typescript
useEffect(() => {
  recipes.slice(0, 5).forEach(recipe => {
    queryClient.prefetchQuery({
      queryKey: ['recipe', recipe.id],
      queryFn: () => api.recipes.get(recipe.id),
      staleTime: 1000 * 60 * 10,
    });
  });
}, [recipes]);
```

### Bundle Size

- Use **bare imports** — no barrel files (`import X from '@rr/shared'` resolved by Metro alias, not a re-export index)
- Lottie animations only on screens that use them (lazy loaded)
- `expo-speech` and `expo-notifications` are loaded lazily

---

## 18. Accessibility

### Requirements

| Feature | Implementation |
|---|---|
| Screen reader support | All interactive elements have `accessibilityLabel` |
| Minimum touch target | 44×44pt minimum for all tappable elements |
| Dynamic type | `textSize` preference scales all font sizes |
| High contrast | Dark mode palette meets WCAG AA contrast ratios |
| Reduce motion | Check `AccessibilityInfo.isReduceMotionEnabled()` before animations |

### Reduce Motion Pattern

```typescript
import { AccessibilityInfo } from 'react-native';

export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  return reduceMotion;
}
```

Pass this into Reanimated via `withTiming(value, { duration: reduceMotion ? 0 : 300 })`.

### Cooking Mode Accessibility

- Each instruction step has `accessibilityLiveRegion="polite"` so screen readers announce it on step change
- Timer reads remaining time every 30 seconds via `AccessibilityInfo.announceForAccessibility`
- Navigation buttons labelled: "Previous step, step 1 of 7" / "Next step, step 3 of 7"

---

## 19. Analytics

Use **Expo Analytics** via a thin wrapper that can swap backends. At launch: Posthog (open source, self-hostable, $0 for small scale).

### Events to Track

| Event | Properties |
|---|---|
| `recipe_viewed` | `recipe_id`, `domain`, `source` (search/browse/saved) |
| `recipe_saved` | `recipe_id`, `domain` |
| `recipe_unsaved` | `recipe_id` |
| `cooking_mode_started` | `recipe_id` |
| `cooking_mode_completed` | `recipe_id`, `duration_seconds` |
| `search_performed` | `query`, `result_count`, `filters` |
| `shopping_list_item_added` | `recipe_id` or `manual` |
| `original_recipe_opened` | `recipe_id`, `domain` |
| `onboarding_completed` | `dietary_filters` |

### Privacy

- No PII in events
- Respect `AppTrackingTransparency` on iOS 14+ — only send analytics if permission granted or not required
- Android: no tracking permission needed for analytics without advertising ID

---

## 20. Testing

### Unit Tests (Jest + Testing Library)

```bash
pnpm --filter @rr/mobile test
```

Key areas to cover:
- `src/lib/api.ts` — mock fetch, test error handling
- `src/db/queries.ts` — use `expo-sqlite` in-memory DB for tests
- `scaleIngredient()` — quantity scaling edge cases
- `categoriseIngredient()` — all category buckets
- `mergeIngredients()` — unit parsing and merging
- Zustand stores — all state transitions

### Component Tests (Testing Library / React Native)

```typescript
import { render, fireEvent } from '@testing-library/react-native';
import { RecipeCard } from '@/components/RecipeCard';

test('navigates to recipe detail on tap', () => {
  const mockPush = jest.fn();
  jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

  const { getByText } = render(<RecipeCard recipe={mockRecipe} />);
  fireEvent.press(getByText(mockRecipe.title));
  expect(mockPush).toHaveBeenCalledWith(`/recipe/${mockRecipe.id}`);
});
```

### E2E Tests (Maestro)

Maestro is the recommended E2E tool for Expo apps — no Xcode or Android Studio setup required.

```yaml
# e2e/search-and-save.yaml
appId: com.reducedrecipes.app
---
- launchApp
- tapOn: "Search"
- tapOn:
    text: "Search recipes"
- inputText: "pasta carbonara"
- waitForAnimationToEnd
- tapOn:
    index: 0
    text: ".*carbonara.*"
- tapOn:
    id: "bookmark-button"
- assertVisible: "Saved"
```

Run locally: `maestro test e2e/search-and-save.yaml`

---

## 21. Build & Release Pipeline

### Expo Application Services (EAS)

All builds go through EAS Build. No local Xcode or Android Studio required except for initial development.

### Build Profiles (in `eas.json` — see section 22)

| Profile | Purpose | Distribution |
|---|---|---|
| `development` | Local dev with dev client | Internal |
| `preview` | TestFlight / Internal Track | Internal |
| `production` | App Store / Play Store | Store |

### Release Process

```
Git push to main
    ↓
GitHub Actions
    ├── typecheck (pnpm typecheck)
    ├── lint
    └── test
    ↓ (on tag v*)
EAS Build (iOS + Android in parallel)
    ↓
EAS Submit
    ├── iOS → TestFlight → App Store
    └── Android → Internal Track → Production Track
```

### GitHub Actions Workflow

```yaml
name: Mobile Build & Submit
on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @rr/mobile typecheck
      - uses: expo/expo-github-action@v8
        with:
          expo-version: latest
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}
      - name: Build iOS
        working-directory: packages/mobile
        run: eas build --platform ios --profile production --non-interactive
        env:
          EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
      - name: Build Android
        working-directory: packages/mobile
        run: eas build --platform android --profile production --non-interactive
        env:
          EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
      - name: Submit iOS
        working-directory: packages/mobile
        run: eas submit --platform ios --latest --non-interactive
        env:
          EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
          ASC_API_KEY_ID: ${{ secrets.ASC_API_KEY_ID }}
          ASC_API_KEY_ISSUER_ID: ${{ secrets.ASC_API_KEY_ISSUER_ID }}
          ASC_API_KEY: ${{ secrets.ASC_API_KEY }}
      - name: Submit Android
        working-directory: packages/mobile
        run: eas submit --platform android --latest --non-interactive
        env:
          EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
          GOOGLE_SERVICE_ACCOUNT_KEY: ${{ secrets.GOOGLE_SERVICE_ACCOUNT_KEY }}
```

### OTA Updates (Expo Updates)

Non-binary changes (JS bundle updates) are pushed via `expo-updates` without going through App Store review:

```bash
# From packages/mobile
eas update --branch production --message "Fix ingredient scaling bug"
```

**Update policy:**
- Critical bug fixes: OTA immediately
- New features: Only through binary releases (keeps stores in sync)
- The `updates.checkOnLaunch` is set to `"EAGER"` — checks for updates on every launch

---

## 22. EAS Configuration

### `eas.json`

```json
{
  "cli": {
    "version": ">= 10.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": {
        "simulator": true
      },
      "env": {
        "EXPO_PUBLIC_API_BASE": "http://localhost:8787",
        "EXPO_PUBLIC_ENVIRONMENT": "development"
      }
    },
    "preview": {
      "distribution": "internal",
      "ios": {
        "resourceClass": "m1-medium"
      },
      "env": {
        "EXPO_PUBLIC_API_BASE": "https://reducedrecipes.com",
        "EXPO_PUBLIC_ENVIRONMENT": "preview"
      }
    },
    "production": {
      "autoIncrement": true,
      "ios": {
        "resourceClass": "m1-medium"
      },
      "env": {
        "EXPO_PUBLIC_API_BASE": "https://reducedrecipes.com",
        "EXPO_PUBLIC_ENVIRONMENT": "production"
      }
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "hello@reducedrecipes.com",
        "ascAppId": "REPLACE_WITH_APP_STORE_CONNECT_APP_ID"
      },
      "android": {
        "serviceAccountKeyPath": "./google-service-account.json",
        "track": "internal"
      }
    }
  },
  "update": {
    "production": {
      "channel": "production"
    },
    "preview": {
      "channel": "preview"
    }
  }
}
```

### `app.json`

```json
{
  "expo": {
    "name": "ReducedRecipes",
    "slug": "reduced-recipes",
    "version": "1.0.0",
    "scheme": "reducedrecipes",
    "orientation": "portrait",
    "icon": "./assets/images/icon.png",
    "splash": {
      "image": "./assets/images/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#FAFAF8"
    },
    "assetBundlePatterns": ["**/*"],
    "ios": {
      "supportsTablet": false,
      "bundleIdentifier": "com.reducedrecipes.app",
      "buildNumber": "1",
      "infoPlist": {
        "NSMicrophoneUsageDescription": "Used for voice-guided cooking instructions.",
        "NSUserNotificationUsageDescription": "Get notified when new recipes are added from your saved sites."
      },
      "associatedDomains": ["applinks:reducedrecipes.com"]
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/images/adaptive-icon.png",
        "backgroundColor": "#FAFAF8"
      },
      "package": "com.reducedrecipes.app",
      "versionCode": 1,
      "permissions": [
        "RECEIVE_BOOT_COMPLETED",
        "VIBRATE"
      ],
      "intentFilters": [
        {
          "action": "VIEW",
          "autoVerify": true,
          "data": [
            {
              "scheme": "https",
              "host": "reducedrecipes.com",
              "pathPrefix": "/recipe"
            }
          ],
          "category": ["BROWSABLE", "DEFAULT"]
        }
      ]
    },
    "plugins": [
      "expo-router",
      "expo-font",
      "expo-sqlite",
      "expo-secure-store",
      "expo-keep-awake",
      [
        "expo-notifications",
        {
          "icon": "./assets/images/notification-icon.png",
          "color": "#E85D26"
        }
      ],
      [
        "expo-build-properties",
        {
          "ios": { "deploymentTarget": "16.0" },
          "android": { "minSdkVersion": 29 }
        }
      ]
    ],
    "updates": {
      "url": "https://u.expo.dev/REPLACE_WITH_EAS_PROJECT_ID",
      "checkOnLaunch": "EAGER",
      "fallbackToCacheTimeout": 0
    },
    "runtimeVersion": {
      "policy": "appVersion"
    },
    "extra": {
      "eas": {
        "projectId": "REPLACE_WITH_EAS_PROJECT_ID"
      }
    }
  }
}
```

---

## 23. Environment Variables

All `EXPO_PUBLIC_*` vars are inlined at build time by Metro and accessible via `process.env`.

| Variable | Development | Production | Purpose |
|---|---|---|---|
| `EXPO_PUBLIC_API_BASE` | `http://localhost:8787` | `https://reducedrecipes.com` | API base URL |
| `EXPO_PUBLIC_ENVIRONMENT` | `development` | `production` | Feature flags, logging |
| `EXPO_PUBLIC_PROJECT_ID` | EAS project ID | EAS project ID | Push notification token generation |
| `EXPO_PUBLIC_POSTHOG_KEY` | (optional) | Posthog key | Analytics |

These are set in `eas.json` per build profile — not in a `.env` file. Never put secrets in `EXPO_PUBLIC_*` variables — they are bundled into the app binary and readable by anyone.

---

## 24. Feature Flags

Lightweight feature flag system backed by MMKV — no external service needed at launch.

```typescript
// src/lib/flags.ts
const DEFAULT_FLAGS = {
  voiceGuidance:      true,
  shoppingList:       true,
  mealPlanning:       false,   // P3 — not yet built
  householdShare:     false,   // P3 — not yet built
  offlineSync:        true,
  pushNotifications:  true,
};

type Flag = keyof typeof DEFAULT_FLAGS;

export function useFlag(flag: Flag): boolean {
  const override = mmkv.getString(`flag:${flag}`);
  if (override !== undefined) return override === 'true';
  return DEFAULT_FLAGS[flag];
}
```

Flags can be overridden at runtime from the **Settings → Developer** screen (only shown when `EXPO_PUBLIC_ENVIRONMENT === 'development'`).

---

## 25. Cost Model

The mobile app itself has no infrastructure cost — it runs entirely on the existing Cloudflare Workers API. Incremental costs are minimal:

| Item | Monthly | Notes |
|---|---|---|
| EAS Build (free tier) | $0 | 30 builds/mo free — sufficient for small team |
| EAS Build (production) | $0–19 | Upgrade if exceeding free tier |
| Expo Push Notifications | $0 | Free up to 1M pushes/mo |
| TestFlight hosting | $0 | Included in Apple Developer ($99/yr) |
| Play Store | $0 | One-time $25 registration |
| Apple Developer Account | $8.25/mo | $99/yr |
| **Total monthly** | **~$8–27** | |

The API cost impact of mobile traffic is absorbed by the existing Cloudflare Workers plan — each recipe detail fetch is a KV read (included in the $5/mo plan). Increased traffic to the Workers API from mobile users may push reads above the free tier limit, but at $0.50 per million additional reads the cost remains negligible at typical mobile app scale.

---

*End of mobile specification. All code samples are TypeScript targeting Expo SDK 51 and React Native 0.74. File paths are relative to `packages/mobile/` within the monorepo.*