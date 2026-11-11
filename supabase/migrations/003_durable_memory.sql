-- ====================================================================
-- ContribLens v2 — Migration 003: Durable Cross-Session Memory
-- ====================================================================
-- Purpose:
-- 1. Persist repository memory (previous scans, finding fingerprints,
--    readiness score, safe warnings, diff baseline) across serverless instances.
-- 2. Persist contributor progress (completed tasks, learned skill IDs, timestamps).
-- 3. Row Level Security (RLS) guarantees complete owner isolation:
--    User A can never read or modify User B's repository memory or progress.
-- ====================================================================

-- 1. Repository Memory Table
CREATE TABLE IF NOT EXISTS public.repository_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_repo TEXT NOT NULL,
  last_scan_id TEXT NOT NULL,
  last_scanned_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  ref TEXT NOT NULL DEFAULT 'main',
  scope TEXT NOT NULL DEFAULT 'partial' CHECK (scope IN ('partial', 'deep')),
  readiness_score INTEGER NOT NULL DEFAULT 0 CHECK (readiness_score >= 0 AND readiness_score <= 100),
  summary_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  finding_fingerprints JSONB NOT NULL DEFAULT '[]'::jsonb,
  safe_warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  storage_tier TEXT NOT NULL DEFAULT 'durable_cloud' CHECK (storage_tier IN ('durable_cloud', 'local_ephemeral')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_user_owner_repo UNIQUE (user_id, owner_repo)
);

CREATE INDEX IF NOT EXISTS idx_repo_memory_user ON public.repository_memory(user_id);
CREATE INDEX IF NOT EXISTS idx_repo_memory_owner_repo ON public.repository_memory(owner_repo);
CREATE INDEX IF NOT EXISTS idx_repo_memory_user_repo ON public.repository_memory(user_id, owner_repo);

-- 2. Contributor Progress Table
CREATE TABLE IF NOT EXISTS public.contributor_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL,
  task_title TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'in-progress' CHECK (status IN ('in-progress', 'completed')),
  learned_skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  completed_at TIMESTAMPTZ,
  storage_tier TEXT NOT NULL DEFAULT 'durable_cloud' CHECK (storage_tier IN ('durable_cloud', 'local_ephemeral')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_user_task_id UNIQUE (user_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_contributor_progress_user ON public.contributor_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_contributor_progress_status ON public.contributor_progress(user_id, status);

-- ====================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Strict owner isolation: auth.uid() must match record user_id.
-- ====================================================================

ALTER TABLE public.repository_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contributor_progress ENABLE ROW LEVEL SECURITY;

-- Repository Memory Policies
CREATE POLICY "repo_memory_select_own" ON public.repository_memory
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "repo_memory_insert_own" ON public.repository_memory
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "repo_memory_update_own" ON public.repository_memory
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "repo_memory_delete_own" ON public.repository_memory
  FOR DELETE USING (auth.uid() = user_id);

-- Contributor Progress Policies
CREATE POLICY "contributor_progress_select_own" ON public.contributor_progress
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "contributor_progress_insert_own" ON public.contributor_progress
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "contributor_progress_update_own" ON public.contributor_progress
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "contributor_progress_delete_own" ON public.contributor_progress
  FOR DELETE USING (auth.uid() = user_id);
