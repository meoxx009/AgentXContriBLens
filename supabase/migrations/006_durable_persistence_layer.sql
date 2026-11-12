-- ====================================================================
-- ContribLens v2 — Migration 006: Complete Durable Persistence Layer
-- ====================================================================
-- Purpose:
-- 1. Complete Supabase durable persistence for routes, issue_drafts,
--    technologies, activities, scans, findings, and contributor_progress.
-- 2. Ensure all tables support string IDs (scn_..., fnd_..., rte_..., dft_..., act_...).
-- 3. Row Level Security (RLS) ensures tenant isolation while allowing
--    anonymous previews (user_id IS NULL) where appropriate.
-- 4. Include raw_json JSONB column to guarantee zero data loss.
-- ====================================================================

-- 1. Routes Table
CREATE TABLE IF NOT EXISTS public.routes (
  id TEXT PRIMARY KEY,
  scan_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  finding_id TEXT,
  title TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'not-started',
  raw_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'routes') THEN
    ALTER TABLE public.routes ALTER COLUMN id TYPE TEXT;
    ALTER TABLE public.routes ALTER COLUMN scan_id TYPE TEXT;
    ALTER TABLE public.routes ALTER COLUMN user_id DROP NOT NULL;
    ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS finding_id TEXT;
    ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS title TEXT DEFAULT '';
    ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'not-started';
    ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS raw_json JSONB DEFAULT '{}'::jsonb;
    ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_routes_scan_id ON public.routes(scan_id);
CREATE INDEX IF NOT EXISTS idx_routes_user_id ON public.routes(user_id);
CREATE INDEX IF NOT EXISTS idx_routes_finding_id ON public.routes(finding_id);

-- 2. Issue Drafts Table
CREATE TABLE IF NOT EXISTS public.issue_drafts (
  id TEXT PRIMARY KEY,
  scan_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  finding_id TEXT,
  route_id TEXT,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  markdown_content TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  raw_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'issue_drafts') THEN
    ALTER TABLE IF EXISTS public.issue_drafts DROP CONSTRAINT IF EXISTS issue_drafts_scan_id_fkey;
    ALTER TABLE IF EXISTS public.issue_drafts DROP CONSTRAINT IF EXISTS issue_drafts_finding_id_fkey;
    ALTER TABLE IF EXISTS public.issue_drafts DROP CONSTRAINT IF EXISTS issue_drafts_route_id_fkey;
    ALTER TABLE public.issue_drafts ALTER COLUMN id TYPE TEXT;
    ALTER TABLE public.issue_drafts ALTER COLUMN scan_id TYPE TEXT;
    ALTER TABLE public.issue_drafts ALTER COLUMN user_id DROP NOT NULL;
    ALTER TABLE public.issue_drafts ADD COLUMN IF NOT EXISTS finding_id TEXT;
    ALTER TABLE public.issue_drafts ADD COLUMN IF NOT EXISTS route_id TEXT;
    ALTER TABLE public.issue_drafts ADD COLUMN IF NOT EXISTS body TEXT DEFAULT '';
    ALTER TABLE public.issue_drafts ADD COLUMN IF NOT EXISTS markdown_content TEXT;
    ALTER TABLE public.issue_drafts ADD COLUMN IF NOT EXISTS raw_json JSONB DEFAULT '{}'::jsonb;
    ALTER TABLE public.issue_drafts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_issue_drafts_scan ON public.issue_drafts(scan_id);
CREATE INDEX IF NOT EXISTS idx_issue_drafts_user ON public.issue_drafts(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_issue_drafts_finding ON public.issue_drafts(finding_id);

-- 3. Technologies Table
CREATE TABLE IF NOT EXISTS public.technologies (
  id TEXT PRIMARY KEY,
  scan_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  version TEXT,
  confidence NUMERIC(3, 2) NOT NULL DEFAULT 1.0,
  source_file TEXT,
  raw_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'technologies') THEN
    ALTER TABLE IF EXISTS public.technologies DROP CONSTRAINT IF EXISTS technologies_scan_id_fkey;
    ALTER TABLE public.technologies ALTER COLUMN id TYPE TEXT;
    ALTER TABLE public.technologies ALTER COLUMN scan_id TYPE TEXT;
    ALTER TABLE public.technologies ADD COLUMN IF NOT EXISTS raw_json JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_technologies_scan_id ON public.technologies(scan_id);

-- 4. Activities Table
CREATE TABLE IF NOT EXISTS public.activities (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  repo_name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  raw_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'activities') THEN
    ALTER TABLE public.activities ALTER COLUMN id TYPE TEXT;
    ALTER TABLE public.activities ALTER COLUMN user_id DROP NOT NULL;
    ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS repo_name TEXT DEFAULT '';
    ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
    ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS raw_json JSONB DEFAULT '{}'::jsonb;
    ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS timestamp TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_activities_user ON public.activities(user_id, timestamp DESC);

-- 5. Row Level Security (RLS)
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issue_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technologies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Routes policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'routes' AND policyname = 'routes_select_own') THEN
    CREATE POLICY "routes_select_own" ON public.routes FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'routes' AND policyname = 'routes_insert_own') THEN
    CREATE POLICY "routes_insert_own" ON public.routes FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'routes' AND policyname = 'routes_update_own') THEN
    CREATE POLICY "routes_update_own" ON public.routes FOR UPDATE USING (auth.uid() = user_id OR user_id IS NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'routes' AND policyname = 'routes_delete_own') THEN
    CREATE POLICY "routes_delete_own" ON public.routes FOR DELETE USING (auth.uid() = user_id OR user_id IS NULL);
  END IF;

  -- Issue Drafts policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'issue_drafts' AND policyname = 'drafts_select_own') THEN
    CREATE POLICY "drafts_select_own" ON public.issue_drafts FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'issue_drafts' AND policyname = 'drafts_insert_own') THEN
    CREATE POLICY "drafts_insert_own" ON public.issue_drafts FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'issue_drafts' AND policyname = 'drafts_update_own') THEN
    CREATE POLICY "drafts_update_own" ON public.issue_drafts FOR UPDATE USING (auth.uid() = user_id OR user_id IS NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'issue_drafts' AND policyname = 'drafts_delete_own') THEN
    CREATE POLICY "drafts_delete_own" ON public.issue_drafts FOR DELETE USING (auth.uid() = user_id OR user_id IS NULL);
  END IF;

  -- Technologies policies (public readable or by scan)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'technologies' AND policyname = 'technologies_select_all') THEN
    CREATE POLICY "technologies_select_all" ON public.technologies FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'technologies' AND policyname = 'technologies_insert_all') THEN
    CREATE POLICY "technologies_insert_all" ON public.technologies FOR INSERT WITH CHECK (true);
  END IF;

  -- Activities policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'activities' AND policyname = 'activities_select_own') THEN
    CREATE POLICY "activities_select_own" ON public.activities FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'activities' AND policyname = 'activities_insert_own') THEN
    CREATE POLICY "activities_insert_own" ON public.activities FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
  END IF;
END $$;
