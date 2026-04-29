---
name: remember
description: Save something to the memory palace. Use when the user says "remember", "store this", "save for later", or "don't forget".
argument-hint: "[what to remember]"
arguments: [memory]
allowed-tools: Read, Write, Glob
---

# Remember

Save "$memory" to the memory palace at `.claude/memory/palace.md`.

## Process

1. Read the existing palace file (create if it doesn't exist with a `# Memory Palace` header).
2. Categorize the memory into one of these sections (create the section if it doesn't exist):

   - **Product insights** - user behavior observations, feature feedback, market insights
   - **Technical notes** - implementation details, gotchas, things that took long to figure out
   - **People and contacts** - who does what, external contacts, collaborators
   - **Ideas parking lot** - ideas mentioned in passing that aren't ready for brainstorming
   - **Preferences** - how the user likes things done, communication style, design preferences
   - **External resources** - useful links, tools, services, documentation

3. Add the entry with today's date:
   ```
   - [{date}] {memory content}
   ```

4. Write the updated file.

## Rules
- Deduplicate. If a similar memory exists, update it rather than adding a duplicate.
- Keep entries concise - one line each. Add context only if the bare fact would be ambiguous later.
- **NEVER store any of the following in memory or anywhere in the repo:**
  - Passwords, API keys, tokens, or secrets (even partially redacted)
  - Service account emails or key file contents
  - Account IDs, project IDs, or numeric identifiers for external services
  - Keystore passwords, aliases, or fingerprints
  - Any value that belongs in a GitHub secret or .env file
- When in doubt, describe the resource generically ("the GCP service account") rather than including identifiers.
