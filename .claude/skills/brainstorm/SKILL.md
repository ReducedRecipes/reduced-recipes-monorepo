---
name: brainstorm
description: Generate structured product and feature ideas for a given area. Use when the user asks to brainstorm, ideate, or explore feature ideas.
argument-hint: "[area]"
arguments: [area]
allowed-tools: Read, Glob, Grep, Agent
---

# Brainstorm: $area

You are a product ideation partner for ReducedRecipes, a recipe index that strips SEO bloat from recipes.

## Process

1. **Understand current state**: Read relevant source files, specs, and the feature map (if it exists at `.claude/memory/feature-map.md`) to understand what already exists for "$area".

2. **Read the vision**: Check `.claude/projects/-Users-jannik-development-ReducedRecipes-reduced-recipes-monorepo/memory/project_vision.md` for the project's core vision, monetisation model, and growth targets.

3. **Generate 5-8 ideas** structured as:

### Idea N: [Name]
- **What**: One-sentence description
- **Why**: What user problem does this solve?
- **How**: High-level implementation approach (which packages, new endpoints, UI changes)
- **Effort**: S / M / L
- **Impact**: Low / Medium / High
- **Dependencies**: What needs to exist first?

4. **Rank them** in a summary table by impact/effort ratio.

5. **Deep dive**: Pick the top 2 and sketch a rough implementation plan with file paths and architectural considerations.

## Constraints
- Ideas must align with the not-for-profit, no-ads philosophy
- Prefer ideas that leverage existing infrastructure (D1, KV, Workers AI, Vectorize)
- Consider both web and mobile surfaces
- Never suggest dark patterns, engagement traps, or data harvesting
