# ContribLens v2 — Database & Persistence

**Status:** Data source of truth · Supabase PostgreSQL + RLS (production) · Local-JSON store (demo) · localStorage (anonymous preview only).

---

## 1. Persistence Strategy

- **Authenticated mode:** Supabase PostgreSQL with Row Level Security. All user state owner-scoped.
- **Demo mode:** local JSON store (`.data/`) when Supabase is not configured — clearly labelled, never stores passwords or secrets.
- **Anonymous preview:** results in browser localStorage ONLY (flag + last demo scan). Never written to any database. Hard cap: 1 live preview scan per session (Upstash soft IP limit).
- Raw secret values and raw repository file contents are NEVER stored — only redacted evidence, hashes, paths, line numbers, normalized text.

## 2. Core Tables

### `profiles`
| Column | Type | Notes |
|---|---|---|
| id | uuid | FK → `auth.users.id`, PK |
| display_name | text | optional |
| username | text | optional, unique when present |
| phone_e164 | text | optional, unique when present, E.164-validated (v2.1 login; field kept) |
| github_id | text | nullable — GitHub OAuth link |
| github_username | text | nullable |
| bio | text | optional, length-limited |
| experience_level | text | beginner / intermediate / advanced |
| created_at / updated_at | timestamptz | server-generated |

### `user_preferences`
| Column | Type | Notes |
|---|---|---|
| user_id | uuid | FK → profiles |
| theme | text | black-hole (default) / linen / system |
| font_size | text | small / medium / large |
| font_family | text | system / inter / manrope / grotesk |
| reduce_motion | boolean | default false |
| ai_explanations | boolean | default true |
| save_scan_history | boolean | default true |
| updated_at | timestamptz | server-generated |

### `repositories`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| owner / name / full_name | text | `full_name` unique `owner/name` |
| url | text | canonical HTTPS URL |
| default_branch | text | last known |
| last_scanned_at | timestamptz | nullable |
| created_at | timestamptz | server-generated |

### `scans`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | owner (nullable for preview? NO — preview never persists) |
| repository_id | uuid | FK |
| ref | text | branch/ref |
| commit_sha | text | reproducibility when available |
| scope | text | partial / deep |
| status | text | running / complete / complete_with_warnings / failed |
| error_code | text | nullable safe code |
| files_scanned, bytes_scanned, files_skipped | integer | counts only |
| technologies | jsonb | bounded normalized snapshot |
| health | jsonb | bounded health summary |
| created_at | timestamptz | server-generated |

### `findings`
Fields per `EVIDENCE_AND_SCHEMAS.md`: id, scan_id, category, rule_id, title, severity, confidence, source_tool, file, line_start, line_end, evidence (redacted only), impact, fix_hint, skills (jsonb), learning_resources (jsonb), disclosure_mode, redacted, evidence_hash (SHA-256), created_at. No raw file contents; no raw secrets — ever.

### `contribution_routes`
Fields per EVIDENCE_AND_SCHEMAS.md + deterministic score breakdown, status (`not-started` → `in-progress` → `needs-review` → `completed`), learning_resources, contributor_level_impact.

### `issue_drafts`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | owner |
| scan_id / route_id | uuid | FKs |
| title | text | length-limited |
| markdown | text | redacted, validated Markdown |
| disclosure_mode | text | public-issue / maintainer-review / security-disclosure |
| status | text | draft / reviewed / exported |
| created_at / updated_at | timestamptz | server-generated |

### `activity_events`
Low-sensitivity events: `scan_completed`, `finding_reviewed`, `route_started`, `draft_created`, `route_completed`. No raw provider payloads.

## 3. Row Level Security (RLS)

- Users read/update only their own profile, preferences, repositories, scans, findings, routes, drafts, events (all keyed by `user_id`).
- Service-role operations server-only; never exposed to the browser.
- Public aggregates (`/stats`: counts of repositories/scans/findings/routes) exposed via a dedicated `public_stats` view/policy — contains no user-private state.

## 4. Anonymous Preview Storage

- localStorage keys: `cl_preview_used_at` (session flag), `cl_preview_result` (labelled demo/scan payload).
- Never written to Supabase; never stores secrets; hard cap 1 result; "Clear" wipes keys.

## 5. Retention & Deletion

- "Clear local history" (browser mode) and account-level export + cascade deletion (production).
- Deleting a user cascades: scans → findings → routes → drafts → events.
- Never retain raw secrets or raw repo file contents by default.

## 6. Indexes

```sql
CREATE INDEX ON scans (user_id, created_at DESC);
CREATE INDEX ON findings (scan_id, severity);
CREATE INDEX ON contribution_routes (user_id, status);
CREATE INDEX ON issue_drafts (user_id, updated_at DESC);
CREATE UNIQUE INDEX ON repositories (full_name);
CREATE UNIQUE INDEX profiles_phone_e164_key ON profiles (phone_e164) WHERE phone_e164 IS NOT NULL;
```

## 7. Migrations

- `supabase/migrations/001_initial_schema.sql` — auth-linked profiles, preferences, RLS policies.
- `supabase/migrations/002_contriblens_tables.sql` — repositories, scans, findings, contribution_routes, issue_drafts, activity_events, public_stats view.
- Apply via Supabase SQL editor or CLI; verify RLS with cross-user test (user A cannot read user B's scan).

## 8. /stats Aggregation

`public_stats` view (materialized or cached 5 min): total_repositories, total_scans, total_findings_verified, total_routes_generated. Built only from non-private fields. Powers the public `/stats` page and Vercel Analytics complements it.
