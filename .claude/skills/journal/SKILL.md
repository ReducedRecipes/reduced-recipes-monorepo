---
name: journal
description: Auto-summarize what was accomplished in this session. Use at the end of a conversation or when the user says "journal", "summarize session", or "what did we do".
allowed-tools: Read, Write, Glob
---

# Session Journal

Create a session summary and append it to `.claude/memory/journal.md`.

## Process

1. Review the full conversation history.
2. Create an entry:

```markdown
## {today's date} - {time if available}

### What was done
- {bullet list of concrete accomplishments}

### Key decisions made
- {any architectural or product decisions}

### Files changed
- {list of files created, modified, or deleted}

### Open threads
- {anything left unfinished or needs follow-up}

### Blockers or issues hit
- {problems encountered and how they were resolved}
```

3. Read the existing journal file (create if needed).
4. **Prepend** the new entry (newest first).
5. Write the updated file.

## Rules
- Be factual, not narrative. "Added release-please workflow" not "We had a great session working on CI/CD".
- Only record things that actually happened, not plans.
- Keep each entry under 20 lines.
- If a decision was made, also suggest running `/decision-log record` for important ones.
