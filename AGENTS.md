# ContribLens v2 — AGENTS.md (Antigravity Agent Instructions)

**Purpose:** Single entry-point for any AI agent (Antigravity / Kilo) working on the ContribLens v2 build. Read this FIRST, then follow the docs read order.

## Project Identity (locked)

- Brand: **ContribLens** (never ContribShield / ContriBLens / Patchloom).
- Positioning: "Security findings → beginner pull requests."
- English-only UI copy. Dark theme default.

## Docs Read Order

1. README.md → 2. PRD.md → 3. SKILL.md → 4. ARCHITECTURE.md → 5. DESIGN.md → 6. ROUTES_AND_STATES.md → 7. EVIDENCE_AND_SCHEMAS.md → 8. SCANNER_RULES.md → 9. DATABASE.md → 10. API_INTEGRATION.md → 11. SECURITY.md → 12. IMPLEMENTATION.md

## Build Discipline (Antigravity)

- Implement ONE phase at a time from `IMPLEMENTATION.md` (Phases 0 → 10). Never batch phases.
- Gate after every phase: `npm run lint && npm run typecheck && npm test && npm run build` all green → verify the route in Chrome (desktop + mobile) → then next phase.
- Commit after each green phase.

## Locked Decisions (do not change)

- Stack: Next.js 15 App Router + React 19 + TS strict + Tailwind 3.4 + Zod + Vitest · Supabase (email + GitHub OAuth) + RLS + local-JSON fallback · Vercel free · OSV.dev (no key) · Upstash · Resend · GitHub Actions CI.
- AI chain (server-only): `gemma-4-31b-it` (primary, `GEMINI_MODEL=gemma-4-31b-it`) → `gemini-2.5-flash` (fallback) → deterministic rule engine (keyless). UI labels the engine used.
- Design: 12-token palette + liquid glass + smoky ambient background per `DESIGN.md` — no second design system, no neon lime/indigo/mint/rainbow.
- Features: anonymous preview (labelled Demo), partial scan, scan diff, Skills Gap, /stats. NO Hacktoberfest page. NO phone auth (v2.1). NO auto-PR. NO paid dependencies.
- Safety invariants: zero code execution of scanned repos · in-memory secret redaction before storage/AI/logs · SHA-256 evidence hashes · prompt-injection defense · disclosure guard · human approval for all external publication · scanner rules own severity.

## Git Push Rules (user-required)

- Jab bhi GitHub pe push karna ho, push se pehle commit timestamps current time ke set karo: `.git` delete karke `git init`, remote add origin, `git add -A`, fresh commit, phir push.
- Push hamesha current date/time wale commit ke saath ho.

**Caution (read before executing):** `.git` deletion permanently erases branch history and local reflog — keep a backup of the folder or push a copy first. Fresh-init pushes lose merge history and make the commit timeline uniform. Prefer this only when a clean-slate history is intended.

## Standard Workflow Commands

```bash
npm install
npm run dev          # http://localhost:3000
npm run lint && npm run typecheck && npm test && npm run build
npm run check:integrations
```

## Doc Map (this folder)

PRD.md (requirements) · DESIGN.md (UI/UX: palette, smoky background, liquid glass, Sections A–J) · ARCHITECTURE.md (layers, flows, failure isolation) · DATABASE.md (Supabase + RLS + local fallback) · API_INTEGRATION.md (endpoints + adapters) · SCANNER_RULES.md (deterministic rules) · ROUTES_AND_STATES.md (routes + state machines) · EVIDENCE_AND_SCHEMAS.md (evidence/AI contracts) · README.md (overview + quickstart) · SKILL.md (agent rules) · SECURITY.md (threat model + disclosure) · IMPLEMENTATION.md (phases 0–10).

**Read order:** README → PRD → SKILL → ARCHITECTURE → DESIGN → ROUTES_AND_STATES → EVIDENCE_AND_SCHEMAS → SCANNER_RULES → DATABASE → API_INTEGRATION → SECURITY → IMPLEMENTATION → AGENTS.md (this file, for working rules).
