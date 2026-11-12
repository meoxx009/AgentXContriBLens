# ContribLens

> **Security findings → beginner pull requests.**
> Paste any public GitHub repo. Get verified findings, a plain-English explanation, and a beginner-ready PR plan with tests, acceptance criteria, and the skills you'll learn — exportable as a maintainer-reviewable issue draft.

[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-blue?style=flat&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![AI](https://img.shields.io/badge/AI-gemma--4--31b--it-8E75B2)](https://ai.google.dev/gemma/docs)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Principle:** `Code verifies. AI explains. Human approves.`

---

## What it does

```text
Public GitHub repo
  → read-only deterministic scan (zero code execution, bounded ingestion)
  → exact redacted evidence, SHA-256 hashed · OSV cross-check for dependencies
  → grounded AI explanation (Gemma 4 31B → Gemini → deterministic keyless fallback)
  → contribution route: files, suggested change, test plan, acceptance criteria
  → Skills Gap: what you'll learn + free learning links + contributor level
  → maintainer-reviewable issue draft (disclosure-guarded)
```

## Core Features

1. **Try without account** — labelled demo or 1 keyless live scan per session; value in <2 minutes, no signup.
2. **Deterministic scanner** — GitHub Actions audits, manifest parsing, repo health, secret redaction; zero code execution.
3. **Findings with evidence** — file:line, code context, SHA-256 hash, confidence, disclosure label.
4. **Skills Gap panel** — what you learn + free learning links + contributor level.
5. **Contribution routes** — readiness score (0–100), Impact & Route Graph, status tracking.
6. **Issue drafts** — maintainer-reviewable Markdown; disclosure guard blocks secrets/critical.
7. **Scan diff** — new / resolved / unchanged across repeat scans; partial scan handles big repos gracefully.
8. **Public /stats** — real usage counters.

## Tech Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 15 (App Router) · React 19 · TypeScript strict |
| Styling | Tailwind CSS 3.4 + liquid-glass design system + smoky ambient background |
| Validation / Tests | Zod · Vitest |
| Auth/DB | Supabase (email auth, PostgreSQL + RLS) + local-JSON fallback |
| AI | **Gemma 4 31B** (`gemma-4-31b-it`) → `gemini-2.5-flash` → deterministic engine (server-only) |
| Infra | OSV.dev (free, no key) · Upstash Redis (rate limits) · Resend (email) · Vercel Analytics · GitHub Actions CI |

## Quickstart (zero-config)

```bash
git clone https://github.com/meoxx009/AgentXContriBLens.git contriblens
cd contriblens && npm install
npm run dev            # http://localhost:3000 — works with ZERO API keys
```

The deterministic engine powers explanations and routes without any keys. Add keys for the full AI experience:

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=      NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=     # server-only
GEMINI_API_KEY=                # server-only
GEMINI_MODEL=gemma-4-31b-it
GITHUB_TOKEN=                  # server-only, read-only public scope (60→5000 req/hr)
SCAN_MAX_FILES=60  SCAN_MAX_FILE_BYTES=180000  SCAN_MAX_TOTAL_BYTES=3000000  SCAN_MAX_TREE_ENTRIES=20000
```

## Scripts

```bash
npm run dev            # dev server
npm run lint           # ESLint
npm run typecheck      # tsc --noEmit
npm test               # Vitest suites
npm run build          # production build
npm run check:integrations
```

## Testing Gates (per slice)

`npm run lint && npm run typecheck && npm test && npm run build` — all green before moving on. Keyless run must produce concrete explanations. See IMPLEMENTATION.md.

## Deployment (Vercel free)

Push → import in Vercel → set env vars (`NEXT_PUBLIC_APP_URL`, Supabase trio, `GEMINI_API_KEY`, `GEMINI_MODEL=gemma-4-31b-it`, `GITHUB_TOKEN`) → deploy → verify keyless flow + auth + scan + fallback. `.env*` never committed.

## Security Summary

- Zero code execution of scanned repos · bounded ingestion · secrets redacted in-memory before storage/AI/logs · SHA-256 evidence hashes · prompt-injection defense · disclosure guard blocks public drafts for secrets/critical · human approval required for all external publication · API keys never reach the browser.

## Documentation Index

| Doc | Purpose |
|---|---|
| `PRD.md` | Product requirements & personas |
| `DESIGN.md` | UI/UX system: palette, smoky background, liquid glass, Sections A–J |
| `ARCHITECTURE.md` | 4-layer architecture, flows, failure isolation |
| `DATABASE.md` | Supabase schema, RLS, persistence modes |
| `API_INTEGRATION.md` | Internal API + provider adapters |
| `SCANNER_RULES.md` | Deterministic detection rules |
| `ROUTES_AND_STATES.md` | Routes + state machines |
| `EVIDENCE_AND_SCHEMAS.md` | Evidence & AI contracts |
| `SKILL.md` | Agent working rules |
| `SECURITY.md` | Security model & disclosure |
| `IMPLEMENTATION.md` | Phase-by-phase build plan |

**Read order for Antigravity:** README → PRD → SKILL → ARCHITECTURE → DESIGN → ROUTES_AND_STATES → EVIDENCE_AND_SCHEMAS → SCANNER_RULES → DATABASE → API_INTEGRATION → SECURITY → IMPLEMENTATION.

## License

MIT © 2026 ContribLens
