# Session Journal

## 2026-04-28

### What was done
- Fixed 98 failing tests across frontend, mobile, and workers packages
- Synced pnpm-lock.yaml with package.json
- Added release-please for automated versioning (workflow, config, manifest)
- Made web TopBar version dynamic via Vite define (__APP_VERSION__)
- Created CLAUDE.md and AGENTS.md for agent onboarding
- Set up EAS project under reduced-recipes org (new project ID)
- Configured mobile CI: build + auto-submit to Google Play internal track
- Fixed Android signing key (downloaded old keystore from nikrich, uploaded to new project)
- Created Google Cloud service account for Play Store API access
- Granted service account Admin permissions in Play Console
- Closed 16 redundant PRs
- Created custom slash commands: brainstorm, challenge, decision-log, feature-map, debt, journal, remember, recall

### Key decisions made
- DEC-001: Single monorepo version via release-please
- DEC-002: workflow_call for mobile builds (GITHUB_TOKEN tag limitation)
- DEC-003: Auto-submit to internal track, manual promotion to production

### Files changed
- Created: CLAUDE.md, AGENTS.md, release-please-config.json, .release-please-manifest.json
- Created: .github/workflows/release-please.yml
- Modified: .github/workflows/mobile.yml, .github/workflows/deploy.yml
- Modified: packages/mobile/app.json, packages/mobile/eas.json
- Modified: packages/frontend/vite.config.ts, vitest.config.ts
- Modified: 30+ test files across all packages
- Created: .claude/skills/* (8 custom commands), .claude/memory/* (4 memory files)

### Open threads
- iOS build not configured (needs Apple Developer credentials)
- expo-updates not installed (OTA updates not set up)
- Preview APK build queued for emulator testing

### Blockers or issues hit
- GitHub Actions can't create PRs without org-level permission change
- release-please tags included component prefix (fixed with include-component-in-tag: false)
- GITHUB_TOKEN tags don't trigger other workflows (fixed with workflow_call)
- Google Play Console API access page missing for personal accounts (worked around via Users and Permissions)
- Service account needed Admin permissions, not just Release to testing tracks
