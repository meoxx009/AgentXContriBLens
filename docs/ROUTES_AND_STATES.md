# ContribLens v2 — Routes & UI States

**Status:** Navigation + state machine source of truth · Horizontal sticky glass nav · No permanent sidebar anywhere.

---

## 1. Public Routes

| Route | Purpose | Auth |
|---|---|---|
| `/` | Landing page (Sections A–J) | Public |
| `/login` | Email login + Continue with GitHub | Public |
| `/signup` | Account creation | Public |
| `/forgot-password` | Password reset (Resend email) | Public |
| `/stats` | Public live counters | Public |
| `/privacy` | Privacy notice | Public |
| `/safety` | Safety model & disclosure | Public |
| `/security` | Security policy | Public |

## 2. Authenticated Routes (menu labels)

| Route | Menu label | Purpose |
|---|---|---|
| `/app/dashboard` | Dashboard | Metrics, recent repos, activity, next task |
| `/app/scan` | Scan Repository | URL input, scope (Partial/Deep), pipeline monitor |
| `/app/findings` | Findings | Filters + list |
| `/app/findings/[findingId]` | Findings detail | Evidence, explanation, Skills Gap |
| `/app/contributions` | Contributions + Stack | Stack chips + Impact & Route Graph |
| `/app/contributions/[routeId]` | Route detail | Task, skills, tests, acceptance, status |
| `/app/issue-drafts` | Issue Drafts | Markdown review + export |
| `/app/profile` | Profile | Account, appearance, diagnostics, safety, data |

Protected routes redirect to `/login?next=<encoded>`. After login → requested route or `/app/dashboard`.

## 2.1 Anonymous Preview State Machine (new)

```text
idle → preview_submitting → preview_scan (1 live keyless scan/session)
                          → demo_fixture (labelled Demo)
                          → preview_findings → preview_route → preview_draft_copy
                          → limit_reached → "Create a free account to continue"
```
- localStorage keys: `cl_preview_used_at`, `cl_preview_result`. Results client-side only, always labelled **Demo**.
- Signup prompt appears AFTER value is shown — never a wall before value.

## 3. Authentication States

```text
anonymous → signup_submitting → authenticated
anonymous → login_submitting   → authenticated
anonymous → oauth_redirect     → authenticated
anonymous → auth_error
authenticated → signing_out → anonymous
```

## 4. Scan States

```text
idle → scope_selected (partial | deep)
  → validating → fetching_metadata → fetching_tree → fetching_files
  → analyzing → enriching_dependencies → persisting
  → complete | complete_with_warnings
```
Failure states: `invalid_url` · `not_found` · `private_or_unavailable` · `rate_limited` · `tree_too_large` · `network_error` · `dependency_lookup_unavailable` · `persist_failed`.
`complete_with_warnings` is visually distinct from `complete` and always includes the "N files skipped (size bounds)" note for partial scans.

## 5. AI States (model chain)

```text
not_requested
  → building_evidence_bundle
  → requesting (gemma-4-31b-it)
  → [quota/unavailable] requesting_fallback (gemini-2.5-flash)
  → validating_response
  → complete (engineUsed: gemma | gemini | deterministic)
  → failed
```
`fallback_used` is a user-visible state, never a silent failure. UI always shows which engine produced the explanation: "✦ Gemma explanation" / "Gemini explanation" / "Deterministic explanation".

## 6. Draft Lifecycle

```text
draft → reviewed → exported      (disclosure guard may BLOCK public draft for secrets/critical)
```

## 7. Empty States (attractive + next action)

- No scans → "Scan your first public repository" + CTA.
- No findings → "No supported deterministic findings detected" (NEVER "secure").
- No routes → "Routes are created from findings and health gaps."
- No drafts → link to Findings.
- No activity → first-scan CTA.
- Preview limit reached → "Create a free account to continue" + signup CTA.

## 8. Error Display Rules

- English, actionable copy; raw provider errors never shown (correlation ID instead).
- Preserve user input on retry; never clear saved settings/history on network failure.
- Every async screen: loading + empty + error + success states (see DESIGN.md §12).
