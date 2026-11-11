# ContribLens v2 — Security Model

**Status:** Security source of truth · `Code verifies. AI explains. Human approves.`

ContribLens is a security-assistance product, not an autonomous security authority.

---

## 1. Threat Model & Controls

### A. Malicious Repository Scanning
- **No code execution, ever** — never `npm install`, `setup.py`, shell, or workflow execution.
- Bounded ingestion: 60 files / 180 KB/file / 15 MB total / 20k tree entries (env-configurable); partial scope default (top-level + `src/`).
- Binary, minified, vendor, generated files skipped.
- Repository content treated strictly as quoted evidence — never instructions.

### B. Prompt-Injection Resistance
- Repository text encapsulated in untrusted quotation boundaries; cannot override system prompts, change severity/confidence, alter disclosure rules, or invoke tools.
- Grounding validation rejects unknown finding IDs, unevidenced claims, invented file paths, empty `unsupportedClaims`.
- Scanner rules and repository text are strictly separated.

### C. Secret Exposure & Redaction
- High-entropy tokens, GitHub PATs (`ghp_`, `github_pat_`), AWS `AKIA`, Slack webhooks, private keys, bearer tokens → redacted immediately in memory BEFORE storage, logging, AI calls, or exports.
- Masks: `ghp_****`, `AKIA************MPLE`, `[REDACTED_AWS_SECRET_KEY]`.
- Evidence hashes = SHA-256 of redacted text. Raw secrets never in exceptions, analytics, browser responses, AI requests, or Markdown.

### 2. Anonymous Preview Safety (new)
- 1 live preview scan per browser session (localStorage flag) + Upstash IP soft-limit.
- Results stored in localStorage only — never in Supabase, never logged.
- Always labelled "Demo"; cannot consume authenticated GitHub token quota beyond the soft IP limit.

### Account Abuse
- Server-side auth + RLS; rate limits on signup/login/scan/AI/preview (Upstash).
- Login errors never reveal account existence (email vs phone mapping hidden server-side).
- No passwords in application tables or localStorage; secure HttpOnly session cookies via Supabase.

## 3. Secret Handling (zero-trust)

Canonical env names: `GEMINI_API_KEY`, `GEMINI_MODEL=gemma-4-31b-it`, `GITHUB_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`.

1. Service-role key server-only — never `NEXT_PUBLIC_`, never browser.
2. AI key + GitHub token strictly server-only; min-scope read-only GitHub token.
3. No key? Deterministic engine still serves explanations and routes (keyless mode).
4. Never commit `.env`; rotate compromised keys immediately; redact secret-like values in logs.

## 4. Public Disclosure Policy

| Finding Category | Disclosure Mode | Policy |
|---|---|---|
| Missing docs / license | `PUBLIC_ISSUE_ALLOWED` | Public issue draft allowed for maintainer review |
| CI/CD workflow hygiene | `PUBLIC_ISSUE_ALLOWED` | Allowed |
| Unpinned GitHub Action SHA | `MAINTAINER_REVIEW` | Recommended maintainer review |
| Dependency vulnerability (CVE/GHSA) | `MAINTAINER_REVIEW` | Depends on exploitability |
| Detected secret / credential | `DISCLOSURE_BLOCKED` | **Public draft strictly blocked** + private notification instructions |
| Critical production RCE | `DISCLOSURE_BLOCKED` | **Public draft strictly blocked** |

Never call a draft "maintainer-approved" — always "maintainer-reviewable".

## 5. AI Safety Controls (model chain)

- Chain: `gemma-4-31b-it` (primary) → `gemini-2.5-flash` (fallback) → deterministic engine (keyless) — all server-side.
- Send only normalized evidence IDs + redacted evidence (minimal bundle).
- Severity/confidence/disclosure outside model authority — validator rejects changes.
- Reject unknown finding references and non-empty `unsupportedClaims`.
- Block issue generation for `security-disclosure` findings.
- AI cannot request tools or execute code.
- Record model name, prompt version, evidence hash for reproducibility — never raw secrets.

## 6. Browser / Security Headers

HTTPS in production · CSP appropriate to host · `X-Content-Type-Options: nosniff` · `Referrer-Policy: strict-origin-when-cross-origin` · `frame-ancestors 'none'` (unless an approved embed) · secure HttpOnly session cookies · Upstash rate limits on scan/AI/auth routes.

## 7. Security Acceptance Tests

1. Raw secret fixture absent from serialized scan result.
2. Raw secret absent from AI request mock and logs.
3. Repository prompt injection cannot change severity or disclosure mode.
4. Service-role key absent from client bundle.
5. Anonymous user cannot read another user's scan (RLS).
6. Secret finding cannot create a public issue draft.
7. Truncated repository never reported as a complete scan.
8. Preview route cannot bypass rate limits or hit the authenticated token quota.
9. No provider key in any browser bundle.

## 8. Reporting

Private email only (never public issues): `security@contriblens.org` — initial response within 48 hours; coordinated responsible disclosure.
