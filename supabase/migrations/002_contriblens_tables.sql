-- ContribLens OSS — Database Schema Migration
-- Compatible with Supabase PostgreSQL & Row Level Security (RLS)
-- Tagline: Scan. Understand. Contribute.

-- 1. Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  phone TEXT,
  phone_e164 TEXT,
  display_name TEXT,
  username TEXT UNIQUE,
  github_id TEXT,
  github_username TEXT,
  bio TEXT,
  experience_level TEXT CHECK (experience_level IN ('beginner', 'intermediate', 'advanced')),
  terms_accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_e164_key ON public.profiles(phone_e164) WHERE phone_e164 IS NOT NULL;

-- 2. Scans Table
CREATE TABLE IF NOT EXISTS public.scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  repository_url TEXT NOT NULL,
  owner TEXT NOT NULL,
  repository_name TEXT NOT NULL,
  full_name TEXT NOT NULL,
  default_branch TEXT NOT NULL DEFAULT 'main',
  status TEXT NOT NULL CHECK (status IN ('running', 'complete', 'complete_with_warnings', 'failed')),
  error_code TEXT,
  error_message_safe TEXT,
  stats_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_scans_user_created ON public.scans(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scans_full_name ON public.scans(full_name);

-- 3. Findings Table
CREATE TABLE IF NOT EXISTS public.findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID NOT NULL REFERENCES public.scans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('dependency', 'github-actions', 'secret', 'repository-health', 'community-health')),
  rule_id TEXT NOT NULL,
  title TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  confidence NUMERIC(3, 2) NOT NULL CHECK (confidence >= 0.0 AND confidence <= 1.0),
  verification_status TEXT NOT NULL DEFAULT 'verified' CHECK (verification_status IN ('verified', 'likely', 'needs-review', 'informational')),
  source TEXT NOT NULL,
  file_path TEXT,
  line_start INTEGER,
  line_end INTEGER,
  evidence_snippet_redacted TEXT NOT NULL,
  explanation TEXT,
  remediation TEXT NOT NULL,
  disclosure_mode TEXT NOT NULL CHECK (disclosure_mode IN ('public-issue', 'maintainer-review', 'security-disclosure')),
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_findings_scan_severity ON public.findings(scan_id, severity);
CREATE INDEX IF NOT EXISTS idx_findings_fingerprint ON public.findings(fingerprint);
CREATE INDEX IF NOT EXISTS idx_findings_user ON public.findings(user_id);

-- 4. Technologies Table
CREATE TABLE IF NOT EXISTS public.technologies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID NOT NULL REFERENCES public.scans(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  version TEXT,
  confidence NUMERIC(3, 2) NOT NULL DEFAULT 1.0 CHECK (confidence >= 0.0 AND confidence <= 1.0),
  source_file TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_technologies_scan ON public.technologies(scan_id);

-- 5. Contribution Routes Table
CREATE TABLE IF NOT EXISTS public.contribution_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id UUID NOT NULL REFERENCES public.findings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  required_skills_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  files_to_inspect_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  suggested_tests_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  acceptance_criteria_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  estimated_difficulty TEXT NOT NULL CHECK (estimated_difficulty IN ('beginner', 'intermediate', 'advanced')),
  generated_by TEXT NOT NULL DEFAULT 'deterministic' CHECK (generated_by IN ('gemini', 'deterministic')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_routes_finding ON public.contribution_routes(finding_id);
CREATE INDEX IF NOT EXISTS idx_routes_user ON public.contribution_routes(user_id);

-- 6. Issue Drafts Table
CREATE TABLE IF NOT EXISTS public.issue_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scan_id UUID NOT NULL REFERENCES public.scans(id) ON DELETE CASCADE,
  finding_id UUID REFERENCES public.findings(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  labels_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed', 'exported')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_drafts_user ON public.issue_drafts(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_drafts_scan ON public.issue_drafts(scan_id);

-- ====================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Users can only read and modify their own records.
-- ====================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technologies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contribution_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issue_drafts ENABLE ROW LEVEL SECURITY;

-- Profiles: user owns profile
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Scans: user owns scans
CREATE POLICY "scans_all_own" ON public.scans
  FOR ALL USING (auth.uid() = user_id);

-- Findings: user owns findings
CREATE POLICY "findings_all_own" ON public.findings
  FOR ALL USING (auth.uid() = user_id);

-- Technologies: accessible through user scans
CREATE POLICY "technologies_select_own" ON public.technologies
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.scans
      WHERE public.scans.id = public.technologies.scan_id
      AND public.scans.user_id = auth.uid()
    )
  );

CREATE POLICY "technologies_all_own" ON public.technologies
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.scans
      WHERE public.scans.id = public.technologies.scan_id
      AND public.scans.user_id = auth.uid()
    )
  );

-- Contribution Routes: user owns routes
CREATE POLICY "routes_all_own" ON public.contribution_routes
  FOR ALL USING (auth.uid() = user_id);

-- Issue Drafts: user owns drafts
CREATE POLICY "drafts_all_own" ON public.issue_drafts
  FOR ALL USING (auth.uid() = user_id);

-- ====================================================================
-- 7. PUBLIC AGGREGATE STATS VIEW (DATABASE.md §8)
-- Built only from non-private fields. Powers the public /stats page.
-- ====================================================================

CREATE OR REPLACE VIEW public.public_stats AS
SELECT
  (SELECT COUNT(DISTINCT full_name) FROM public.scans) AS total_repositories,
  (SELECT COUNT(*) FROM public.scans WHERE status IN ('complete', 'complete_with_warnings')) AS total_scans,
  (SELECT COUNT(*) FROM public.findings) AS total_findings_verified,
  (SELECT COUNT(*) FROM public.contribution_routes) AS total_routes_generated;

GRANT SELECT ON public.public_stats TO anon, authenticated;
