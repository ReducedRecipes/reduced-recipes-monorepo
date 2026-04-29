---
name: debt
description: Track and manage tech debt. Use when the user says "tech debt", "TODO", "hack", "shortcut", "fix later", or wants to see what needs cleaning up.
argument-hint: "[add|list|resolve] [description]"
arguments: [action, description]
allowed-tools: Read, Write, Glob, Grep
---

# Tech Debt Register

Manage the tech debt register at `.claude/memory/tech-debt.md`.

## If action is "add" (or user mentions a shortcut/hack/workaround):

1. Read the current register (create if it doesn't exist).
2. Add a new entry:

```markdown
### DEBT-{NNN}: {title}
**Added**: {today's date}
**Severity**: Low | Medium | High | Critical
**Area**: workers | frontend | mobile | shared | ci
**What**: What's the shortcut or problem?
**Why it exists**: Why was this acceptable at the time?
**Fix when**: What trigger should prompt fixing this? (e.g. "when we hit 1000 users", "before adding feature X", "next major version")
**Estimated effort**: S / M / L
```

## If action is "list" or no action:

Show all open debt items grouped by severity, with a count summary.

## If action is "resolve":

Mark the matching entry as resolved with today's date and a brief note on how it was fixed.

## If action is "scan":

Scan the codebase for TODO, FIXME, HACK, XXX comments and cross-reference with the register. Report any untracked debt.

## Rules
- Not all debt is bad. Record the "fix when" trigger so we know when it matters.
- Don't add debt entries for things that are just unfinished features.
