-- ====================================================================
-- ContribLens v2 — Migration 004: Issue Draft Review & Approval States
-- ====================================================================
-- Purpose:
-- Enforces human-in-the-loop review before any draft export.
-- States: draft, awaiting_review, reviewed, approved, rejected, exported.
-- Invariants: Nothing is ever published automatically to GitHub.
-- ====================================================================

ALTER TABLE public.issue_drafts DROP CONSTRAINT IF EXISTS issue_drafts_status_check;
ALTER TABLE public.issue_drafts ADD CONSTRAINT issue_drafts_status_check
  CHECK (status IN ('draft', 'awaiting_review', 'reviewed', 'approved', 'rejected', 'exported'));

ALTER TABLE public.issue_drafts
  ADD COLUMN IF NOT EXISTS review_decision TEXT CHECK (review_decision IN ('approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_reason TEXT,
  ADD COLUMN IF NOT EXISTS exported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS storage_tier TEXT NOT NULL DEFAULT 'durable_cloud';

CREATE INDEX IF NOT EXISTS idx_drafts_review_decision ON public.issue_drafts(user_id, review_decision);
