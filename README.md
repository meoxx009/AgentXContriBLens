# ContribLens

> **Security findings → beginner pull requests.**

[![Next.js 15](https://img.shields.io/badge/Next.js-15-black?style=flat&logo=next.js)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19-blue?style=flat&logo=react)](https://react.dev/)
[![TypeScript strict](https://img.shields.io/badge/TypeScript-strict-blue?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![AI: gemma-4-31b-it](https://img.shields.io/badge/AI-gemma--4--31b--it-8E75B2)](https://ai.google.dev/gemma/docs)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**ContribLens** bridges the gap between open-source repository maintainers and new contributors. It scans public GitHub repositories for verified security hygiene issues and automatically turns those findings into bite-sized, beginner-ready pull request plans with plain-English explanations, test steps, acceptance criteria, and curated skills to learn.

**Core Principle:** `Code verifies. AI explains. Human approves.`

---

## What it does

```text
Public GitHub repo
  → read-only deterministic scan (zero code execution, bounded ingestion)
  → exact redacted evidence (SHA-256 hashed)
  → OSV.dev advisory cross-check for vulnerable dependencies
  → plain-English explanation (Gemma 4 31B → Gemini 2.5 Flash → deterministic fallback)
  → beginner-ready PR plan: target files, suggested change, test plan, acceptance criteria
  → Skills Gap: what you will learn + free curated documentation links + contributor level
  → maintainer-reviewable issue draft (strictly disclosure-guarded)
```

---

## Core Features

* **Deterministic Static Scanner** — Static rule engine analyzing GitHub Actions workflows, manifest dependencies, repository health, and exposed credential patterns without executing any repository code.
* **Verified Findings with Evidence** — Every finding includes exact file paths, line ranges, redacted code snippets, and a cryptographically verifiable SHA-256 evidence hash.
* **Plain-English AI Explanations** — Grounded explanations structured into three clear parts (*What happened*, *Why it matters*, *How to fix*). Backed by a 3-tier server-side AI hierarchy (`gemma-4-31b-it` primary $\to$ `gemini-2.5-flash` fallback $\to$ deterministic rule engine offline). The UI transparently indicates which engine generated each explanation.
* **Beginner Contribution Routes** — Findings are translated into manageable PR plans with beginner readiness scores (0–100), estimated completion times, suggested branches, concrete test plans, and acceptance criteria.
* **Skills Gap & Learning Paths** — Pinpoints exactly which technologies and security practices the contributor will learn (e.g., GitHub Actions least-privilege token permissions, dependency pinning, secret rotation), complete with free documentation links.
* **Maintainer-Reviewable Issue Drafts** — Generates complete 8-section GitHub-ready Markdown drafts. ContribLens enforces an automated **Disclosure Guard** that strictly blocks public issue creation for critical vulnerabilities and exposed credentials (`403 DISCLOSURE_BLOCKED`), mandating private maintainer reporting.
* **Scan Diff & Comparison** — Tracks recurring scans over time, highlighting newly introduced, resolved, and unchanged findings across repository branches.
* **Public Activity & Stats** — Real-time aggregate platform metrics at `/stats` showing verified findings resolved and community learning progress without exposing sensitive user data.
* **Real-Data Only Architecture** — ContribLens is auth-gated and operates exclusively on real repositories and authenticated contributor accounts. Zero demo fixtures or mock bypasses.

---

## Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Framework** | [Next.js 15](https://nextjs.org/) (App Router) · [React 19](https://react.dev/) · [TypeScript](https://www.typescriptlang.org/) (strict mode) |
| **Styling & Design** | [Tailwind CSS 3.4](https://tailwindcss.com/) · Apple Liquid Glass material system · Locked 12-token palette · Smoky ambient background |
| **Validation & Testing** | [Zod 3.24](https://zod.dev/) · [Vitest 3.0](https://vitest.dev/) (50 test files, 630 automated unit & integration tests) |
| **Auth & Database** | [Supabase](https://supabase.com/) (Email + GitHub OAuth, PostgreSQL with Row Level Security) + Local-JSON fallback in `.data/` |
| **AI Inference** | Google DeepMind **Gemma 4 31B** (`gemma-4-31b-it`) $\to$ **Gemini 2.5 Flash** $\to$ Offline Deterministic Engine |
| **External APIs & Infra** | [OSV.dev](https://osv.dev/) (Open Source Vulnerability API) · [Upstash Redis](https://upstash.com/) · [Resend](https://resend.com/) · [Vercel](https://vercel.com/) |

---

## Quickstart (Zero-Config)

ContribLens works out of the box with **zero required API keys** using the built-in deterministic rule engine and file-backed local JSON storage.

```bash
# 1. Clone the repository
git clone https://github.com/meoxx009/AgentXContriBLens.git contriblens
cd contriblens

# 2. Install dependencies
npm install

# 3. Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. Create an account, log in, and scan any public GitHub repository.

---

## Environment Variables

To enable Google Gemini AI inference, live Supabase cloud database synchronization, and higher GitHub API rate limits, copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

| Variable | Required | Scope | Description |
| :--- | :---: | :---: | :--- |
| `NEXT_PUBLIC_APP_URL` | Optional | Client/Server | Base application URL (default: `http://localhost:3000`) |
| `JWT_SECRET` | Required | Server-only | Secret key used for signing session JWT tokens |
| `NEXT_PUBLIC_SUPABASE_URL` | Optional | Client/Server | Supabase project URL (falls back to `.data/` if omitted) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Optional | Client/Server | Supabase public anonymous API key |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional | Server-only | Supabase administrative service role key |
| `GEMINI_API_KEY` | Optional | Server-only | Google AI Studio key for live Gemma/Gemini model inference |
| `GEMINI_MODEL` | Optional | Server-only | Primary AI model identifier (default: `gemma-4-31b-it`) |
| `GEMINI_API_TIMEOUT_MS` | Optional | Server-only | Maximum timeout in ms for AI calls (default: `15000`) |
| `GITHUB_TOKEN` | Optional | Server-only | Read-only GitHub PAT for public repositories (increases rate limit from 60 to 5,000 req/hr) |
| `SCAN_MAX_FILES` | Optional | Server-only | Maximum candidate files analyzed per scan (default: `60`) |
| `SCAN_MAX_FILE_BYTES` | Optional | Server-only | Maximum individual file size in bytes (default: `180000` — 180 KB) |
| `SCAN_MAX_TOTAL_BYTES` | Optional | Server-only | Maximum total payload bytes ingested (default: `15728640` — 15 MB) |
| `SCAN_MAX_TREE_ENTRIES` | Optional | Server-only | Maximum repository tree entries parsed (default: `20000`) |
| `ENABLE_GEMINI` | Optional | Server-only | Toggle live Gemini AI generation (default: `true`) |
| `ENABLE_OSV` | Optional | Server-only | Toggle OSV.dev advisory lookups (default: `true`) |

> [!IMPORTANT]
> All provider tokens (`GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GITHUB_TOKEN`) are strictly quarantined on the server. They are never exposed in browser bundles or client-side responses.

---

## Available Scripts

```bash
# Run local development server (with automated .next cache clean safeguard)
npm run dev

# Run ESLint across src/
npm run lint

# Run strict TypeScript compiler verification without emitting files
npm run typecheck

# Run complete Vitest test suite (50 suites, 630 tests)
npm test

# Build optimized production bundle
npm run build

# Start production server
npm start

# Run live provider integration diagnostics
npm run check:integrations
```

---

## Deploy to Vercel

ContribLens is built and optimized for seamless zero-cost deployment on the **Vercel Hobby (Free) Tier**:

1. Push your repository to GitHub.
2. Log in to [Vercel](https://vercel.com/) and click **Add New...** $\to$ **Project**.
3. Import your `AgentXContriBLens` repository.
4. Under **Environment Variables**, add the values from your `.env.local`:
   - `NEXT_PUBLIC_APP_URL` (set to your Vercel production URL, e.g. `https://hacktoberfest-contri-blens.vercel.app`)
   - `JWT_SECRET` (generate a secure random 32-character string)
   - `NEXT_PUBLIC_SUPABASE_URL` & `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GEMINI_API_KEY` & `GEMINI_MODEL=gemma-4-31b-it`
   - `GITHUB_TOKEN` (recommended for production traffic)
5. Click **Deploy**. Vercel will run `npm run build` and launch the app globally on the Edge Network.

---

## Security Architecture

* **Zero Repository Code Execution** — ContribLens never clones, executes, evaluates, or runs scripts from scanned repositories. Ingestion is strictly static and read-only.
* **In-Memory Secret Redaction** — Detected credentials (PATs, API keys, private keys, authorization tokens) are redacted in-memory before storage, logging, or transmission to AI models.
* **Cryptographic Evidence Hashing** — Every detected security finding is validated by an immutable SHA-256 checksum over the redacted evidence snippet.
* **Automated Disclosure Guard** — High-risk secret exposures and critical vulnerabilities strictly block public issue draft generation, enforcing responsible security disclosure directly to project maintainers.
* **Human-in-the-Loop Approval** — ContribLens never creates pull requests, commits, or public issues autonomously. Human maintainer and contributor review is mandatory.
* **Server Secret Quarantine** — Client bundles are continuously audited; zero provider credentials reach browser assets.

---

## Documentation Index

| Documentation File | Description & Purpose |
| :--- | :--- |
| [`PRD.md`](PRD.md) | Product Requirements Document: user personas, problems, and core workflows |
| [`DESIGN.md`](DESIGN.md) | Visual Design System: locked 12-token palette, liquid glass components, layout specifications |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | 4-layer system architecture, data flow pipelines, and failure isolation boundaries |
| [`ROUTES_AND_STATES.md`](ROUTES_AND_STATES.md) | Application route hierarchy, view states (loading, empty, error, success), and state machines |
| [`EVIDENCE_AND_SCHEMAS.md`](EVIDENCE_AND_SCHEMAS.md) | Formal JSON evidence schemas, AI explanation contracts, and validation rules |
| [`SCANNER_RULES.md`](SCANNER_RULES.md) | Deterministic static analysis rules for GitHub Actions, secrets, manifests, and repo health |
| [`DATABASE.md`](DATABASE.md) | Database architecture: Supabase PostgreSQL schema, RLS policies, and local JSON storage |
| [`API_INTEGRATION.md`](API_INTEGRATION.md) | Internal REST API routes, provider adapters, error specifications, and response formats |
| [`SECURITY.md`](SECURITY.md) | Threat model, defense-in-depth mitigations, secret handling, and disclosure guard |
| [`SKILL.md`](SKILL.md) | Engineering standards, coding invariants, and architectural guidelines |
| [`IMPLEMENTATION.md`](IMPLEMENTATION.md) | Phase-by-phase implementation plan and release checklist |
| [`docs/handoff-g-series.md`](docs/handoff-g-series.md) | Comprehensive G-Series validation report, test records, and handoff audit |

---

## License

This project is licensed under the [MIT License](LICENSE) © 2026 ContribLens.
