# ContribLens v2 — API Integration Plan

**Status:** API contract source of truth · All keys server-side · Zod validation at every boundary.

---

## 1. API Principles

- Browser calls ONLY ContribLens application routes — never providers directly.
- Provider keys (`GEMINI_API_KEY`, `GITHUB_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`) stay server-side; never in `NEXT_PUBLIC_*`.
- Every request that reads/writes user state is authenticated; anonymous preview routes are rate-limited separately.
- Provider failures become typed safe errors (see §6). A failed provider never becomes fake success.
- External payloads validated (Zod) before entering the domain layer.
- Cache public metadata by repository/ref/tree-SHA; cache validated AI results by evidence hash.

## 2. Internal Application API

### Auth
| Endpoint | Purpose |
|---|---|
| `POST /api/auth/signup` | email + password + confirmation + terms → Supabase identity + profile |
| `POST /api/auth/login` | email + password → session (safe error never reveals account existence) |
| `POST /api/auth/oauth/github` | GitHub OAuth code exchange → session + `profiles.github_id` link |
| `POST /api/auth/logout` | destroy session |
| `GET /api/auth/me` | current user + preferences |
| `POST /api/auth/forgot-password` | Resend reset email |

Signup request:
```json
{ "email": "student@example.com", "password": "...", "passwordConfirmation": "...", "acceptedTerms": true }
```
(Phone: schema field exists; v2.1 feature.)

### Scans
`POST /api/scans`
```json
{
  "repositoryUrl": "https://github.com/owner/repo",
  "ref": "main",
  "scope": "partial",
  "checks": ["dependencies","github-actions","secrets","repository-health","technology"]
}
```
Response:
```json
{
  "ok": true,
  "scanId": "uuid",
  "repository": { "fullName": "owner/repo", "ref": "main" },
  "scope": "partial",
  "summary": { "findings": 7, "critical": 1, "high": 2, "medium": 3, "low": 1 },
  "diff": { "new": 2, "resolved": 1, "unchanged": 4 },
  "technologies": { "languages": [], "frameworks": [], "tooling": [], "manifests": [] },
  "warnings": ["12 files skipped (size bounds)"]
}
```
`GET /api/scans/[scanId]` → user-owned scan summary, technologies, health, redacted findings.
`GET /api/scans` → history list.

### Anonymous Preview
`POST /api/preview/scan` — 1 per browser session (localStorage flag client-side + Upstash IP soft-limit server-side); same response shape, labelled `preview: true`; results stored client-side in localStorage ONLY.

### Findings & Routes
| Endpoint | Purpose |
|---|---|
| `GET /api/findings?scanId=&severity=&category=` | filtered list |
| `GET /api/findings/[findingId]` | evidence detail incl. `evidenceHash`, `skills`, `learningResources` |
| `POST /api/routes` | create route(s) from finding(s) |
| `GET /api/routes/[routeId]` | route detail + status |
| `PATCH /api/routes/[routeId]` | update status (not-started → in-progress → needs-review → completed) |

### AI
`POST /api/ai/plan`
```json
{ "operation": "explain | route | issue | summary", "scanId": "uuid", "findingIds": ["gh-actions-unpinned-001"] }
```
Server loads evidence itself — client-supplied evidence is ignored. Model chain: `gemma-4-31b-it` → `gemini-2.5-flash` → deterministic engine. Response includes `engineUsed` field.

### Other
| Endpoint | Purpose |
|---|---|
| `POST /api/issue-drafts` | create/redact draft from route (never publishes) |
| `GET /api/issue-drafts` + `[draftId]` | list/read |
| `GET/PATCH /api/profile` | profile + preferences |
| `GET /api/health` | app health |
| `GET /api/integrations/status` | live status: Supabase, GitHub, OSV, AI (no secrets) |
| `GET /api/stats` | public counters (cached) |

## 3. GitHub Integration (server-side)

```text
GET https://api.github.com/repos/{owner}/{repo}
GET https://api.github.com/repos/{owner}/{repo}/git/trees/{ref}?recursive=1
GET https://raw.githubusercontent.com/{owner}/{repo}/{ref}/{path}
```
Rules: validate owner/repo/ref/path · reject private/unavailable · clear User-Agent + Accept headers · enforce bounds (60 files / 180 KB / 15 MB / 20k tree entries) · partial scope = top-level + `src/` only; deep = broader with warning · cache by tree SHA · never clone, never shell, never package-manager execution · server-only optional `GITHUB_TOKEN` (min read-only scope; 60 → 5,000 req/hr); users never paste tokens in chat or browser storage.

## 4. OSV Integration

`POST https://api.osv.dev/v1/querybatch` — batch queries for supported manifests (package.json + lockfiles, requirements.txt, pyproject.toml). Validate package/ecosystem/version + advisory shape; normalize GHSA/CVE IDs; cache by ecosystem/package/version; on failure keep scan usable and label dependency enrichment unavailable — never invent advisories.

## 5. AI Integration (server-only adapter, model chain locked)

```text
1. gemma-4-31b-it     (primary — Google AI Studio / Gemini API, @google/genai)
2. gemini-2.5-flash   (fallback — quota/unavailability)
3. deterministic rule engine (keyless — always available)
```
- `GEMINI_MODEL=gemma-4-31b-it` env; `GEMINI_API_TIMEOUT_MS=15000`; cap request/response size.
- Send only minimal redacted evidence bundles; require English JSON matching `EVIDENCE_AND_SCHEMAS.md`.
- Validate: unknown finding IDs → reject; `unsupportedClaims` non-empty → reject; changed severity/confidence → reject; secret-like output → reject.
- Cache validated results by operation + evidence hash; show `engineUsed` (Gemma / Gemini / Deterministic) in UI.
- Provider contingency: if Gemma 4 31B is unavailable on the free API tier, wire Groq or OpenRouter free tier behind the SAME adapter interface.
- AI called only after explicit user action — never for every finding automatically.

## 6. Error Codes (typed, safe)

```text
AUTH_INVALID_INPUT          AUTH_INVALID_CREDENTIALS    AUTH_PROVIDER_UNAVAILABLE
GITHUB_INVALID_URL          GITHUB_NOT_FOUND            GITHUB_PRIVATE_OR_UNAVAILABLE
GITHUB_RATE_LIMITED         GITHUB_TREE_TRUNCATED       GITHUB_FILE_LIMIT
OSV_UNAVAILABLE             GEMINI_UNAVAILABLE          GEMINI_INVALID_OUTPUT
PREVIEW_LIMIT_REACHED       DISCLOSURE_BLOCKED          PERSISTENCE_FAILED
```
Browser receives safe messages + correlation ID; detailed provider info only in redacted server logs.

## 7. Rate & Cost Controls

- Per-user scan rate limit + max concurrent scans (Upstash).
- Preview: 1 live scan/session + IP soft limit.
- Cache by repo/ref/tree SHA; cap AI requests per scan and per user/day; AI only on explicit action; cache validated AI output by evidence hash; show quota/fallback states clearly.
