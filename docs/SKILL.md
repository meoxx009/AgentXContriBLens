# ContribLens Build Skill (for Antigravity / AI Agents)

**When to use:** any code change, feature addition, or fix in the ContribLens v2 codebase. Read this before touching product behavior.

---

## Mission

Build and maintain **ContribLens** — an English-first, evidence-first security and contribution navigator — as a winning-level, fully working webapp. Prefer a small, testable implementation over a broad but unreliable feature set.

## Non-Negotiable Rules

1. Read `README.md`, `PRD.md`, `ARCHITECTURE.md`, `DESIGN.md`, `SECURITY.md` before changing product behavior.
2. **Brand is `ContribLens`** — never ContribShield, ContriBLens, or Patchloom, anywhere.
3. **Positioning:** "Security findings → beginner pull requests." All copy serves this.
4. Preserve the horizontal authenticated glass navigation — never a sidebar.
5. Preserve the visual system exactly: Black Hole base, Electric Tangerine accent, Lemon Chiffon CTAs, Linen/Cotton surfaces, Botticelli info, Rosewood critical, Mocha Brown glows, Platinum Silver reflections, Pale Lavender AI/learning accents + liquid glass + smoky background per `DESIGN.md`. No neon lime, no indigo/mint, no rainbow gradients.
6. All app copy, errors, drafts, and AI output in professional English.
7. **Never execute repository code** during scans.
8. **Never send raw secrets** to AI, storage, logs, or drafts — redact in-memory first.
9. Never expose AI/Supabase-service/GitHub secrets to browser code; `GEMINI_MODEL=gemma-4-31b-it`.
10. Scanner rules own finding existence, severity, confidence. AI (Gemma 4 31B → Gemini → deterministic) explains validated evidence only.
11. Never show success when the underlying request failed; deterministic fallback is a user-visible state.
12. Anonymous preview and demo content are ALWAYS labelled "Demo" — never claim a real scan.
13. **No Hacktoberfest page** or festival branding — explicitly out of scope.
14. Empty, loading, error, success states for every network-backed screen.
15. Add/update a meaningful test for every behavior change.
16. Smallest dependency set; **no paid services** — free tiers only.
17. No auto-creation of public issues, PRs, fixes, or merges.

## Commands

```bash
npm run dev              # dev server
npm run lint             # ESLint
npm run typecheck        # tsc --noEmit
npm test                 # Vitest
npm run build            # production build
npm run check:integrations
```

## Slice Discipline (Antigravity working style)

1. Implement ONE phase/slice from `IMPLEMENTATION.md` at a time — never batch.
2. After each slice: inspect diff → run `npm run lint && npm run typecheck && npm test && npm run build` → open the route in Chrome → verify real user behavior → update implementation notes → only then move on.
3. Commit after each green slice.

## Preferred Implementation Behavior

- Typed domain models + Zod validation at integration boundaries.
- Scanner logic pure — independent of React, Next.js, DB clients, and AI SDK.
- Adapters behind interfaces: `GitHubClient`, `OSVClient`, `AIPlanner` (swappable provider: Google → Groq/OpenRouter free tier).
- Store only redacted evidence + bounded metadata; hash with SHA-256.
- Server-side routes for GitHub aggregation, OSV, AI.
- Cache safe public results by repo/ref/tree SHA; cache validated AI output by evidence hash.
- Reusable, state-driven UI components — not page-specific copies.
- CSS/SVG/Web Animations first; honor `prefers-reduced-motion`.

## Safe AI Contract

Send a minimal redacted evidence bundle (never a repo dump). Require English JSON matching `EVIDENCE_AND_SCHEMAS.md`. Validate with the schema; reject unknown finding IDs, unsupported claims, severity changes, secret-like output. Model chain: `gemma-4-31b-it` → `gemini-2.5-flash` → deterministic engine. UI labels the engine used.

## Safe Scanner Contract

Fetch only public metadata, bounded tree, and selected text/config files (partial scope: top-level + `src/`; deep opt-in with warning). Ignore binaries/vendor/generated. Never run package managers, shell, workflows, or repo tests. Truncation surfaces "N files skipped" — never a false complete.

## Definition of Done (per slice)

- Requested user path works from the real UI.
- Relevant persisted data reads back; error + empty states handled.
- Smallest meaningful test passes; `lint/typecheck/test/build` green.
- No secrets, no unsupported claims, no fake buttons/dead links in output.
- Changed files + actual checks run are reported (never claim unrun checks passed).
