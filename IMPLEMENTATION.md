# ContribLens v2 — Implementation Plan (Antigravity Phases)

**Status:** Build execution order · One phase at a time · Every phase leaves the app runnable · Brand: ContribLens.

---

## 1. Execution Method

Build in small vertical slices. Each phase must leave the app runnable and connect each screen to its real state/data contract as soon as it exists — never a static visual shell with postponed behavior.

**Gate after EVERY phase:** `npm run lint && npm run typecheck && npm test && npm run build` all green → inspect diff → verify in Chrome (desktop + mobile) → only then next phase.

## 2. Phase 0 — Project Setup

**Deliverables:** Next.js 15 App Router + TypeScript strict scaffold · Tailwind 3.4 + CSS token system from `DESIGN.md` (12 tokens, liquid-glass recipes, smoky background) · ESLint + Vitest + Zod · `.env.example` (incl. `GEMINI_MODEL=gemma-4-31b-it`) · error boundary + not-found · single brand `ContribLens` · docs copied into project.
**Check:** dev/lint/typecheck/build green on a fresh clone.

## 3. Phase 1 — Landing Page (Sections A–J)

- Glass sticky header · hero: "Security findings → beginner pull requests" + CTAs ("Scan a repo → get a PR plan", "Try without account") · smoky ambient background + tangerine arc · falling GitHub/git/code cards (reduced-motion aware) · trust strip · How-it-works (GlassStepRail) · interactive labelled-Demo preview · feature grid · safety section · glass FAQ accordions · final CTA · footer.
- **Try without account** wired to anonymous preview.
**Check:** desktop + mobile; every CTA navigates; reduced-motion honored; all links real.

## 4. Phase 2 — Anonymous Preview (the judge path)

- Labelled demo fixture OR 1 keyless live scan per session (`POST /api/preview/scan`, localStorage flag + Upstash IP soft-limit).
- Findings → deterministic explanation → route → copy draft — all keyless, all labelled "Demo".
- Signup prompt AFTER value shown.
**Check:** incognito visitor → findings in <2 min, zero signup, zero API keys.

## 5. Phase 3 — Authentication

- Email + password signup (strength meter, ToS) · email login · **GitHub OAuth** · forgot-password (Resend) · logout · route guards · refresh persistence · safe invalid-credential errors. (Phone deferred v2.1.)

## 6. Phase 4 — App Shell + Dashboard

- Sticky horizontal glass nav (active Lemon Chiffon underline) · active route state · profile dropdown · glass metric cards · recent repos + scan-diff badge · activity stream · "next task" card · Scan CTA.
**Check:** refresh persistence, mobile nav scroll, route guards, empty states.

## 7. Phase 5 — Scanner Domain (port from v1, keep tests)

- URL parser · bounded GitHub adapter · text-file selector (partial scope default) · workflow scanner (5 rules) · health scanner · secret scanner/redactor · technology detector · evidence schema + fixture tests · scan-diff fingerprints · skills mapping per rule.
**Check:** fixture tests pass; raw secret never appears in serialized output; expressjs/express returns partial results with "N files skipped".

## 8. Phase 6 — Scan API & Persistence

- `POST /api/scans` (scope partial/deep) · status/persistence · OSV enrichment · scan diff · typed errors · Upstash rate limits · caching by tree SHA · preview route with IP soft-limit · dashboard history integration.
**Check:** real public repo scan + provider-failure test + preview limit test.

## 9. Phase 7 — AI Adapter (model chain locked)

- Server-only adapter: `gemma-4-31b-it` → `gemini-2.5-flash` → deterministic engine.
- JSON schema validation · evidence-reference validation · deterministic fallback planner (concrete per-rule output) · `engineUsed` surfaced in UI · cached valid outputs · quota states.
**Check:** valid response · malformed JSON → fallback · unknown ID → reject · disabled key → keyless mode works end-to-end · `GEMINI_MODEL=gemma-4-31b-it` verified live; fallback triggers on quota.

## 10. Phase 8 — Findings, Contributions + Stack, Skills Gap

- Filters, list/detail, exact evidence + SHA-256 hash display, disclosure label.
- Deterministic + grounded explanations with engine label.
- **Skills Gap panel:** skills[] + free learning resources + contributor level.
- Impact & Route Graph, readiness breakdown, route status persistence.
**Check:** keyless explanation is concrete (rule-specific); route references existing evidence; secret public-output blocked.

## 11. Phase 9 — Issue Drafts & Profile Safety

- 8-section Markdown generator · preview/copy/download · disclosure guard · appearance prefs (theme/font/reduced motion) · safety center · integration diagnostics · export/clear.
**Check:** workflow draft OK; secret finding → public draft BLOCKED; settings persist on refresh.

## 12. Phase 9.5 — Public /stats

- Live counters from `public_stats` (repos scanned, findings verified, routes generated) + Vercel Analytics. **Check:** real numbers, cached, no user-private data.

## 13. Phase 10 — Release Hardening

- Full test run · browser bundle audit for secrets · security headers · free deployment test · slow/failing provider tests · keyless full-flow test · incognito <2 min test · famous-repo partial scan test · mobile flow test · update README/handoff.

## 14. Implementation Rules

- One phase at a time; do not build future phases before the current passes its check.
- No mock success data in real scan routes; fixtures only under `tests/fixtures`, labelled.
- All generated text English; honest fallback over broken AI-dependent flow.
- Final handoff: actual commands run + known gaps listed.

---

## Phase Matrix

| Phase | Focus | Deliverables |
|---|---|---|
| 0 | Foundations | Scaffold, tokens, scripts, Supabase migrations, ported domain engine |
| 1 | Landing | Sections A–J, glass + smoke, Try-without-account |
| 2 | Anonymous preview | Labelled demo + 1 keyless scan/session |
| 3 | Auth | Email + GitHub OAuth + Resend reset + glass shell |
| 4 | Scanner domain | Rules, redaction, readiness, skills mapping, partial scan |
| 5 | Scan API + diff | Persistence, OSV, typed errors, dashboard history |
| 6 | Findings | Split view, evidence hash, engine-labelled explanations |
| 7 | AI chain | gemma-4-31b-it → gemini-2.5-flash → deterministic |
| 8 | Contributions + Drafts | Impact graph, readiness, disclosure guard |
| 9.5 | /stats | Public counters |
| 10 | Hardening | QA, CI, deploy, keyless/incognito/famous-repo/mobile validation |
