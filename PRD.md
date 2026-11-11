# ContribLens v2 — Product Requirements Document (PRD)

**Status:** Build source of truth · **Build method:** Antigravity (slice-by-slice) · **Version:** v2 · **Date:** 2026-10-29

---

## 1. Document Control

| Field | Decision |
|---|---|
| Product | **ContribLens** (one brand everywhere — never ContribShield / ContriBLens / Patchloom) |
| Positioning | **"Security findings → beginner pull requests."** |
| Primary language | English (all UI copy, errors, drafts, AI output) |
| Audience | Students, first-time contributors, open-source maintainers, hackathon judges |
| Deployment | Free-first (Vercel Hobby + Supabase Free + OSV.dev free + Google AI Studio free tier) |
| AI provider | **Gemma 4 31B** (`gemma-4-31b-it`, primary) → `gemini-2.5-flash` (fallback) → deterministic rule engine (keyless). Server-side only via `@google/genai`. |
| Auth | Email + password + **GitHub OAuth** (phone login deferred to v2.1) |
| Explicitly excluded | Hacktoberfest page, auto-PR/issue publishing, team features, any paid dependency |

## 2. Product Vision

ContribLens scans any public GitHub repository, **deterministically verifies** security and hygiene issues, explains them in plain English, and transforms each verified finding into a **beginner-friendly contribution plan** — exact file, suggested change, test plan, acceptance criteria, skills you will learn (with free learning links) — exportable as a maintainer-reviewable issue draft.

The core value transformation:

```text
Public GitHub repo
  → read-only deterministic scan (zero code execution)
  → exact redacted evidence (SHA-256 hashed)
  → OSV cross-check for dependencies
  → Gemma/Gemini grounded explanation (deterministic fallback when keyless)
  → contribution route (files, tests, acceptance criteria, skills)
  → maintainer-reviewable issue draft (disclosure-guarded)
```

AI never invents security facts. Code verifies → AI explains → human approves.

## 3. Problem Statement

1. **Beginners** want to contribute but cannot find a safe, verified, well-explained first task. Generic tools dump CVE jargon.
2. **Generic AI tools** hallucinate vulnerabilities, invent file paths, and leak secrets.
3. **Security tools** produce machine output (SARIF, CVE IDs) that cannot become an actionable contribution.
4. **Showcase reality (why v1 lost):** signup wall before value, generic "scanner" positioning, no social proof, no keyless demo. v2 removes every one of these.

## 4. Target Users

| Persona | Need |
|---|---|
| Student / first-time contributor (primary) | A bounded, verified task: which file, what fix, how to test, how long it takes, what I will learn |
| Intermediate contributor | Prioritized findings, stack context, a clear route to a meaningful fix |
| Maintainer | Evidence-linked, reviewable issue drafts that respect disclosure norms |
| Judge / evaluator | Product understood in 5 seconds; magic flow demoed in 2 minutes with no signup and no API keys |

## 5. User Journeys

### 5.1 Anonymous (new — the judge path)
```text
Landing (hero: "Security findings → beginner pull requests")
  → Try without account
  → labelled demo fixture OR one keyless live scan (localStorage-bound, 1/session)
  → Findings + evidence (keyless deterministic explanations)
  → "Generate PR plan" → route with skills, tests, acceptance criteria
  → Copy maintainer-ready issue draft
  → (optional) Create account to save scans
```

### 5.2 Authenticated
```text
Login / Signup (email or GitHub)
  → Dashboard (metrics, recent repos, activity, next task)
  → Scan Repository (partial default, deep optional)
  → Findings → evidence detail → explanation → Skills Gap
  → Contribution route → status tracking → Issue draft → export
  → Profile (preferences, diagnostics, safety center, export/clear)
```

## 6. Functional Requirements

### FR-01 Landing Page (Sections A–J)
- Glass sticky header: ContribLens | Process | Features | Safety | FAQs | Login | Sign up.
- Hero headline: **"Security findings → beginner pull requests."** CTAs: "Scan a repo → get a PR plan" (primary) and "Try without account" (secondary → anonymous preview).
- Interactive product preview clearly labelled "Demo" (never claims a real scan).
- Process: Scan → Verify → Understand → Contribute. Safety promise: "Code verifies. AI explains. Human approves."
- FAQ glass accordions; final CTA panel; footer.
- AC: every CTA navigates to a real route/section; no dead links; reduced-motion respected; mobile usable.

### FR-02 Authentication
- Email + password signup (strength meter, ToS consent), email login.
- **Continue with GitHub** OAuth one-click.
- Password reset email via Resend. Inline validation, no browser alerts.
- Phone (E.164) login: DEFERRED to v2.1 (schema keeps the field optional).
- AC: signup, login, OAuth, logout, refresh persistence, guards, safe invalid-credential errors.

### FR-03 Anonymous Preview [REMOVED — reason: real-data only]
- Removed per G2: The webapp is real-data only. Users sign in/log in and scan real repositories. Demo/fixture preview content does not appear. Authenticated users always see their own real data.

### FR-04 Dashboard (`/app/dashboard`)
- Metrics: Repositories Scanned, Active Findings, Open Routes, Avg Readiness.
- Recent repositories (readiness, findings count, scan-diff badge), Activity Stream.
- Prominent **Scan Repository** CTA + "Recommended next task" card.
- AC: all numbers from real persisted data; attractive empty states with a next action.

### FR-05 Repository Scan (`/app/scan`)
- Public GitHub URL + optional ref; **scope choice: Partial (default: top-level + `src/`) or Deep** (with size warning).
- 6-stage visible pipeline: validate URL → fetch tree → parse manifests & workflows → OSV query → Actions audit → readiness score.
- Bounded ingestion (env-configurable defaults: 60 files, 180 KB/file, 15 MB total, 20k tree entries). Oversized repos degrade gracefully: "N files skipped (size bounds)" — never a hard failure.
- Zero code execution; binaries/vendor/generated skipped.
- **Scan diff:** repeat scans label findings new / resolved / unchanged.
- AC: expressjs/express completes (partial OK with skipped-note); progress visible per stage.

### FR-06 Findings (`/app/findings`, `/app/findings/[findingId]`)
- Filters: severity (critical/high/medium/low/info) + category (dependency, github-actions, secret, repository-health).
- Split view: list (left) + detail (right): file:line, 3-line code context, rule ID, confidence, **SHA-256 evidence hash**, disclosure label.
- Explanation: deterministic per-rule text (keyless default) or grounded AI (Gemma 4 31B → Gemini fallback) — schema-validated, hallucination-rejected, always labelled which engine produced it.
- **Skills Gap panel:** "To fix this you will learn: X, Y" + 2–3 free learning links (MDN/freeCodeCamp/YouTube) + contributor level progress.
- AC: keyless run yields concrete per-rule explanations; secret findings block public output.

### FR-07 Contributions + Stack (`/app/contributions`, `/app/contributions/[routeId]`)
- Detected stack chips (languages %, frameworks, package managers, CI) with source paths + confidence.
- Contribution Impact & Route Graph; route detail: skills to learn (+ learning resources), files, suggested change, test plan, acceptance criteria, difficulty, effort, readiness breakdown.
- Route status: not-started → in-progress → needs-review → completed (persisted).
- AC: route generation from any non-secret finding; status persists across refresh.

### FR-08 Issue Drafts (`/app/issue-drafts`)
- 8-section maintainer-ready Markdown (title, problem, verified evidence, impact, suggested change, test plan, acceptance criteria, references).
- Preview / edit / copy / download. **Disclosure Guard:** secret & critical findings → public draft BLOCKED with private-notification instructions. Label always: "Maintainer review required" (never "approved").
- AC: secret finding → public draft blocked; draft contains no raw secret.

### FR-09 Profile & Safety (`/app/profile`)
- Account (email, GitHub connection), appearance (theme, font scale, reduced motion), integration diagnostics (Supabase/GitHub/OSV/AI live status, no secrets), safety & disclosure FAQ, Export All Data, Clear History, sign out.

### FR-10 Public Stats (`/stats`)
- Live counters from real data: repos scanned, findings verified, PR plans generated, contributors helped.
- AC: numbers come from real aggregates (cached), not placeholders.

## 7. AI Requirements (locked)

**May:** explain validated evidence, prioritize, propose contributor task, identify skills, propose test plan + acceptance criteria, draft issue Markdown, summarize bounded architecture.
**May not:** declare a vulnerability independently, change deterministic severity/confidence, receive raw secrets, execute code, publish anything, approve/merge.
**Model chain:** `gemma-4-31b-it` (primary) → `gemini-2.5-flash` (fallback) → deterministic engine. Every request/response tied to existing finding IDs; invalid output rejected and replaced by fallback; the UI always shows which engine produced the explanation.

## 8. Non-Functional Requirements

- **Free-first:** Vercel Hobby, Supabase Free, OSV.dev (no key), Google AI Studio free tier, Upstash free, Resend free, GitHub Actions CI free (public repo). No paid dependency, ever.
- **Quality gates per slice:** `npm run lint && npm run typecheck && npm test && npm run build` green.
- **A11y:** semantic landmarks, one h1, keyboard access, focus-visible rings, aria-expanded/controls, `aria-live` for scan progress, contrast AA, color never the only signal.
- **Responsive:** verified at 375/390/768/1024/1280/1440.
- **Performance:** CSS/SVG-only effects; transform/opacity motion; lazy below-fold; keyless demo fast on slow networks.
- **i18n:** all copy professional English.

## 9. Explicitly Out of Scope (v2)

Hacktoberfest page/festival branding · phone auth (v2.1) · auto-PR / issue publishing / merges · auto code-fix execution · private repos · org/team permissions · SMS OTP · full AST analysis · extra manifests beyond SCANNER_RULES (v2.1 backlog: Cargo/go.mod/pom.xml/composer.json/Gemfile).

## 10. MVP-Complete Definition

A new user can: land → scan anonymously (or sign up in one click via GitHub) → see real findings + technologies → open a finding → get a concrete (keyless or AI) explanation + skills to learn → create a contribution route → copy a reviewable issue draft. Refresh preserves auth + settings when persistence is available. No fabricated success anywhere.

## 11. Success Metrics (showcase)

1. Stranger test: non-developer explains the product in 5 seconds from the hero.
2. Keyless run: full flow with zero API keys (deterministic engine).
3. Famous repo: express partial scan completes with "skipped" note.
4. Social proof: /stats shows real counters.
5. Zero raw secrets in DB/UI/logs; zero fake buttons; zero dead links.
