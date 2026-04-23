# ReducedRecipes — Mobile App Feature Parity Spec

**Version:** 1.0
**Date:** 2026-04-23
**Status:** Draft

---

## Overview

Bring the Expo mobile app to full feature and style parity with the web frontend. The mobile app is a functional MVP with core features (browse, search, save, cook, shopping). This spec covers the gaps — missing features, style alignment, and API integration needed to match the web experience.

---

## Current State

### What mobile has that web doesn't
- Cooking mode with voice guidance (TTS) and auto-timer extraction
- Offline recipe storage via SQLite
- Haptic feedback on interactions
- Shopping list offline sync queue
- Onboarding flow with dietary preferences

### What web has that mobile doesn't
- Semantic/hybrid search modes
- Search filters (time, diet, method, sort)
- Ingredient board ("what's in your fridge")
- Heart/voting system
- Similar recipes shelf
- User profiles (own + others)
- Multiple shopping lists with real-time sharing
- Transparency/funding page
- Ko-fi integration
- Nutrition panel
- Editorial design system (serif/mono/caps typography)

---

## Feature Gaps (Priority Order)

### P0 — Core Parity

#### 1. Search Filters & Modes
**Current:** Basic text search only
**Target:** Match web's filter sidebar + search modes

**Implementation:**
- Add filter bottom sheet to search screen
- Filters: Maximum time (15m/30m/1hr/3hr), Diet (vegetarian/vegan/keto/gluten-free), Method (one-pan/one-pot/sheet-pan/slow-cook/no-cook)
- Sort options: Newest, Hot, Top, Time (low→high), Time (high→low), A→Z, Z→A
- Search mode toggle: Keyword / Semantic / Hybrid (pill selector above results)
- Pass `mode`, `max_time`, `tags`, `sort` params to `/api/v1/search`

**API changes:** None — all params already supported

**Files to modify:**
- `app/(tabs)/search.tsx` — add filter button + mode toggle
- `src/hooks/useSearch.ts` — add mode + filter params
- New: `src/components/SearchFilterSheet.tsx` — bottom sheet with filter controls

**Effort:** 1 day

---

#### 2. Heart/Voting System
**Current:** Bookmark only (save to collection)
**Target:** Heart button with vote count, affects hot ranking

**Implementation:**
- Add heart icon to RecipeCard and Recipe Detail
- Tap to heart/unheart (with haptic feedback)
- Show vote count on card
- API: `POST /api/v1/recipes/:id/heart`, `DELETE /api/v1/recipes/:id/heart`
- Optimistic update via React Query

**Files to modify:**
- `src/components/RecipeCard.tsx` — add heart button + count
- `app/recipe/[id].tsx` — add heart to detail actions
- New: `src/hooks/useHeart.ts` — heart toggle hook

**Effort:** 0.5 days

---

#### 3. Similar Recipes Shelf
**Current:** Not implemented
**Target:** "More like this" section on recipe detail page

**Implementation:**
- Horizontal scroll shelf below recipe instructions
- Fetch from `GET /api/v1/search/similar/:id?limit=8`
- Fall back to cuisine/tag-based if vector search returns nothing
- Reuse existing RecipeCard component

**Files to modify:**
- `app/recipe/[id].tsx` — add shelf section at bottom
- New: `src/hooks/useSimilarRecipes.ts` — query hook

**Effort:** 0.5 days

---

#### 4. Multiple Shopping Lists
**Current:** Single shopping list
**Target:** Multiple lists with create/delete/switch, matching web

**Implementation:**
- List picker at top of shopping list tab (dropdown or horizontal pills)
- "New List" button
- Swipe-to-delete on lists
- Each list has its own items, synced independently
- Already supported by API and partially by shopping store

**Files to modify:**
- `app/(tabs)/list.tsx` — add list picker header
- `src/stores/shopping.store.ts` — multi-list support (partially exists)
- `src/hooks/useShoppingList.ts` — accept list ID param

**Effort:** 1 day

---

#### 5. Nutrition Panel
**Current:** Not shown
**Target:** Display calories, protein, fat, carbs, fiber per serving

**Implementation:**
- Add nutrition section to recipe detail (below instructions)
- Circular progress rings or simple stat row
- Data comes from `recipe.nutrition` in the RecipeDocument
- Show "AI estimated" badge if `nutrition.source === 'ai'`

**Files to modify:**
- `app/recipe/[id].tsx` — add NutritionPanel section
- New: `src/components/NutritionPanel.tsx`

**Effort:** 0.5 days

---

#### 6. Ingredient Board ("What's in your fridge")
**Current:** Not implemented
**Target:** Include/exclude ingredient search with autocomplete

**Implementation:**
- New screen or section on home tab
- Two input areas: "Have" (include) and "Exclude"
- Live autocomplete from `GET /api/v1/ingredients/suggest?q=...`
- Results from `GET /api/v1/search/by-ingredients?have=...&exclude=...`
- Show match stats (have/total/missing ingredients)
- Pill-based ingredient selection with remove on tap

**Files to modify:**
- New: `app/ingredients.tsx` — full screen or new tab
- New: `src/components/IngredientBoard.tsx` — include/exclude boards
- New: `src/hooks/useIngredientSearch.ts` — autocomplete + search hook

**Effort:** 2 days

---

### P1 — Social & Sharing

#### 7. User Profiles
**Current:** Basic account info in settings only
**Target:** Own profile page + view other users' profiles

**Implementation:**
- Own profile: avatar, name, email, follower/following counts, collections list
- Other user: same layout, follow/unfollow button
- Navigate from recipe author links or follower lists

**Files to modify:**
- New: `app/profile.tsx` — own profile
- New: `app/user/[id].tsx` — other user profile
- Reuse CollectionList from saved tab

**Effort:** 1 day

---

#### 8. Shopping List Real-Time Sharing
**Current:** Share as text via native share sheet
**Target:** Share link with live WebSocket sync (matching web)

**Implementation:**
- "Share" button generates a share link via `POST /api/v1/shopping-lists/:id/share`
- Share link via native share sheet
- When viewing a shared list, connect via WebSocket for real-time updates
- Show "Shared with N people" badge

**Files to modify:**
- `app/(tabs)/list.tsx` — add share link generation
- `src/hooks/useShoppingList.ts` — WebSocket connection for shared lists
- New: `app/shared-list/[token].tsx` — deep link handler for shared lists

**Effort:** 2 days

---

### P2 — Content & Polish

#### 9. Transparency Page
**Current:** Not implemented
**Target:** Monthly costs, funding progress, Ko-fi link

**Implementation:**
- New screen accessible from settings or about
- Fetch from `GET /api/v1/funding`
- Progress bar, cost breakdown, recent supporters
- Link to Ko-fi

**Files to modify:**
- New: `app/transparency.tsx`
- Reuse useFunding hook pattern from web

**Effort:** 0.5 days

---

#### 10. Ko-fi / Funding Card
**Current:** Not shown
**Target:** Small funding card on home screen

**Implementation:**
- Card showing monthly cost, funded percentage, progress bar
- "Buy me a coffee" button linking to Ko-fi
- Below featured recipes on home tab

**Files to modify:**
- `app/(tabs)/index.tsx` — add funding card section
- New: `src/hooks/useFunding.ts`

**Effort:** 0.5 days

---

#### 11. Manifesto / About Page
**Current:** Version number in settings only
**Target:** Full about page with project philosophy

**Implementation:**
- Static content page with editorial styling
- Accessible from settings → About

**Files to modify:**
- New: `app/about.tsx`

**Effort:** 0.25 days

---

## Style Alignment

### Current Style Differences

| Element | Mobile (current) | Web | Change needed |
|---|---|---|---|
| **Display font** | Lora 600 SemiBold | Instrument Serif (italic) | Swap to Instrument Serif |
| **Body font** | DM Sans 400/500 | Inter 400/500/600 | Swap to Inter |
| **Mono font** | None | JetBrains Mono | Add for labels/caps |
| **Accent color** | #E85D26 (orange) | #C45A30 (terracotta) | Update theme.ts |
| **Background** | #FAFAF8 | oklch(0.97 0.008 85) ≈ #F3F0EB | Update theme.ts |
| **Card style** | Rounded corners, shadows | Sharp corners, no shadows, borders | Update components |
| **Typography** | Standard weight hierarchy | Editorial: serif headings, mono caps, italic emphasis | Update text styles |
| **Buttons** | Rounded, filled | Sharp, mono uppercase, letter-spaced | Update button components |
| **Dividers** | Thin gray lines | Rule component with optional label | Add Rule component |

### Style Changes Required

#### 1. Font Swap
```typescript
// theme.ts — before
display: 'Lora_600SemiBold',
body: 'DMSans_400Regular',
bodyMedium: 'DMSans_500Medium',

// theme.ts — after
serif: 'InstrumentSerif_400Regular',
serifItalic: 'InstrumentSerif_400Italic',
sans: 'Inter_400Regular',
sansMedium: 'Inter_500Medium',
sansSemiBold: 'Inter_600SemiBold',
mono: 'JetBrainsMono_400Regular',
monoMedium: 'JetBrainsMono_500Medium',
```

**Expo font loading:**
```
expo install @expo-google-fonts/instrument-serif @expo-google-fonts/inter @expo-google-fonts/jetbrains-mono
```

#### 2. Color Update
```typescript
// theme.ts colors
light: {
  bg: '#F3F0EB',       // warm off-white (was #FAFAF8)
  bg2: '#EDE9E3',      // secondary bg
  ink: '#2D2923',       // near-black warm (was #1A1A18)
  ink2: '#5C5549',      // muted text
  ink3: '#8A8379',      // faint text
  rule: '#D4CFC8',     // divider
  rule2: '#BFB9B0',    // stronger divider
  accent: '#C45A30',   // terracotta (was #E85D26)
  accentInk: '#5C2415', // dark accent for caps labels
}
```

#### 3. Component Style Updates

**Buttons:** Remove borderRadius, add letterSpacing, uppercase mono font
```typescript
// Before
{ borderRadius: 12, backgroundColor: colors.accent }
// After
{ borderRadius: 0, backgroundColor: colors.ink, fontFamily: fonts.mono, textTransform: 'uppercase', letterSpacing: 1.5 }
```

**Cards:** Remove shadows and rounded corners, add borders
```typescript
// Before
{ borderRadius: 12, ...shadows.sm }
// After
{ borderRadius: 0, borderWidth: 1, borderColor: colors.rule }
```

**Section headers:** Use caps mono style
```typescript
// Before
<Text style={{ fontSize: 18, fontFamily: fonts.display }}>Trending</Text>
// After
<Text style={{ fontSize: 11, fontFamily: fonts.mono, textTransform: 'uppercase', letterSpacing: 1.5, color: colors.ink3 }}>◆ Trending this week</Text>
```

**Effort:** 2 days (pervasive — touches every component)

---

## Implementation Plan

### Phase 1: Core Features (3 days)
1. Search filters + modes (1 day)
2. Heart/voting system (0.5 days)
3. Similar recipes shelf (0.5 days)
4. Nutrition panel (0.5 days)
5. Multiple shopping lists (0.5 days — partial, extend existing)

### Phase 2: Style Alignment (2 days)
1. Font swap + color update (0.5 days)
2. Component style overhaul — buttons, cards, headers (1 day)
3. Section labels with caps mono pattern (0.5 days)

### Phase 3: Advanced Features (3 days)
1. Ingredient board (2 days)
2. User profiles (1 day)

### Phase 4: Polish (2 days)
1. Shopping list sharing with WebSocket (1.5 days)
2. Transparency page + Ko-fi card (0.5 days)

**Total: ~10 working days**

---

## API Endpoints Needed (already exist)

All endpoints are already built — no backend work required:

| Endpoint | Mobile Status |
|---|---|
| `GET /api/v1/search?mode=semantic&max_time=30&tags=vegan` | Not using mode/filters |
| `POST /api/v1/recipes/:id/heart` | Not implemented |
| `DELETE /api/v1/recipes/:id/heart` | Not implemented |
| `GET /api/v1/search/similar/:id` | Not implemented |
| `GET /api/v1/search/by-ingredients?have=...&exclude=...` | Not implemented |
| `GET /api/v1/ingredients/suggest?q=...` | Not implemented |
| `GET /api/v1/funding` | Not implemented |
| `GET /api/v1/users/:id` | Not implemented |
| `POST /api/v1/shopping-lists/:id/share` | Not implemented |
| WebSocket `/api/v1/shopping-lists/:id/ws` | Not implemented |

---

## Testing Plan

- [ ] Search: verify all modes return results, filters apply correctly
- [ ] Heart: verify optimistic update, vote count reflects on card
- [ ] Similar recipes: verify shelf shows relevant results, fallback works
- [ ] Nutrition: verify display for recipes with/without nutrition data
- [ ] Shopping lists: verify create/delete/switch, items persist per list
- [ ] Ingredient board: verify autocomplete, include/exclude, result accuracy
- [ ] Profiles: verify own profile loads, other user profile loads, follow/unfollow
- [ ] Sharing: verify link generation, WebSocket connection, real-time updates
- [ ] Styles: visual comparison with web on key screens (home, search, recipe, settings)
- [ ] Dark mode: verify all new components have dark mode variants
- [ ] Offline: verify new features degrade gracefully when offline

---

## Risk & Dependencies

| Risk | Mitigation |
|---|---|
| Instrument Serif may not render well at small sizes on mobile | Test early, fall back to Lora if needed |
| WebSocket for shopping lists adds complexity | Can ship without WS initially, use polling |
| Ingredient board is a new interaction pattern | Prototype in isolation first |
| Style overhaul touches every component | Do it in one batch, not incrementally |
| New fonts increase app bundle size | ~200KB total, acceptable |

---

## Out of Scope

- Push notifications (Phase 3)
- Recipe submission by users
- Social feed / activity stream
- Image upload for user recipes
- Meal planning calendar
- Pantry management beyond shopping lists
