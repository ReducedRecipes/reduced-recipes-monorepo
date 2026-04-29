---
name: recall
description: Search the memory palace for stored memories. Auto-invoked when context from past sessions might be relevant. Use when the user says "recall", "what did we", "do you remember", or "look up".
argument-hint: "[search query]"
arguments: [query]
allowed-tools: Read, Glob, Grep
---

# Recall

Search all memory palace files for information matching "$query".

## Process

1. Search across ALL memory files in `.claude/memory/`:
   - `palace.md` - general memories
   - `decisions.md` - architectural decisions
   - `feature-map.md` - feature implementations
   - `tech-debt.md` - known debt
   - `journal.md` - session history

2. Also check the auto-memory system at the path stored in the user's MEMORY.md index.

3. Present findings grouped by source:

```
### From decisions
- DEC-003: We chose D1 over Turso because...

### From journal
- [2026-04-28] Set up release-please, fixed signing key...

### From memory palace
- [2026-04-25] User prefers editorial newspaper aesthetic...
```

4. If nothing found, say so clearly. Don't fabricate memories.

## Rules
- Search broadly. A query for "auth" should match "authentication", "login", "session", "OAuth", "Google sign-in".
- Show the date of each memory so the user can judge recency.
- If a memory might be stale (older than 2 weeks), flag it with a note.
