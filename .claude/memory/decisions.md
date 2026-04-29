# Decision Log

### DEC-001: Single monorepo version managed by release-please
**Date**: 2026-04-28
**Status**: Accepted
**Context**: Needed automated versioning across web, mobile, and workers that stay in sync.
**Decision**: Use release-please with a single version in root package.json, synced to all sub-packages and mobile app.json via extra-files config.
**Alternatives considered**: Per-package versioning (too complex for a small team), manual versioning (error-prone), changesets (more ceremony than needed).
**Consequences**: All packages share one version number. A fix: in workers bumps the mobile version too. Acceptable trade-off for simplicity.

### DEC-002: Use workflow_call instead of tag triggers for mobile builds
**Date**: 2026-04-28
**Status**: Accepted
**Context**: Tags created by GitHub Actions GITHUB_TOKEN don't trigger other workflows (GitHub security policy).
**Decision**: release-please.yml calls mobile.yml via workflow_call with secrets: inherit when a release is created.
**Alternatives considered**: Using a PAT instead of GITHUB_TOKEN (security risk, token management overhead), separate manual trigger (defeats automation purpose).
**Consequences**: Mobile build is tightly coupled to the release-please workflow. Can't trigger mobile builds independently via tags from the GitHub UI.

### DEC-003: EAS auto-submit to internal testing track
**Date**: 2026-04-28
**Status**: Accepted
**Context**: Wanted fully automated deployment to Play Store on release.
**Decision**: Use --auto-submit flag with eas build, targeting the internal track. Service account key written from GitHub secret to a temp file at build time.
**Alternatives considered**: Separate submit step (more control but more complexity), direct fastlane (would need Ruby setup in CI).
**Consequences**: Every release goes to internal testing automatically. Promotion to production is manual (intentional gate).
