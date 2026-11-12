-- ====================================================================
-- ContribLens v2 — Migration 005: Scans and Findings Supabase Persistence
-- ====================================================================
-- Purpose:
-- 1. Ensure scans and findings tables support string IDs (scn_..., fnd_...).
-- 2. Persist scans and findings across serverless instances to prevent
--    ephemeral /tmp storage loss and 404 "Finding not found" on explain.
-- 3. Row Level Security (RLS) ensures tenant isolation.
-- ====================================================================

-- 1. Scans Table
CREATE TABLE IF NOT EXISTS public.scans (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  repo_name TEXT NOT NULL,
  repo_url TEXT,
  owner TEXT,
  ref TEXT NOT NULL DEFAULT 'main',
  status TEXT NOT NULL DEFAULT 'completed',
  technologies JSONB NOT NULL DEFAULT '{}'::jsonb,
  tech_stack JSONB NOT NULL DEFAULT '{}'::jsonb,
  health JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_files INTEGER NOT NULL DEFAULT 0,
  total_bytes INTEGER NOT NULL DEFAULT 0,
  raw_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Ensure columns exist and ID type is compatible if table was created by older migrations
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'scans') THEN
    ALTER TABLE IF EXISTS public.findings DROP CONSTRAINT IF EXISTS findings_scan_id_fkey;
    ALTER TABLE public.scans ALTER COLUMN id TYPE TEXT;
    ALTER TABLE public.scans ALTER COLUMN user_id DROP NOT NULL;
    ALTER TABLE public.scans ADD COLUMN IF NOT EXISTS repo_name TEXT;
    ALTER TABLE public.scans ADD COLUMN IF NOT EXISTS repo_url TEXT;
    ALTER TABLE public.scans ADD COLUMN IF NOT EXISTS owner TEXT;
    ALTER TABLE public.scans ADD COLUMN IF NOT EXISTS ref TEXT DEFAULT 'main';
    ALTER TABLE public.scans ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed';
    ALTER TABLE public.scans ADD COLUMN IF NOT EXISTS technologies JSONB DEFAULT '{}'::jsonb;
    ALTER TABLE public.scans ADD COLUMN IF NOT EXISTS tech_stack JSONB DEFAULT '{}'::jsonb;
    ALTER TABLE public.scans ADD COLUMN IF NOT EXISTS health JSONB DEFAULT '{}'::jsonb;
    ALTER TABLE public.scans ADD COLUMN IF NOT EXISTS total_files INTEGER DEFAULT 0;
    ALTER TABLE public.scans ADD COLUMN IF NOT EXISTS total_bytes INTEGER DEFAULT 0;
    ALTER TABLE public.scans ADD COLUMN IF NOT EXISTS raw_json JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_scans_user_created ON public.scans(user_id, created_at DESC);

-- 2. Findings Table
CREATE TABLE IF NOT EXISTS public.findings (
  id TEXT PRIMARY KEY,
  scan_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  rule_id TEXT NOT NULL,
  title TEXT NOT NULL,
  severity TEXT NOT NULL,
  category TEXT NOT NULL,
  confidence NUMERIC(3, 2) NOT NULL DEFAULT 0.85,
  source_tool TEXT NOT NULL DEFAULT 'scanner',
  file TEXT,
  line_start INTEGER,
  line_end INTEGER,
  evidence TEXT NOT NULL DEFAULT '',
  evidence_hash TEXT NOT NULL DEFAULT '',
  impact TEXT NOT NULL DEFAULT '',
  fix_hint TEXT NOT NULL DEFAULT '',
  skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  learning_resources JSONB NOT NULL DEFAULT '[]'::jsonb,
  disclosure_mode TEXT NOT NULL DEFAULT 'maintainer-review',
  redacted BOOLEAN NOT NULL DEFAULT true,
  fingerprint TEXT,
  readiness JSONB DEFAULT '{}'::jsonb,
  explanation_modes JSONB DEFAULT '{}'::jsonb,
  reviewed BOOLEAN DEFAULT false,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  diff_status TEXT DEFAULT 'new',
  raw_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Ensure columns exist and ID types are compatible if table was created by older migrations
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'findings') THEN
    ALTER TABLE public.findings ALTER COLUMN id TYPE TEXT;
    ALTER TABLE public.findings ALTER COLUMN scan_id TYPE TEXT;
    ALTER TABLE public.findings ALTER COLUMN user_id DROP NOT NULL;
    ALTER TABLE public.findings ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
    ALTER TABLE public.findings ADD COLUMN IF NOT EXISTS raw_json JSONB DEFAULT '{}'::jsonb;
    ALTER TABLE public.findings ADD COLUMN IF NOT EXISTS readiness JSONB DEFAULT '{}'::jsonb;
    ALTER TABLE public.findings ADD COLUMN IF NOT EXISTS explanation_modes JSONB DEFAULT '{}'::jsonb;
    ALTER TABLE public.findings ADD COLUMN IF NOT EXISTS reviewed BOOLEAN DEFAULT false;
    ALTER TABLE public.findings ADD COLUMN IF NOT EXISTS reviewed_by TEXT;
    ALTER TABLE public.findings ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
    ALTER TABLE public.findings ADD COLUMN IF NOT EXISTS diff_status TEXT DEFAULT 'new';
    ALTER TABLE public.findings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_findings_scan_id ON public.findings(scan_id);
CREATE INDEX IF NOT EXISTS idx_findings_fingerprint ON public.findings(fingerprint);
CREATE INDEX IF NOT EXISTS idx_findings_user ON public.findings(user_id);

-- 3. Row Level Security (RLS)
ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.findings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Scans policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'scans' AND policyname = 'scans_select_own') THEN
    CREATE POLICY "scans_select_own" ON public.scans FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'scans' AND policyname = 'scans_insert_own') THEN
    CREATE POLICY "scans_insert_own" ON public.scans FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'scans' AND policyname = 'scans_update_own') THEN
    CREATE POLICY "scans_update_own" ON public.scans FOR UPDATE USING (auth.uid() = user_id OR user_id IS NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'scans' AND policyname = 'scans_delete_own') THEN
    CREATE POLICY "scans_delete_own" ON public.scans FOR DELETE USING (auth.uid() = user_id OR user_id IS NULL);
  END IF;

  -- Findings policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'findings' AND policyname = 'findings_select_own') THEN
    CREATE POLICY "findings_select_own" ON public.findings FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'findings' AND policyname = 'findings_insert_own') THEN
    CREATE POLICY "findings_insert_own" ON public.findings FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'findings' AND policyname = 'findings_update_own') THEN
    CREATE POLICY "findings_update_own" ON public.findings FOR UPDATE USING (auth.uid() = user_id OR user_id IS NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'findings' AND policyname = 'findings_delete_own') THEN
    CREATE POLICY "findings_delete_own" ON public.findings FOR DELETE USING (auth.uid() = user_id OR user_id IS NULL);
  END IF;
END $$;
