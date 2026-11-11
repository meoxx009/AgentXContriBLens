# ContribLens — Vercel Deployment & Production Checklist

This checklist documents the exact setup required to deploy and redeploy ContribLens on Vercel with full functionality (Next.js 15 App Router, React 19, Supabase with local-JSON fallback, Gemini AI chain, and GitHub OAuth).

---

## 1. Vercel Project Configuration

- **Framework Preset**: `Next.js`
- **Root Directory**: `./` (repository root)
- **Build Command**: `npm run build`
- **Install Command**: `npm install`
- **Node.js Version**: `20.x` or `22.x`
- **Output Directory**: `.next` (default)

---

## 2. Environment Variables Configuration

Set these variables in the **Vercel Project Settings → Environment Variables** (configured for **Production**, **Preview**, and **Development**):

| Variable Name | Required | Default / Recommended Value | Description |
|---|---|---|---|
| `JWT_SECRET` | **Yes** | *(Generate a 32+ character random string)* | Secret for signing session JWT tokens |
| `NEXT_PUBLIC_APP_URL` | **Yes** | `https://hacktoberfest-contri-blens.vercel.app` | Canonical app URL (used for OAuth redirects & canonical headers) |
| `NEXT_PUBLIC_SUPABASE_URL` | Optional | `https://<project-ref>.supabase.co` | Supabase project URL (falls back to resilient in-memory storage if omitted) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Optional | `<supabase-anon-key>` | Supabase anonymous public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional | `<supabase-service-role-key>` | Supabase service role key (for server-side bypass of RLS where authorized) |
| `GEMINI_API_KEY` | Optional | `<your-google-ai-studio-key>` | Google AI Studio key for explanations & route planning |
| `GEMINI_MODEL` | No | `gemma-4-31b-it` | Primary AI model (falls back to `gemini-2.5-flash` or deterministic rule engine) |
| `GEMINI_API_TIMEOUT_MS` | No | `8000` | Server-side Gemini API request timeout in milliseconds |
| `ENABLE_GEMINI` | No | `true` | Enable/disable AI explanation features |
| `ENABLE_OSV` | No | `true` | Enable/disable OSV.dev vulnerability queries (no API key required) |
| `GITHUB_TOKEN` | No | *(Personal access token)* | Optional GitHub token to raise API rate limits from 60/hr to 5,000/hr |
| `SCAN_MAX_FILES` | No | `60` | Max file count cap for deep scans |
| `SCAN_MAX_FILE_BYTES` | No | `2097152` | Max individual file size in bytes (2 MB) |
| `SCAN_MAX_TOTAL_BYTES` | No | `15728640` | Cumulative scan content limit (15 MB) |
| `SCAN_MAX_TREE_ENTRIES` | No | `2000` | Max Git tree entries inspected per scan |

> [!NOTE]
> If Supabase credentials are not provided or Supabase is temporarily unreachable, ContribLens gracefully falls back to local data persistence without failing user requests.

---

## 3. GitHub OAuth Application Setup

To enable "Sign in with GitHub":

1. In GitHub, go to **Settings → Developer settings → OAuth Apps → New OAuth App**.
2. Fill out the application details:
   - **Application name**: `ContribLens`
   - **Homepage URL**: `https://hacktoberfest-contri-blens.vercel.app`
   - **Authorization callback URL**: `https://hacktoberfest-contri-blens.vercel.app/api/auth/callback`
3. Register the application and copy the **Client ID** and generate a **Client Secret**.
4. In your Supabase Dashboard:
   - Go to **Authentication → Providers → GitHub**.
   - Enable GitHub and paste your **Client ID** and **Client Secret**.
   - Ensure the Supabase redirect URL is configured in GitHub if using Supabase Auth.

---

## 4. Supabase Database Schema

When using Supabase, ensure the following core tables are created (from `src/lib/db.ts`):

- `users` — stores user identities, authentication hashes, and display settings.
- `scans` — repository scan sessions, branch metadata, scan status, and totals.
- `findings` — deterministic AST and OSV findings with SHA-256 evidence digests.
- `contribution_routes` — generated beginner-ready PR contribution routes.
- `issue_drafts` — maintainer-reviewable issue drafts with human approval status.
- `activity_events` — audit log events for scans, route progress, and approvals.
- `repository_memory` — cross-scan repository context, primary branches, and cache keys.
- `contributor_progress` — user progress and completed skill milestones.

Row Level Security (RLS) policies enforce that users can only read and mutate their own scans, findings, routes, and drafts.

---

## 5. Post-Deployment Smoke Verification (5 Checks)

After Vercel finishes the deployment build, execute these five verification steps:

### Check 1: Public Landing & Branding
- Visit: `https://hacktoberfest-contri-blens.vercel.app/`
- **Expectation**: HTTP 200 OK.
  - Page renders the luxury smoky gradient background (warm charcoal center, burnt orange upper glow, warm ivory lower glow).
  - Brand name "ContribLens" displays prominently.
  - No visual clipping or broken links in header or footer.

### Check 2: Auth Endpoints & Public Health
- Visit: `https://hacktoberfest-contri-blens.vercel.app/login` and `/signup`
- **Expectation**: Forms render cleanly, email/password validation active, GitHub OAuth button displays.
- Test endpoint: `GET /api/integrations/status` returns `{ success: true, ... }` with zero exposed secrets.

### Check 3: Deterministic Public Repository Scan
- Navigate to `/app/scan` (or test via public scan input).
- Enter a public repository (e.g., `meoxx009/career-AI` or `owner/repo`) with default or custom branch.
- **Expectation**:
  - Branch resolution handles case insensitivity cleanly.
  - Cumulative scan limit permits up to 15 MB.
  - OSV queries execute without requiring API keys.
  - Findings display with deterministic rule IDs, severity badges, and SHA-256 evidence digests.

### Check 4: Contributor Routes & AI Explanation
- Open a completed scan's Contributions tab (`/app/contributions`).
- Trigger "AI Explain" on the detected stack / manifests.
- **Expectation**: Grounded explanation generates from detected technologies and manifests using `gemma-4-31b-it` (or graceful fallback). Engine label displays accurately.

### Check 5: Human Review Gateway & Disclosure Guard
- Navigate to `/app/issue-drafts` and inspect an issue draft.
- **Expectation**:
  - Issue drafts require explicit human review/approval before export.
  - Secrets and Critical severity findings are strictly blocked by the Disclosure Guard (`DISCLOSURE_BLOCKED`).
  - Safe findings allow exporting maintainer markdown with badge `"Maintainer review required"`.
