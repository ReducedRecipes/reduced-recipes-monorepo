---
name: feature-map
description: View or update the living feature map that tracks where every feature is implemented across all packages. Auto-invoked when agents need to find feature implementations.
argument-hint: "[update|query|show] [feature-name]"
arguments: [action, feature]
user-invocable: true
allowed-tools: Read, Write, Glob, Grep, Agent
---

# Feature Map

Manage the feature map at `.claude/memory/feature-map.md`.

## If action is "update" or "rebuild":

Scan the entire codebase and rebuild the feature map. For each feature, record:

```markdown
### {Feature Name}
- **API**: `packages/workers/src/routes/{file}.ts` - endpoints
- **Web**: `packages/frontend/src/pages/{Page}.tsx` - UI
- **Mobile**: `packages/mobile/app/{screen}.tsx` - screen
- **Hooks**: `packages/{pkg}/src/hooks/use{Hook}.ts`
- **Store**: `packages/mobile/src/stores/{store}.ts`
- **DB**: `migrations{-suffix}/{migration}.sql` - tables
- **Status**: Complete | Partial (web only) | Planned
```

Features to map (scan for all of these):
- Authentication (Google OAuth, sessions)
- Recipe browsing (listing, filtering, search)
- Recipe detail (view, cook mode)
- Bookmarks / Saved recipes
- Collections
- Shopping lists (CRUD, real-time sync, sharing)
- Hearts / Voting
- User profiles / Follows
- Notifications
- Dietary preferences
- Ingredient search ("what's in your fridge")
- Semantic search (Vectorize)
- Onboarding
- Settings / Preferences
- Funding / Transparency

## If action is "query" or user asks "where is X implemented":

1. Read the feature map.
2. Find the matching feature.
3. Return the file paths and status.

## If action is "show" or no action:

Display the full feature map as a table.
