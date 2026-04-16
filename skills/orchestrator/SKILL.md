---
name: orchestrator
description: Run the codeship-agent-flow multi-agent orchestrator to implement a feature across one or more repos. Use when the user asks to "run the orchestrator", "kick off a feature", "implement X across these repos", or similar. Covers launching, monitoring, cancelling, and interpreting runs.
---

# codeship-agent-flow orchestrator

This repo hosts a multi-agent pipeline (`codeship_orchestrator.py`) that takes
a requirement and a set of repos, then plans and implements the feature end
to end: story planning, parallel worker agents opening PRs, map-reduce quality
review, and delivery PRs for human merge.

## When to invoke

Use this skill when the user wants to:
- Run the orchestrator ("run it", "kick it off", "start a new run")
- Launch work against a list of repos without a Codeship project
- Check progress, scores, or blockers on an existing run
- Compare runs or inspect what the agents produced
- Cancel a stuck or runaway run

## Launching a run

The pipeline is invoked via `agentflow run codeship_orchestrator.py` with env
vars. There are two modes:

### Repos-only mode (preferred for ad-hoc runs)

Just give a list of GitHub repos and a requirement. No Codeship project lookup.

```bash
REPOS="org/repo-a,org/repo-b" \
REQUIREMENT="Add GitHub OAuth login" \
agentflow run codeship_orchestrator.py
```

Full URLs also work:

```bash
REPOS="https://github.com/org/repo-a,https://github.com/org/repo-b" \
REQUIREMENT="..." \
agentflow run codeship_orchestrator.py
```

Optional overrides:
- `PROJECT_NAME` — display name (default: first repo name)
- `TECH_STACK` — comma-separated tech list (e.g. `"Next.js,Node.js,TypeScript"`). Drives skill selection via `SKILL_MAP` in the orchestrator. Strongly recommended — without it the agents work from first principles.
- `FEATURE_BRANCH` — override the auto-generated branch name (useful to force a fresh start instead of reusing a previous run's branch)
- `WORKER_COUNT` (default 5), `MAX_WAVES` (default 12), `CONCURRENCY` (default 6)

### Codeship project mode

If the user references a Codeship project by name or UUID:

```bash
PROJECT="Source Control" REQUIREMENT="Add JWT auth" \
agentflow run codeship_orchestrator.py

PROJECT="8a3c8c28-f27f-4570-9487-52889f7a463a" REQUIREMENT="..." \
agentflow run codeship_orchestrator.py
```

This resolves repos + tech stack via the `ship` CLI. Requires `ship auth login`.

### Always run in the background

Runs take 30 minutes to several hours. Always launch with `run_in_background: true`
so the user can continue interacting. Capture the task ID and report the
agentflow run ID separately (see next section).

## Getting the run ID after launch

The `agentflow run` command doesn't print the run ID to its own stdout
immediately. After launching, wait ~10 seconds then:

```bash
agentflow runs
```

This returns JSON with all runs. The most recent one with `"status": "running"`
matching your requirement is the new run. Give the user its `id`.

## Monitoring progress

### Pipeline node status (coarse)

```bash
agentflow show <run-id> --output json-summary
```

Returns the pipeline state with each node's status: `pending`, `queued`,
`running`, `completed`, `failed`, `skipped`. Note: the `show` command lags
slightly behind actual worker state — workers may be active even when show
reports them as `pending`. Cross-check with process count:

```bash
ps aux | grep -c "claude -p"
```

### Scratchboard (the best source of truth)

All agents coordinate through a shared markdown file:

```
.agentflow/runs/<run-id>/scratchboard.md
```

Useful tail/grep patterns:

```bash
# Latest claims, done markers, PRs
tail -40 .agentflow/runs/<run-id>/scratchboard.md

# All completed stories
grep "^DONE:" .agentflow/runs/<run-id>/scratchboard.md

# Quality gate history
grep -E "VERDICT|BLOCKERS_FAILED|TOTAL_" .agentflow/runs/<run-id>/scratchboard.md

# Current wave count
grep -c "^## WAVE" .agentflow/runs/<run-id>/scratchboard.md
```

### Event log

```
.agentflow/runs/<run-id>/events.jsonl
```

One JSON event per line: `run_started`, `node_started`, `node_trace`,
`node_completed`, `node_failed`, `node_retrying`. Use it to count completed
waves or extract specific node outputs:

```bash
python3 -c "
import json
with open('.agentflow/runs/<run-id>/events.jsonl') as f:
    waves = sum(1 for l in f if json.loads(l).get('node_id')=='orchestrator' and json.loads(l)['type']=='node_completed')
print(f'Waves: {waves}')
"
```

## Understanding the quality gate

The gate is **checklist-based** — not numeric scoring. Each of 5 dimensions
(correctness, code_quality, test_coverage, security, integration) has a
fixed checklist split into two tiers:

- **BLOCKER** items must all pass for the run to ship. BLOCKER failures
  trigger another fix wave.
- **IMPROVEMENT** items are logged in the delivery PR but never block.

If the user asks about quality scores in a run, look for the `quality` block
in the scratchboard:

```
CORRECTNESS_BLOCKERS_FAILED: 0
CODE_QUALITY_BLOCKERS_FAILED: 1
...
TOTAL_BLOCKERS_FAILED: 1
VERDICT: FAIL
```

The gate passes only when `TOTAL_BLOCKERS_FAILED == 0`, at which point the
reducer emits `<<<QUALITY_GATE_PASSED>>>` and the pipeline moves to delivery.

## Cancelling a run

```bash
agentflow cancel <run-id>
```

Use this if the run is stuck, looping without progress, or if the user
explicitly asks to stop it.

## Common pitfalls

- **Reusing a feature branch from a previous run**: If `REQUIREMENT` slugs
  to the same branch name, workers will find the existing PRs and skip
  work. To force a fresh start, pass an explicit `FEATURE_BRANCH`.
- **Rate limits**: With `WORKER_COUNT=5` and many parallel agents, workers
  sometimes fail with Claude API rate limits. They retry once, then the
  orchestrator reassigns in the next wave.
- **`max_iterations` not strictly enforced**: The pipeline can go past
  `MAX_WAVES` in some cases (see issue #1). If a run loops indefinitely,
  cancel manually.
- **`ship` CLI not logged in**: Only matters in `PROJECT` mode. Use `REPOS`
  mode to avoid Codeship entirely.

## Comparing runs

To compare the output of two runs against the same requirement, clone the
affected repos and diff the feature branches:

```bash
cd /tmp && git clone https://github.com/org/repo && cd repo
git fetch origin feat/branch-v1 feat/branch-v2
git diff --stat main...origin/feat/branch-v1
git diff --stat main...origin/feat/branch-v2
```

Compare test counts, files changed, build status, and quality gate outcome
from each run's scratchboard.

## Pipeline file location

The orchestrator definition lives in:

```
codeship_orchestrator.py
```

Read this file directly when the user asks about pipeline structure, quality
dimensions, checklists, or wants to modify agent prompts. Key sections:

- Lines ~35-55: env var config
- Lines ~105-145: project/repos resolution (both modes)
- Lines ~280-330: pipeline graph definition
- Lines ~590-680: `QUALITY_DIMENSIONS` (the checklists)
- Lines ~680-730: reviewer and reducer prompts
