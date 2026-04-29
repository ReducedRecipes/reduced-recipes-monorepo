# Tech Debt Register

### DEBT-001: iOS build not in CI pipeline
**Added**: 2026-04-28
**Severity**: Medium
**Area**: ci
**What**: iOS build step removed from mobile.yml - only Android builds automatically.
**Why it exists**: No Apple Developer credentials configured yet (ASC_API_KEY_ID, ASC_API_KEY_ISSUER_ID, ASC_API_KEY).
**Fix when**: When Apple Developer account is set up and app is ready for App Store submission.
**Estimated effort**: S

### DEBT-002: expo-updates not installed
**Added**: 2026-04-28
**Severity**: Low
**Area**: mobile
**What**: EAS build warns that expo-updates isn't installed but channels are configured in eas.json.
**Why it exists**: OTA updates not needed yet, app is in early development.
**Fix when**: When you want to push JS-only updates without a full native build.
**Estimated effort**: S

### DEBT-003: Upload key mismatch with Google Play
**Added**: 2026-04-28
**Severity**: High
**Area**: mobile
**What**: New EAS project created a new keystore. Upload key reset requested from Google Play but may not have been processed.
**Why it exists**: Migrated from nikrich personal Expo account to reduced-recipes org. Downloaded old keystore and uploaded to new project.
**Fix when**: Verify next Play Store submission succeeds. If it does, mark this resolved.
**Estimated effort**: N/A (waiting on Google)
**Status**: Possibly resolved - v1.3.8 submitted successfully
