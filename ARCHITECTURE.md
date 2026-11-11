# ContribLens v2 — Application Architecture

**Status:** Technical architecture source of truth · Brand: ContribLens · Build: Antigravity slices.

---

## 1. Architecture Goals

- Fully usable from a normal Chrome browser; responsive mobile → large desktop.
- Free-first, deployable on free tiers (Vercel Hobby, Supabase Free, OSV.dev free, Google AI Studio free tier).
- Safe when GitHub, OSV or AI providers fail — typed fallbacks, never fake success.
- Deterministic at the security-detection layer; evidence-linked at every recommendation.
- Testable without a browser at the scanner/domain layer.
- Privacy-preserving by default; zero code execution of scanned repositories.

## 2. Stack (locked)

| Layer | Choice | Reason |
|---|---|---|
| Web framework | Next.js 15 App Router + TypeScript strict | UI + secure server routes in one free-deployable app |
| UI | React 19 + Tailwind CSS 3.4 + CSS variables | Exact reference-driven visual control, no paid UI kits |
| Validation | Zod | Runtime validation at every external boundary |
| Auth/DB | Supabase Auth + PostgreSQL (+ RLS) | Free-first auth, RLS, persistence; local-JSON fallback for demo |
| AI | `@google/genai` server-only adapter | Primary `gemma-4-31b-it`, fallback `gemini-2.5-flash`, deterministic engine keyless |
| GitHub/OSV | Server-side `fetch` adapters | CORS, rate limits, caching controlled centrally |
| Rate limiting | Upstash Redis (free tier) | Protects scan + AI + GitHub-token quotas |
| Email | Resend (free tier) | Password reset / transactional |
| Testing | Vitest (+ fixture tests) | Unit/integration without a browser |
| Analytics | Vercel Analytics | Real usage numbers for /stats |
| Hosting | Vercel (free tier) | Simple serverless deploy, security headers |

Do not add a second UI framework, ORM, chart library, or state-management library unless a concrete requirement justifies it.

## 3. System Overview (4 layers)

```text
┌──────────────────────────────────────────────────────────────┐
│ Presentation — Landing · Auth · Dashboard · Scan · Findings  │
│ Contributions+Stack · Issue Drafts · Profile · /stats        │
└──────────────────────────────┬───────────────────────────────┘
                               │ typed view models
┌──────────────────────────────▼──────────────────────────────┐
│ Application layer                                            │
│ route guards · orchestration · auth context · Zod validation │
│ scan orchestration · AI request validation · preview limiter │
└──────────────────────────────┬──────────────────────────────┘
┌──────────────────────────────▼──────────────────────────────┐
│ Domain layer (PURE — never imports React/Next/Supabase/SDK)  │
│ evidence schema · scanner rules · technology detector        │
│ severity rules · readiness scoring · skills mapping ·        │
│ issue builder · disclosure guard · scan diff                 │
└──────────────────────────────┬──────────────────────────────┘
┌──────────────────────────────▼──────────────────────────────┐
│ Integration/data layer                                       │
│ GitHub REST · OSV batch · AI adapter (Gemma 4 31B → Gemini → │
│ deterministic) · Supabase + local-JSON · Upstash · Resend    │
└──────────────────────────────────────────────────────────────┘
```

The domain layer must never import React, Next.js request objects, Supabase clients or the `@google/genai` SDK.

## 4. Request/Data Flows

### 4.1 Scan flow

```text
Scan form (or anonymous preview)
  → POST /api/scans (or /api/preview/scan, 1/session, localStorage-bound)
  → Zod-validate URL + scope (partial | deep) + auth state
  → GitHub metadata/tree adapter (bounded: 20k entries)
  → bounded text fetcher (60 files / 180 KB / 15 MB; partial = top-level + src/)
  → pure scanner modules (workflows, manifests, health, secrets → redact → SHA-256)
  → OSV batch adapter for supported manifests
  → evidence normalization + technology detection
  → scan diff vs previous scan (new / resolved / unchanged)
  → persistence (Supabase; preview → localStorage only)
  → scan response view model
```

### 5. AI flow (locked model chain)

```text
Finding detail / contribution route
  → POST /api/ai/plan
  → authorize ownership (or preview ownership)
  → build minimal redacted evidence bundle
  → model chain:
      1. gemma-4-31b-it   (primary, Google AI Studio free tier)
      2. gemini-2.5-flash (fallback on quota/unavailability)
      3. deterministic rule engine (keyless — always available)
  → JSON schema validation → evidence-reference validation
  → persist (record model used) → English UI model with engine label
```

A 31B model cannot run on serverless — it is always API-served. The adapter interface stays provider-swappable.

## 5. Project Structure

```text
app/
  page.tsx                                  # landing (Sections A–J)
  login/page.tsx  signup/page.tsx  forgot-password/page.tsx
  stats/page.tsx  privacy/page.tsx  safety/page.tsx  security/page.tsx
  app/layout.tsx                            # authenticated glass shell + horizontal nav
  app/dashboard/page.tsx
  app/scan/page.tsx
  app/findings/page.tsx  app/findings/[findingId]/page.tsx
  app/contributions/page.tsx  app/contributions/[routeId]/page.tsx
  app/issue-drafts/page.tsx
  app/profile/page.tsx
  api/auth/{signup,login,logout,me,oauth/github}/route.ts
  api/scans/route.ts  api/scans/[scanId]/route.ts
  api/findings/route.ts  api/findings/[findingId]/route.ts
  api/routes/route.ts  api/routes/[routeId]/route.ts
  api/issue-drafts/route.ts
  api/ai/plan/route.ts  api/explain/route.ts
  api/preview/scan/route.ts
  api/profile/route.ts  api/health/route.ts  api/integrations/status/route.ts
  api/stats/route.ts
src/
  components/ui/        # glass primitives (GlassHeader, GlassPanel, ...)
  components/views/     # screen compositions
  lib/                  # domain: scanner/, redaction, readiness, gemini, db, config
  styles/               # tokens.css, globals.css
types/                  # canonical TS schemas
tests/                  # vitest suites + fixtures (labelled)
supabase/migrations/    # 001 schema + RLS, 002 tables
```

## 6. State Boundaries

- URL/page state: filters, selected finding, active route, scan scope.
- Server state: scans, findings, routes, drafts, activity.
- User preference state: theme, font scale, reduced motion.
- Auth state: Supabase session only; never raw credentials.
- Anonymous preview state: localStorage ONLY (flag + last demo result), never the database.
- Temporary UI state: scan progress, toasts, modals.

Prefer server components for read-heavy pages; client components only where interaction is required.

## 7. Failure Isolation (non-negotiable)

- GitHub failure → typed scan error; no findings created; no fake success.
- OSV failure → keep deterministic manifest/tech results; label dependency lookup unavailable.
- AI failure (Gemma 4 31B quota → Gemini → none): show deterministic explanation; UI labels the engine; draft generation still works from templates.
- DB failure → retryable persistence error; never silently claim saved state.
- Anonymous limit reached → friendly "create a free account to continue" state.

## 8. Free-First Deployment Modes

- **Local/demo mode:** Supabase optional; local fixtures demonstrate UI; fixture data ALWAYS labelled "Demo"; works with zero API keys.
- **Public MVP mode:** Supabase configured; server routes call GitHub + OSV; Gemma/Gemini optional with fallback; Upstash rate limits; deployed on Vercel free.
