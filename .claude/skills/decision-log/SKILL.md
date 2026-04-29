---
name: decision-log
description: Record or query architectural decisions. Use when the user says "log decision", "why did we", or "record that we chose".
argument-hint: "[record|query] [description]"
arguments: [action, description]
allowed-tools: Read, Write, Glob, Grep
---

# Decision Log

Manage the architectural decision log at `.claude/memory/decisions.md`.

## If action is "record" (or user is stating a decision):

1. Read the current decisions file (create if it doesn't exist).
2. Add a new entry with this format:

```markdown
### DEC-{NNN}: {title}
**Date**: {today's date}
**Status**: Accepted
**Context**: Why was this decision needed?
**Decision**: What was decided?
**Alternatives considered**: What else was on the table?
**Consequences**: What are the trade-offs?
```

3. Number it sequentially based on existing entries.
4. Write the updated file.

## If action is "query" (or user is asking why something was decided):

1. Read the decisions file.
2. Search for entries matching "$description".
3. Present the relevant decision(s) with full context.
4. If no match found, say so and suggest checking git history.

## If no action specified:

Show the last 5 decisions as a summary table.

## Rules
- Decisions are immutable once recorded. To change one, add a new decision that supersedes it.
- Always include the "why" - the reasoning matters more than the what.
- Link to relevant specs or PRs when possible.
