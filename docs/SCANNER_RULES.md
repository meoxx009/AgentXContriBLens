# ContribLens v2 — Deterministic Scanner Rules

**Status:** Detection source of truth · Pure TypeScript domain · Zero code execution · Scanner rules own severity and confidence — AI only explains.

---

## 1. Scanner Boundaries

- Public GitHub repositories only; read-only (metadata, tree, selected text/config files).
- Ignore binary, vendor, generated, dependency directories (`node_modules`, `dist`, `build`, `.venv`, vendor, minified).
- **Never execute** repository code, package managers, shell scripts, or workflows.
- Bounds (env-configurable): `SCAN_MAX_FILES=60`, `SCAN_MAX_FILE_BYTES=180000`, `SCAN_MAX_TOTAL_BYTES=3000000`, `SCAN_MAX_TREE_ENTRIES=20000`.
- **Partial scan (default):** top-level + `src/` only. **Deep scan:** user opt-in with size warning. Truncation ALWAYS surfaces "N files skipped (size bounds)" — never claim a complete scan.

## 2. GitHub Actions Rules

### `GH-ACTIONS-WRITE-ALL`
- Trigger: `permissions: write-all` (workflow or job scope).
- Category `github-actions` · Severity high · Confidence 0.98.
- Fix: declare minimum required permissions at workflow/job scope.
- Disclosure: `public-issue` (unless context requires review).
- Skills: `GitHub Actions`, `YAML`, `Principle of least privilege`.

### `GH-ACTIONS-UNPINNED`
- Trigger: third-party `uses:` with mutable tag/branch instead of full commit SHA.
- Severity medium · Confidence 0.90 · Fix: pin to reviewed commit SHA (+ version comment).
- Skills: `GitHub Actions`, `Supply-chain security`. Learning: GH Actions security hardening docs.

### `GH-ACTIONS-MISSING-PERMISSIONS`
- No explicit `permissions:` where defaults are unclear. Severity low/medium (never auto-high) · Confidence 0.72 · Explain repo/org default token behavior.

### `GH-ACTIONS-PULL-REQUEST-TARGET`
- `pull_request_target` with unsafe untrusted-input checkout/write. High only with contextual evidence; else medium.

### `GH-ACTIONS-CURL-PIPE-SHELL`
- `curl … | bash/sh` or equivalent remote execution. High/medium by source + permissions. Fix: pin/verify scripts or trusted action.

## 3. Dependency Rules (OSV as the advisory source)

Supported manifests (v2): `package.json` + lockfiles (npm/yarn/pnpm), `requirements.txt`, `pyproject.toml`. (v2.1 backlog: Cargo.toml, go.mod, pom.xml/build.gradle, composer.json, Gemfile.)
- Pass name/version/ecosystem to OSV batch; normalize advisory IDs (GHSA/CVE); advisory severity passthrough; if advisory lacks severity → `medium` with reason `OSV advisory did not provide severity`.
- OSV unavailable → keep scan usable, label dependency enrichment unavailable. NEVER invent advisories.

## 4. Repository Health Rules

| Rule | Trigger | Default |
|---|---|---|
| `REPO-MISSING-LICENSE` | no LICENSE file | low · 0.99 · skills: Licensing, Open source |
| `REPO-MISSING-SECURITY` | no SECURITY.md | low · 0.99 · skills: Security policy |
| `REPO-MISSING-CONTRIBUTING` | no CONTRIBUTING.md | low · 0.99 · skills: Contribution guidelines |
| `REPO-WEAK-README` | missing/thin README | low · 0.78 |
| `REPO-NO-TEST-SIGNAL` | no test dir/config/script | low · 0.70 — missing signal ≠ no tests |

## 5. Secret Rules

Patterns: GitHub PATs (`ghp_`, `github_pat_`), AWS `AKIA…`, Slack tokens/webhooks, private-key headers, bearer tokens, constrained generic key assignments.
Output ONLY: `<type> + redacted mask + safe suffix` (e.g. `ghp_****`, `AKIA************MPLE`). Never the raw match, raw line, raw content — not to storage, AI, logs, exports, or drafts.
Secret findings: severity high (high-confidence patterns) · disclosure `security-disclosure` · public issue generation BLOCKED.

## 6. Technology Detection

From bounded paths + manifest content: languages (JS, TS, Python, Go, Rust, Java, Ruby, PHP, C/C++, C#, Swift, Kotlin, Shell, YAML, SQL, HTML, CSS), frameworks (React, Next.js, Vue, Express, FastAPI, Django, Flask), tooling (GitHub Actions, npm, pip, Cargo, Go modules, Docker, pytest, Jest, Vitest, Playwright, Cypress). Each signal stores source paths + confidence (manifest-backed > path-only).

## 7. Skills Mapping & Learning Resources (new — feeds Skills Gap panel)

Every rule ID maps to:
- `skills[]`: what the contributor learns by fixing it (e.g. unpinned action → `GitHub Actions`, `Supply-chain security`).
- `learningResources[]`: 2–3 FREE links only (MDN, freeCodeCamp, official docs, YouTube). No paid courses.
- `contributorLevelImpact`: points added to the contributor level when the route completes.

## 8. Scan Diff (new/resolved/unchanged)

Each finding carries a stable fingerprint: `sha256(rule_id + normalized_path + normalized evidence core)`. On repeat scans of the same repo/ref: fingerprint present in previous scan → `unchanged`; only in previous → `resolved`; only in current → `new`. Diff surfaces in scan summary + dashboard badge.

## 9. False-Positive Handling

- Every finding exposes confidence + source rule.
- Dedupe repeated matches in the same file/rule.
- Fixture/test files scanned but marked in evidence metadata.
- **Never call a repository "secure" because no rule matched** — say "no supported deterministic findings detected".
- Users may mark findings reviewed; scanner evidence is never silently deleted.
