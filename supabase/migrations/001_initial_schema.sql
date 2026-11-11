-- ContribLens OSS — Initial Schema Migration
-- Compatible with Supabase PostgreSQL & Row Level Security (RLS)

-- 1. Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  username TEXT UNIQUE,
  phone_e164 TEXT,
  github_id TEXT,
  github_username TEXT,
  bio TEXT,
  experience_level TEXT CHECK (experience_level IN ('beginner', 'intermediate', 'advanced')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Unique index for non-null phone numbers
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_e164_key ON public.profiles(phone_e164) WHERE phone_e164 IS NOT NULL;

-- 2. User Preferences Table
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'black-hole' CHECK (theme IN ('black-hole', 'linen', 'system')),
  font_size TEXT NOT NULL DEFAULT 'medium' CHECK (font_size IN ('small', 'medium', 'large')),
  font_family TEXT NOT NULL DEFAULT 'system' CHECK (font_family IN ('system', 'inter', 'manrope', 'grotesk')),
  reduce_motion BOOLEAN NOT NULL DEFAULT false,
  ai_explanations BOOLEAN NOT NULL DEFAULT true,
  save_scan_history BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Repositories Table (Global Public Metadata Cache)
CREATE TABLE IF NOT EXISTS public.repositories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  full_name TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL,
  default_branch TEXT NOT NULL DEFAULT 'main',
  last_scanned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_repositories_full_name ON public.repositories(full_name);

-- 4. Scans Table
CREATE TABLE IF NOT EXISTS public.scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  repository_id UUID REFERENCES public.repositories(id) ON DELETE SET NULL,
  ref TEXT NOT NULL DEFAULT 'main',
  commit_sha TEXT,
  scope TEXT NOT NULL DEFAULT 'partial' CHECK (scope IN ('partial', 'deep')),
  status TEXT NOT NULL CHECK (status IN ('running', 'complete', 'complete_with_warnings', 'failed')),
  error_code TEXT,
  files_scanned INTEGER NOT NULL DEFAULT 0,
  bytes_scanned INTEGER NOT NULL DEFAULT 0,
  files_skipped INTEGER NOT NULL DEFAULT 0,
  technologies JSONB NOT NULL DEFAULT '{}'::jsonb,
  health JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_scans_user_created ON public.scans(user_id, created_at DESC);

-- 5. Findings Table
CREATE TABLE IF NOT EXISTS public.findings (
  id TEXT PRIMARY KEY,
  scan_id UUID NOT NULL REFERENCES public.scans(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('dependency', 'github-actions', 'secret', 'repository-health')),
  rule_id TEXT NOT NULL,
  title TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  confidence NUMERIC(3, 2) NOT NULL CHECK (confidence >= 0.0 AND confidence <= 1.0),
  source_tool TEXT NOT NULL,
  file TEXT,
  line_start INTEGER,
  line_end INTEGER,
  evidence TEXT NOT NULL,
  impact TEXT NOT NULL,
  fix_hint TEXT NOT NULL,
  skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  learning_resources JSONB NOT NULL DEFAULT '[]'::jsonb,
  contributor_level_impact INTEGER DEFAULT 15,
  disclosure_mode TEXT NOT NULL CHECK (disclosure_mode IN ('public-issue', 'maintainer-review', 'security-disclosure')),
  redacted BOOLEAN NOT NULL DEFAULT false,
  evidence_hash TEXT NOT NULL,
  fingerprint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_findings_scan_severity ON public.findings(scan_id, severity);

-- 6. Contribution Routes Table
CREATE TABLE IF NOT EXISTS public.contribution_routes (
  id TEXT PRIMARY KEY,
  scan_id UUID NOT NULL REFERENCES public.scans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  finding_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  estimated_minutes INTEGER NOT NULL DEFAULT 30,
  skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  learning_resources JSONB NOT NULL DEFAULT '[]'::jsonb,
  contributor_level_impact INTEGER DEFAULT 15,
  files JSONB NOT NULL DEFAULT '[]'::jsonb,
  suggested_change TEXT,
  test_plan JSONB NOT NULL DEFAULT '[]'::jsonb,
  acceptance_criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
  readiness JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'not-started' CHECK (status IN ('not-started', 'in-progress', 'needs-review', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_routes_user_status ON public.contribution_routes(user_id, status);

-- 7. Issue Drafts Table
CREATE TABLE IF NOT EXISTS public.issue_drafts (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scan_id UUID NOT NULL REFERENCES public.scans(id) ON DELETE CASCADE,
  route_id TEXT REFERENCES public.contribution_routes(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  markdown TEXT NOT NULL,
  disclosure_mode TEXT NOT NULL CHECK (disclosure_mode IN ('public-issue', 'maintainer-review', 'security-disclosure')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed', 'exported')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_drafts_user_updated ON public.issue_drafts(user_id, updated_at DESC);

-- 8. Activity Events Table
CREATE TABLE IF NOT EXISTS public.activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('scan_completed', 'finding_reviewed', 'route_started', 'draft_created', 'route_completed')),
  repo_name TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_activity_user ON public.activity_events(user_id, created_at DESC);

-- ====================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ====================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repositories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contribution_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issue_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can read and update only their own profile
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Preferences: Users can manage own preferences
CREATE POLICY "Users can manage own preferences" ON public.user_preferences
  FOR ALL USING (auth.uid() = user_id);

-- Repositories: Global read access for caching public repo metadata
CREATE POLICY "Public repo metadata is readable" ON public.repositories
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert repos" ON public.repositories
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Scans: Users can view and manage only their own scans
CREATE POLICY "Users can manage own scans" ON public.scans
  FOR ALL USING (auth.uid() = user_id);

-- Findings: Users can read findings belonging to their scans
CREATE POLICY "Users can view findings for own scans" ON public.findings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.scans
      WHERE public.scans.id = public.findings.scan_id
      AND public.scans.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage findings for own scans" ON public.findings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.scans
      WHERE public.scans.id = public.findings.scan_id
      AND public.scans.user_id = auth.uid()
    )
  );

-- Routes: Users can manage own contribution routes
CREATE POLICY "Users can manage own routes" ON public.contribution_routes
  FOR ALL USING (auth.uid() = user_id);

-- Issue Drafts: Users can manage own drafts
CREATE POLICY "Users can manage own drafts" ON public.issue_drafts
  FOR ALL USING (auth.uid() = user_id);

-- Activity: Users can read own activity
CREATE POLICY "Users can view own activity" ON public.activity_events
  FOR ALL USING (auth.uid() = user_id);

-- ====================================================================
-- 9. PUBLIC AGGREGATE STATS VIEW (DATABASE.md §8)
-- Built only from non-private fields. Powers the public /stats page.
-- ====================================================================

CREATE OR REPLACE VIEW public.public_stats AS
SELECT
  (SELECT COUNT(DISTINCT full_name) FROM public.repositories) AS total_repositories,
  (SELECT COUNT(*) FROM public.scans WHERE status IN ('complete', 'complete_with_warnings')) AS total_scans,
  (SELECT COUNT(*) FROM public.findings) AS total_findings_verified,
  (SELECT COUNT(*) FROM public.contribution_routes) AS total_routes_generated;

GRANT SELECT ON public.public_stats TO anon, authenticated;
