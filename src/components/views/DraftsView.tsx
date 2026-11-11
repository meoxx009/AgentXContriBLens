'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useApp } from '@/components/AppContext';
import {
  FileText,
  Copy,
  Download,
  Check,
  Loader2,
  Code2,
  Eye,
  Edit3,
  Trash2,
  Save,
  Tag,
  ShieldAlert,
  Sparkles,
  RotateCw,
  ExternalLink,
  CheckCircle2,
  Info,
  ShieldCheck,
  XCircle,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import type { IssueDraft, DraftStatus } from '@/types';
import { redactSecrets } from '@/lib/redaction';
import { EngineBadge } from '@/components/ui/EngineBadge';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import LastUpdatedBadge from '@/components/ui/LastUpdatedBadge';
import AutosaveStatusBadge from '@/components/ui/AutosaveStatusBadge';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useAutosave } from '@/lib/useAutosave';
import { useFormValidation, IssueDraftEditSchema, FormFieldError } from '@/lib/validation';

function DraftsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedDraftId = searchParams.get('draftId');

  const { activeScan, showToast, setActiveScan, setSessionExpired, openAuthModal, user } = useApp();

  const [drafts, setDrafts] = useState<IssueDraft[]>([]);
  const [selectedDraft, setSelectedDraft] = useState<IssueDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'preview' | 'edit' | 'raw'>('preview');
  type DraftsError = 'session_expired' | 'forbidden' | 'server_error' | 'network_offline' | 'not_found' | null;
  const [errorType, setErrorType] = useState<DraftsError>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Edit draft form state
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editLabels, setEditLabels] = useState('');
  const [editStatus, setEditStatus] = useState<DraftStatus>('draft');
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDiscardUnsavedConfirm, setShowDiscardUnsavedConfirm] = useState(false);
  const [pendingDraftToSwitch, setPendingDraftToSwitch] = useState<IssueDraft | null>(null);
  const fetchSequenceRef = useRef<number>(0);

  useEffect(() => {
    const seq = fetchSequenceRef;
    return () => {
      seq.current++;
    };
  }, []);

  // Authoritative form validation for draft editing
  const draftValidation = useFormValidation({
    schema: IssueDraftEditSchema,
    initialValues: {
      title: editTitle,
      body: editBody,
      labels: editLabels,
      status: editStatus,
    },
    idPrefix: 'draft-edit',
  });

  // Human Review & Approval state
  const [reviewing, setReviewing] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  // Optimistic UI mutation tracking & inline error states
  const [syncingDraftId, setSyncingDraftId] = useState<string | null>(null);
  const [draftMutationError, setDraftMutationError] = useState<{
    draftId: string;
    message: string;
    retry: () => void;
  } | null>(null);

  useEffect(() => {
    fetchDrafts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeScan]);

  useEffect(() => {
    if (selectedDraft) {
      const title = selectedDraft.title || '';
      const body = selectedDraft.markdownContent || selectedDraft.body || '';
      const labels = (selectedDraft.labels || []).join(', ');
      const status = selectedDraft.status || 'draft';
      setEditTitle(title);
      setEditBody(body);
      setEditLabels(labels);
      setEditStatus(status);
      setShowDeleteConfirm(false);
      draftValidation.reset({
        title,
        body,
        labels,
        status,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDraft]);

  const draftAutosave = useAutosave<{
    title: string;
    labels: string;
    body: string;
    status: DraftStatus;
  }>({
    id: selectedDraft ? selectedDraft.id : '',
    value: {
      title: editTitle,
      labels: editLabels,
      body: editBody,
      status: editStatus,
    },
    enabled: Boolean(selectedDraft && viewMode === 'edit'),
    isAuthenticated: Boolean(user),
    storageKey: selectedDraft ? `contriblens_draft_${selectedDraft.id}` : undefined,
    delayMs: 850,
    onSave: async (val) => {
      if (!selectedDraft) return { success: false, error: 'No draft selected' };
      const targetDraftId = selectedDraft.id;
      const parsedLabels = val.labels
        .split(',')
        .map((l) => l.trim())
        .filter(Boolean);
      const cleanMarkdown = redactSecrets(val.body);
      const cleanTitle = redactSecrets(val.title.trim());

      const res = await fetch('/api/drafts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId: targetDraftId,
          title: cleanTitle,
          markdownContent: cleanMarkdown,
          labels: parsedLabels,
          status: val.status,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const serverDraft: IssueDraft = data.draft;
        setSelectedDraft(serverDraft);
        setDrafts((prev) => prev.map((d) => (d.id === serverDraft.id ? serverDraft : d)));
        return { success: true };
      } else {
        const err = await res.json().catch(() => ({}));
        return {
          success: false,
          error: err.error?.message || err.error || 'Server rejected draft update',
        };
      }
    },
    onRestore: (val) => {
      setEditTitle(val.title);
      setEditLabels(val.labels);
      setEditBody(val.body);
      if (val.status) setEditStatus(val.status);
      showToast('Restored unsaved draft edits from browser storage.', 'info');
    },
  });

  const fetchDrafts = async () => {
    const currentSeq = ++fetchSequenceRef.current;
    setLoading(true);
    setFetchError(null);
    setErrorType(null);
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        if (currentSeq !== fetchSequenceRef.current) return;
        setErrorType('network_offline');
        setFetchError('You appear to be offline. Please verify your internet connection.');
        setLoading(false);
        return;
      }

      let url = activeScan ? `/api/drafts?scanId=${activeScan.id}` : '/api/drafts';
      let res = await fetch(url);

      // Self-heal on 404 with stale activeScan
      if (res.status === 404 && activeScan) {
        setActiveScan(null);
        try {
          localStorage.removeItem('contriblens_active_scan');
        } catch (err) {
          console.debug('Failed to remove active scan from localStorage:', err);
        }
        res = await fetch('/api/drafts');
      }

      if (currentSeq !== fetchSequenceRef.current) return;

      if (res.status === 404) {
        setErrorType('not_found');
        setFetchError('The requested repository scan or issue drafts could not be found.');
        setDrafts([]);
        setLoading(false);
        return;
      }

      if (res.status === 401) {
        setErrorType('session_expired');
        setFetchError('Your ContribLens session has expired. Please sign in again.');
        setSessionExpired(true);
        setDrafts([]);
        setLoading(false);
        return;
      }

      if (res.status === 403) {
        setErrorType('forbidden');
        setFetchError('You do not have authorization to view issue drafts for this scan.');
        setDrafts([]);
        setLoading(false);
        return;
      }

      if (res.status >= 500) {
        setErrorType('server_error');
        setFetchError('Failed to load issue drafts due to a server error. Please retry.');
        setDrafts([]);
        setLoading(false);
        return;
      }

      if (res.ok) {
        const data = await res.json();
        if (currentSeq !== fetchSequenceRef.current) return;
        const loadedDrafts: IssueDraft[] = data.drafts || [];
        setDrafts(loadedDrafts);

        if (requestedDraftId) {
          const match = loadedDrafts.find((d) => d.id === requestedDraftId);
          if (match) setSelectedDraft(match);
          else if (loadedDrafts.length > 0) setSelectedDraft(loadedDrafts[0]);
        } else if (loadedDrafts.length > 0) {
          setSelectedDraft(loadedDrafts[0]);
        }
      }
    } catch (e: any) {
      if (currentSeq !== fetchSequenceRef.current) return;
      console.error('Failed to load drafts:', e);
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setErrorType('network_offline');
        setFetchError('You appear to be offline. Please verify your internet connection.');
      } else {
        setErrorType('server_error');
        setFetchError('Failed to load issue drafts. Please check your network and retry.');
      }
    } finally {
      if (currentSeq === fetchSequenceRef.current) {
        setLoading(false);
      }
    }
  };

  const handleRegenerateDraft = async () => {
    if (!selectedDraft || regenerating) return;
    setRegenerating(true);
    try {
      const res = await fetch('/api/issue-drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId: selectedDraft.id,
          regenerate: true,
        }),
      });

      const data = await res.json();
      if (res.ok && data.draft) {
        setSelectedDraft(data.draft);
        setDrafts((prev) => prev.map((d) => (d.id === data.draft.id ? data.draft : d)));
        showToast(
          data.draft.generatedBy === 'gemini'
            ? 'Draft regenerated via Gamma 4 using server-side evidence!'
            : 'Draft regenerated via Deterministic Planner (Fallback)',
          'success'
        );
      } else {
        showToast(data.error || 'Failed to regenerate draft', 'error');
      }
    } catch {
      showToast('Error regenerating draft', 'error');
    } finally {
      setRegenerating(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!selectedDraft || saving || syncingDraftId) return;

    // Validate using authoritative Zod schema
    const validationResult = draftValidation.validateAll({
      title: editTitle,
      body: editBody,
      labels: editLabels,
      status: editStatus,
    });
    if (!validationResult.isValid) {
      showToast('Please fix the errors in your draft before saving.', 'error');
      return;
    }

    const targetDraftId = selectedDraft.id;
    const previousDraft = { ...selectedDraft };
    const previousDrafts = [...drafts];

    const parsedLabels = editLabels
      .split(',')
      .map((l) => l.trim())
      .filter(Boolean);

    // Defensively re-redact before sending
    const cleanMarkdown = redactSecrets(editBody);
    const cleanTitle = redactSecrets(editTitle.trim());

    // 1. Optimistic UI update immediately
    const optimisticDraft: IssueDraft = {
      ...selectedDraft,
      title: cleanTitle,
      markdownContent: cleanMarkdown,
      labels: parsedLabels,
      status: editStatus,
      updatedAt: new Date().toISOString(),
    };

    setSelectedDraft(optimisticDraft);
    setDrafts((prev) => prev.map((d) => (d.id === optimisticDraft.id ? optimisticDraft : d)));
    setViewMode('preview');
    setSyncingDraftId(targetDraftId);
    setDraftMutationError(null);
    setSaving(true);

    try {
      const res = await fetch('/api/drafts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId: targetDraftId,
          title: cleanTitle,
          markdownContent: cleanMarkdown,
          labels: parsedLabels,
          status: editStatus,
        }),
      });

      if (res.ok) {
        // 2. Reconcile with server-confirmed data
        const data = await res.json();
        const serverDraft: IssueDraft = data.draft;
        setSelectedDraft(serverDraft);
        setDrafts((prev) => prev.map((d) => (d.id === serverDraft.id ? serverDraft : d)));
        try {
          localStorage.removeItem(`contriblens_draft_${targetDraftId}`);
        } catch (err) {
          console.debug('Failed to remove draft backup from localStorage:', err);
        }
        showToast('Draft updated and saved successfully!', 'success');
      } else {
        // 3. Rollback on failure
        const data = await res.json().catch(() => ({}));
        draftValidation.applyServerErrors(data, ['title', 'body', 'labels']);
        setSelectedDraft(previousDraft);
        setDrafts(previousDrafts);
        setEditTitle(previousDraft.title);
        setEditBody(previousDraft.markdownContent || previousDraft.body || '');
        setDraftMutationError({
          draftId: targetDraftId,
          message: data.error || 'Failed to save draft changes on server. Reverted.',
          retry: () => handleSaveDraft(),
        });
        showToast('Failed to save draft. Reverted changes.', 'error');
      }
    } catch {
      // 3. Rollback on network failure
      setSelectedDraft(previousDraft);
      setDrafts(previousDrafts);
      setEditTitle(previousDraft.title);
      setEditBody(previousDraft.markdownContent || previousDraft.body || '');
      setDraftMutationError({
        draftId: targetDraftId,
        message: 'Network error saving draft changes. Reverted to previous state.',
        retry: () => handleSaveDraft(),
      });
      showToast('Error saving draft. Reverted changes.', 'error');
    } finally {
      setSaving(false);
      setSyncingDraftId(null);
    }
  };

  const handleDeleteDraft = async () => {
    if (!selectedDraft || deleting) return;
    const targetDraftId = selectedDraft.id;
    const previousDraft = { ...selectedDraft };
    const previousDrafts = [...drafts];

    // 1. Optimistic removal from UI immediately
    const remaining = drafts.filter((d) => d.id !== targetDraftId);
    setDrafts(remaining);
    setSelectedDraft(remaining.length > 0 ? remaining[0] : null);
    setShowDeleteConfirm(false);
    setDraftMutationError(null);
    setDeleting(true);

    try {
      const res = await fetch(`/api/drafts?draftId=${targetDraftId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        showToast('Draft deleted successfully', 'info');
      } else {
        // 3. Rollback on failure: restore draft
        setDrafts(previousDrafts);
        setSelectedDraft(previousDraft);
        setDraftMutationError({
          draftId: targetDraftId,
          message: 'Failed to delete draft on server. Restored to your drafts.',
          retry: () => handleDeleteDraft(),
        });
        showToast('Failed to delete draft. Restored.', 'error');
      }
    } catch {
      // 3. Rollback on network failure
      setDrafts(previousDrafts);
      setSelectedDraft(previousDraft);
      setDraftMutationError({
        draftId: targetDraftId,
        message: 'Network error deleting draft. Restored to your drafts.',
        retry: () => handleDeleteDraft(),
      });
      showToast('Error deleting draft. Restored.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  // Unsaved changes guard: warn user before navigating or closing tab if draft has unsaved content
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (draftAutosave.hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [draftAutosave.hasUnsavedChanges]);

  const handleStatusChange = async (newStatus: DraftStatus) => {
    if (!selectedDraft || syncingDraftId) return;
    const targetDraftId = selectedDraft.id;
    const previousDraft = { ...selectedDraft };
    const previousDrafts = [...drafts];

    // 1. Optimistic status update
    const optimisticDraft: IssueDraft = {
      ...selectedDraft,
      status: newStatus,
    };
    setSelectedDraft(optimisticDraft);
    setEditStatus(newStatus);
    setDrafts((prev) => prev.map((d) => (d.id === targetDraftId ? optimisticDraft : d)));
    setSyncingDraftId(targetDraftId);
    setDraftMutationError(null);

    try {
      const res = await fetch('/api/drafts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId: targetDraftId,
          status: newStatus,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const serverDraft: IssueDraft = data.draft;
        setSelectedDraft(serverDraft);
        setEditStatus(serverDraft.status || 'draft');
        setDrafts((prev) => prev.map((d) => (d.id === serverDraft.id ? serverDraft : d)));
        showToast(`Draft status updated to "${newStatus}"`, 'info');
      } else {
        // Rollback
        setSelectedDraft(previousDraft);
        setEditStatus(previousDraft.status || 'draft');
        setDrafts(previousDrafts);
        setDraftMutationError({
          draftId: targetDraftId,
          message: `Failed to update status to "${newStatus}". Reverted.`,
          retry: () => handleStatusChange(newStatus),
        });
        showToast('Failed to update status. Reverted.', 'error');
      }
    } catch {
      // Rollback
      setSelectedDraft(previousDraft);
      setEditStatus(previousDraft.status || 'draft');
      setDrafts(previousDrafts);
      setDraftMutationError({
        draftId: targetDraftId,
        message: `Network error updating status to "${newStatus}". Reverted.`,
        retry: () => handleStatusChange(newStatus),
      });
      showToast('Error updating draft status. Reverted.', 'error');
    } finally {
      setSyncingDraftId(null);
    }
  };

  const handleApproveDraft = async () => {
    if (!selectedDraft || reviewing) return;
    const targetDraftId = selectedDraft.id;
    const previousDraft = { ...selectedDraft };
    const previousDrafts = [...drafts];

    // 1. Optimistically set approved state immediately
    const optimisticDraft: IssueDraft = {
      ...selectedDraft,
      status: 'approved',
      reviewDecision: 'approved',
      reviewedAt: new Date().toISOString(),
    };
    setSelectedDraft(optimisticDraft);
    setEditStatus('approved');
    setDrafts((prev) => prev.map((d) => (d.id === targetDraftId ? optimisticDraft : d)));
    setSyncingDraftId(targetDraftId);
    setDraftMutationError(null);
    setReviewing(true);

    try {
      const res = await fetch('/api/drafts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId: targetDraftId,
          action: 'approve',
        }),
      });
      if (res.ok) {
        // 2. Reconcile with server-confirmed draft
        const data = await res.json();
        const serverDraft: IssueDraft = data.draft;
        setSelectedDraft(serverDraft);
        setEditStatus(serverDraft.status || 'draft');
        setDrafts((prev) => prev.map((d) => (d.id === serverDraft.id ? serverDraft : d)));
        showToast('Draft approved! Ready for manual copy or download.', 'success');
      } else {
        // 3. Rollback on failure
        const data = await res.json().catch(() => ({}));
        setSelectedDraft(previousDraft);
        setEditStatus(previousDraft.status || 'draft');
        setDrafts(previousDrafts);
        setDraftMutationError({
          draftId: targetDraftId,
          message: data.error || 'Failed to approve draft on server. Reverted.',
          retry: () => handleApproveDraft(),
        });
        showToast('Failed to approve draft. Reverted.', 'error');
      }
    } catch {
      // 3. Rollback on network failure
      setSelectedDraft(previousDraft);
      setEditStatus(previousDraft.status || 'draft');
      setDrafts(previousDrafts);
      setDraftMutationError({
        draftId: targetDraftId,
        message: 'Network error recording approval on server. Reverted.',
        retry: () => handleApproveDraft(),
      });
      showToast('Error approving draft. Reverted.', 'error');
    } finally {
      setReviewing(false);
      setSyncingDraftId(null);
    }
  };

  const handleRejectDraft = async () => {
    if (!selectedDraft || reviewing) return;
    const targetDraftId = selectedDraft.id;
    const previousDraft = { ...selectedDraft };
    const previousDrafts = [...drafts];
    const reasonText = rejectionReason.trim() || undefined;

    // 1. Optimistically set rejected state immediately and dismiss modal
    const optimisticDraft: IssueDraft = {
      ...selectedDraft,
      status: 'rejected',
      reviewDecision: 'rejected',
      rejectedReason: reasonText,
      reviewedAt: new Date().toISOString(),
    };
    setSelectedDraft(optimisticDraft);
    setEditStatus('rejected');
    setDrafts((prev) => prev.map((d) => (d.id === targetDraftId ? optimisticDraft : d)));
    setShowRejectModal(false);
    setSyncingDraftId(targetDraftId);
    setDraftMutationError(null);
    setReviewing(true);

    try {
      const res = await fetch('/api/drafts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId: targetDraftId,
          action: 'reject',
          rejectedReason: reasonText,
        }),
      });
      if (res.ok) {
        // 2. Reconcile with server-confirmed draft
        const data = await res.json();
        const serverDraft: IssueDraft = data.draft;
        setSelectedDraft(serverDraft);
        setEditStatus(serverDraft.status || 'draft');
        setDrafts((prev) => prev.map((d) => (d.id === serverDraft.id ? serverDraft : d)));
        setRejectionReason('');
        showToast('Draft rejected and preserved in audit log.', 'info');
      } else {
        // 3. Rollback on failure
        const data = await res.json().catch(() => ({}));
        setSelectedDraft(previousDraft);
        setEditStatus(previousDraft.status || 'draft');
        setDrafts(previousDrafts);
        setDraftMutationError({
          draftId: targetDraftId,
          message: data.error || 'Failed to reject draft on server. Reverted.',
          retry: () => handleRejectDraft(),
        });
        showToast('Failed to reject draft. Reverted.', 'error');
      }
    } catch {
      // 3. Rollback on network failure
      setSelectedDraft(previousDraft);
      setEditStatus(previousDraft.status || 'draft');
      setDrafts(previousDrafts);
      setDraftMutationError({
        draftId: targetDraftId,
        message: 'Network error recording rejection on server. Reverted.',
        retry: () => handleRejectDraft(),
      });
      showToast('Error rejecting draft. Reverted.', 'error');
    } finally {
      setReviewing(false);
      setSyncingDraftId(null);
    }
  };

  const handleCopy = () => {
    if (!selectedDraft) return;
    // Defensive re-redaction before clipboard copy
    const safeContent = redactSecrets(selectedDraft.markdownContent);
    navigator.clipboard.writeText(safeContent);
    setCopied(true);
    showToast('Markdown draft copied to clipboard!', 'success');
    setTimeout(() => setCopied(false), 2500);

    if (selectedDraft.status !== 'exported') {
      handleStatusChange('exported');
    }
  };

  const handleDownload = () => {
    if (!selectedDraft) return;
    // Defensive re-redaction before export
    const safeContent = redactSecrets(selectedDraft.markdownContent);
    const blob = new Blob([safeContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selectedDraft.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Draft exported as .md file', 'success');

    if (selectedDraft.status !== 'exported') {
      handleStatusChange('exported');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6 bg-transparent text-textPrimary">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-borderDark">
        <div>
          <h1 className="text-2xl font-heading font-bold text-textPrimary flex items-center gap-2">
            <span>Maintainer Issue Drafts</span>
            {activeScan && (
              <span className="text-xs font-mono font-medium text-lemonChiffon bg-coffeeBean px-3 py-1 rounded-full border border-lemonChiffon/20">
                {activeScan.repoName}
              </span>
            )}
          </h1>
          <p className="text-xs text-textMuted mt-1">
            Polite, reviewable issue drafts engineered for open-source maintainers. Includes problem description, evidence, impact, test plans, and acceptance criteria.
          </p>
        </div>

        {/* Global Safety Notice: Clearly labeled Maintainer review required & Never auto-published */}
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-coffeeBean border border-electricTangerine/40 text-xs text-lemonChiffon">
          <ShieldAlert className="w-4 h-4 text-electricTangerine" />
          <span className="font-semibold">Maintainer review required • Never auto-published</span>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20">
          <Loader2 className="w-8 h-8 text-lemonChiffon animate-spin mx-auto mb-2" />
          <p className="text-xs text-textMuted">Loading issue drafts...</p>
        </div>
      ) : drafts.length > 0 && selectedDraft ? (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          {/* Drafts Sidebar List (Col 1) */}
          <div className="space-y-3 lg:col-span-1">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-heading font-semibold text-textMuted uppercase tracking-wider">
                Saved Drafts ({drafts.length})
              </h3>
              <LastUpdatedBadge
                timestamp={drafts[0]?.updatedAt || drafts[0]?.createdAt}
                onRefresh={fetchDrafts}
                refreshing={loading}
              />
            </div>
            <div className="space-y-2.5 max-h-[700px] overflow-y-auto no-scrollbar pr-1">
              {drafts.map((d) => {
                const isSelected = selectedDraft.id === d.id;
                return (
                  <button
                    key={d.id}
                    onClick={() => {
                      if (selectedDraft.id === d.id) return;
                      if (draftAutosave.hasUnsavedChanges) {
                        setPendingDraftToSwitch(d);
                        setShowDiscardUnsavedConfirm(true);
                      } else {
                        setSelectedDraft(d);
                      }
                    }}
                    className={`w-full min-h-[44px] p-4 rounded-xl text-left border transition-all press-spring touch-manipulation ${
                      isSelected
                        ? 'bg-coffeeBean border-lemonChiffon shadow-md'
                        : 'glass-panel hover:border-borderDark/80'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] text-textMuted mb-1">
                      <span
                        className={`font-mono px-2 py-0.5 rounded-full text-[10px] border ${
                          d.generatedBy === 'gemini'
                            ? 'bg-electricTangerine/15 text-electricTangerine border-electricTangerine/30'
                            : 'bg-coffeeBean text-lemonChiffon border-lemonChiffon/30'
                        }`}
                      >
                        {d.generatedBy === 'gemini' ? '✦ GEMMA' : 'DETERMINISTIC'}
                      </span>
                      {syncingDraftId === d.id ? (
                        <span className="inline-flex items-center gap-1 text-[9px] text-lemonChiffon font-mono font-semibold">
                          <Loader2 className="w-2.5 h-2.5 animate-spin" /> Syncing
                        </span>
                      ) : (
                        <span className="capitalize px-1.5 py-0.5 rounded text-[9px] bg-black border border-borderDark text-textMuted">
                          {d.status || 'draft'}
                        </span>
                      )}
                    </div>
                    <h4 className="text-xs font-heading font-semibold text-textPrimary line-clamp-2">{d.title}</h4>
                    <div className="mt-1 flex items-center justify-between text-[10px] text-textMuted/70">
                      <span>{d.repoName}</span>
                      <span>{new Date(d.createdAt).toLocaleDateString()}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Draft Workspace & Surface (Col 2, 3, 4) */}
          <div className="lg:col-span-3 space-y-4">
            {/* Inline Optimistic Error & Retry Banner */}
            {draftMutationError && draftMutationError.draftId === selectedDraft.id && (
              <div className="p-3.5 rounded-2xl bg-rosewood/25 border border-rosewood/60 text-xs text-sustainableLinen flex items-center justify-between gap-3 animate-fade-in shadow-md">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{draftMutationError.message}</span>
                </div>
                <button
                  type="button"
                  onClick={draftMutationError.retry}
                  className="px-3.5 py-1 rounded-full bg-lemonChiffon text-black text-xs font-semibold hover:bg-sustainableLinen transition-colors press-spring shrink-0"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Human Review & Approval Gateway Panel */}
            <div className="liquid-glass p-5 rounded-2xl border border-lemonChiffon/20 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="p-2 rounded-xl bg-coffeeBean border border-lemonChiffon/30 text-lemonChiffon">
                    <ShieldCheck className="w-5 h-5 text-electricTangerine" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-heading font-bold text-textPrimary">
                        Human Review & Approval Gateway
                      </h3>
                      {selectedDraft.status === 'approved' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-lemonChiffon text-black">
                          <CheckCircle2 className="w-3 h-3" /> Approved by Contributor
                        </span>
                      ) : selectedDraft.status === 'rejected' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rosewood/35 text-red-200 border border-rosewood/70">
                          <XCircle className="w-3 h-3" /> Rejected by Contributor
                        </span>
                      ) : selectedDraft.status === 'exported' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-botticelli text-black">
                          <Check className="w-3 h-3" /> Exported
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-coffeeBean text-lemonChiffon border border-lemonChiffon/30 font-mono">
                          <Clock className="w-3 h-3 text-electricTangerine" /> Awaiting Contributor Review
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-textMuted mt-0.5">
                      Target Repository: <strong className="text-sustainableLinen font-mono">{selectedDraft.repoName}</strong>
                      {selectedDraft.findingId && (
                        <span> • Finding: <span className="font-mono text-lemonChiffon">#{selectedDraft.findingId}</span></span>
                      )}
                      {selectedDraft.reviewedAt && (
                        <span> • Reviewed {new Date(selectedDraft.reviewedAt).toLocaleDateString()}</span>
                      )}
                      {selectedDraft.storageTier && (
                        <span> • Storage: <span className="font-mono text-lemonChiffon">{selectedDraft.storageTier === 'durable_cloud' ? 'Durable Cloud (Postgres)' : 'Local Session'}</span></span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Human Approval Action Controls */}
                <div className="flex flex-wrap items-center gap-2">
                  {selectedDraft.status !== 'approved' && selectedDraft.status !== 'exported' ? (
                    <>
                      <button
                        type="button"
                        onClick={handleApproveDraft}
                        disabled={reviewing}
                        className="min-h-[44px] px-4 py-2 rounded-full bg-electricTangerine hover:bg-electricTangerine-hover text-black font-bold text-xs flex items-center gap-1.5 transition-all shadow-glow-tangerine active:scale-95 disabled:opacity-50 press-spring touch-manipulation"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{reviewing ? 'Approving...' : 'Approve & Unlock Export'}</span>
                      </button>

                      {!showRejectModal && (
                        <button
                          type="button"
                          onClick={() => setShowRejectModal(true)}
                          disabled={reviewing}
                          className="min-h-[44px] px-3.5 py-2 rounded-full bg-black/50 hover:bg-rosewood/25 text-red-300 hover:text-red-200 border border-rosewood/60 font-semibold text-xs flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50 press-spring touch-manipulation"
                        >
                          <XCircle className="w-4 h-4" />
                          <span>Reject Draft</span>
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleCopy}
                        className="min-h-[44px] px-4 py-2 rounded-full bg-lemonChiffon hover:bg-sustainableLinen text-black font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm active:scale-95 press-spring touch-manipulation"
                      >
                        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copied ? 'Copied Markdown' : 'Copy Markdown'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleDownload}
                        className="min-h-[44px] px-4 py-2 rounded-full bg-black hover:bg-coffeeBean text-lemonChiffon border border-lemonChiffon/30 font-semibold text-xs flex items-center gap-1.5 transition-all active:scale-95 press-spring touch-manipulation"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download .md</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStatusChange('awaiting_review')}
                        className="min-h-[44px] px-3 py-1.5 text-[11px] text-textMuted hover:text-textPrimary transition-colors underline press-spring touch-manipulation"
                      >
                        Re-evaluate
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Reject Reason Form Inline */}
              {showRejectModal && (
                <div className="p-4 rounded-xl bg-black/80 border border-rosewood/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-red-300 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" /> Record Rejection Reason
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowRejectModal(false)}
                      className="text-xs text-textMuted hover:text-textPrimary"
                    >
                      Cancel
                    </button>
                  </div>
                  <input
                    type="text"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Reason for rejection (e.g. out of scope, duplicate finding, maintainer preferred format)..."
                    className="w-full min-h-[40px] px-3 py-2 rounded-lg bg-black/60 border border-borderDark text-xs text-sustainableLinen placeholder:text-textTertiary focus:border-rosewood focus:outline-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowRejectModal(false)}
                      className="px-3 py-1.5 rounded-lg text-xs text-textMuted hover:text-textPrimary"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleRejectDraft}
                      disabled={reviewing}
                      className="px-4 py-1.5 rounded-lg bg-rosewood text-cotton text-xs font-semibold hover:bg-rosewood/80 transition-all disabled:opacity-50"
                    >
                      {reviewing ? 'Recording...' : 'Confirm Rejection'}
                    </button>
                  </div>
                </div>
              )}

              {/* If Rejected: Show Rejection Audit Box */}
              {selectedDraft.status === 'rejected' && selectedDraft.rejectedReason && (
                <div className="p-3 rounded-xl bg-rosewood/25 border border-rosewood/60 text-xs text-red-200 flex items-start gap-2">
                  <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <strong>Rejection Audit Record:</strong> {selectedDraft.rejectedReason}
                  </div>
                </div>
              )}

              {/* Invariant & Publishing Sovereignty Disclaimers */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-2 text-[11px] text-textMuted/80 border-t border-platinumSilver/10">
                <div className="flex items-start gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-lemonChiffon shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-lemonChiffon">Maintainer review required:</strong> Code verifies. AI explains. Human approves. You must inspect all acceptance criteria.
                  </span>
                </div>
                <div className="flex items-start gap-1.5">
                  <Info className="w-3.5 h-3.5 text-botticelli shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-botticelli">Zero Auto-Publish:</strong> ContribLens never publishes issues, never opens PRs, and never pushes code. You maintain 100% human approval sovereignty.
                  </span>
                </div>
              </div>
            </div>

            {/* Action Bar */}
            <div className="glass-panel p-4 rounded-2xl border border-borderDark flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                {/* Badges: Evidence-linked, AI-validated / Fallback, and Maintainer Review Required */}
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  {selectedDraft.findingId && (
                    <Link
                      href={`/app/findings/${selectedDraft.findingId}`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium bg-coffeeBean hover:bg-black text-lemonChiffon border border-lemonChiffon/30 transition-colors"
                      title="Navigate to verified evidence in Findings view"
                    >
                      <ExternalLink className="w-3 h-3 text-electricTangerine" />
                      <span>Evidence-linked: #{selectedDraft.findingId}</span>
                    </Link>
                  )}

                  <EngineBadge
                    engine={selectedDraft.generatedBy === 'gemini' ? 'gemma' : (selectedDraft.generatedBy || 'deterministic')}
                    fallback={selectedDraft.fallback ?? (selectedDraft.generatedBy === 'deterministic' || !selectedDraft.generatedBy)}
                    fallbackReason={selectedDraft.fallbackReason || 'Deterministic explanation — AI unavailable'}
                  />

                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rosewood/30 border border-rosewood/60 text-[10px] font-semibold text-red-200">
                    <ShieldAlert className="w-3 h-3 text-red-300" />
                    <span>Maintainer review required</span>
                  </span>
                </div>

                <h2 className="text-base font-heading font-bold text-textPrimary mt-0.5">{selectedDraft.title}</h2>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Lifecycle Stepper: draft → reviewed → exported */}
                <div className="bg-black p-1 rounded-full border border-borderDark flex items-center text-xs font-mono overflow-x-auto no-scrollbar">
                  <span className="text-[10px] text-textMuted px-2 font-sans uppercase">Lifecycle:</span>
                  {(['draft', 'reviewed', 'exported'] as const).map((st, idx) => {
                    const isCurrent = (selectedDraft.status || 'draft') === st;
                    return (
                      <button
                        key={st}
                        onClick={() => handleStatusChange(st)}
                        className={`min-h-[44px] px-3.5 py-1.5 rounded-full capitalize text-[11px] font-semibold flex items-center gap-1 transition-all press-spring touch-manipulation shrink-0 ${
                          isCurrent
                            ? st === 'exported'
                              ? 'bg-botticelli text-black'
                              : st === 'reviewed'
                              ? 'bg-lemonChiffon text-black'
                              : 'bg-coffeeBean text-lemonChiffon border border-lemonChiffon/30'
                            : 'text-textMuted hover:text-textPrimary'
                        }`}
                        title={`Set lifecycle to ${st}`}
                      >
                        <span>{idx + 1}.</span>
                        <span>{st}</span>
                      </button>
                    );
                  })}
                </div>

                {/* View Mode Toggle: Preview / Edit / Markdown */}
                <div className="bg-black p-1 rounded-full border border-borderDark flex items-center text-xs overflow-x-auto no-scrollbar">
                  <button
                    onClick={() => setViewMode('preview')}
                    className={`min-h-[44px] px-3.5 py-1.5 rounded-full flex items-center gap-1 font-medium text-xs press-spring touch-manipulation shrink-0 ${
                      viewMode === 'preview' ? 'bg-coffeeBean text-lemonChiffon' : 'text-textMuted'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" /> Preview
                  </button>
                  <button
                    onClick={() => setViewMode('edit')}
                    className={`min-h-[44px] px-3.5 py-1.5 rounded-full flex items-center gap-1 font-medium text-xs press-spring touch-manipulation shrink-0 ${
                      viewMode === 'edit' ? 'bg-coffeeBean text-lemonChiffon' : 'text-textMuted'
                    }`}
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button
                    onClick={() => setViewMode('raw')}
                    className={`min-h-[44px] px-3.5 py-1.5 rounded-full flex items-center gap-1 font-medium text-xs press-spring touch-manipulation shrink-0 ${
                      viewMode === 'raw' ? 'bg-coffeeBean text-lemonChiffon' : 'text-textMuted'
                    }`}
                  >
                    <Code2 className="w-3.5 h-3.5" /> Markdown
                  </button>
                </div>

                {/* Regenerate Button (Gamma 4 server-side evidence load) */}
                <button
                  onClick={handleRegenerateDraft}
                  disabled={regenerating}
                  className="min-h-[44px] px-4 py-2 rounded-full bg-black hover:bg-coffeeBean text-lemonChiffon text-xs font-semibold flex items-center gap-1.5 transition-colors border border-lemonChiffon/30 disabled:opacity-50 press-spring touch-manipulation"
                  title="Regenerate issue draft via Gamma 4 with fresh server-side evidence"
                >
                  <RotateCw className={`w-3.5 h-3.5 ${regenerating ? 'animate-spin' : ''}`} />
                  <span>{regenerating ? 'Regenerating...' : 'Regenerate'}</span>
                </button>

                {/* Copy Action */}
                <button
                  onClick={handleCopy}
                  className="min-h-[44px] px-4 py-2 rounded-full bg-blackHole hover:bg-black text-textPrimary text-xs font-semibold flex items-center gap-1.5 transition-colors border border-borderDark press-spring touch-manipulation"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-lemonChiffon" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied!' : 'Copy MD'}</span>
                </button>

                {/* Download / Export Action */}
                <button
                  onClick={handleDownload}
                  className="min-h-[44px] px-4 py-2 rounded-full bg-lemonChiffon hover:bg-sustainableLinen text-black text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm press-spring touch-manipulation"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export .md</span>
                </button>

                {/* Delete Draft Action (With Accessible Confirmation Dialog) */}
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={deleting}
                  className="min-w-[44px] min-h-[44px] p-2.5 rounded-full bg-black/50 hover:bg-rosewood/30 text-red-300 hover:text-red-200 border border-rosewood/60 transition-colors flex items-center justify-center press-spring touch-manipulation disabled:opacity-40"
                  title="Delete Draft"
                  aria-label="Delete Draft"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* View Mode 1: Edit Form */}
            {viewMode === 'edit' && (
              <div className="glass-panel p-6 rounded-2xl border border-borderDark space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-borderDark">
                  <span className="text-xs font-bold text-lemonChiffon flex items-center gap-1.5">
                    <Edit3 className="w-4 h-4" /> Edit Maintainer Issue Draft
                  </span>
                  <div className="flex flex-wrap items-center gap-3">
                    <AutosaveStatusBadge
                      status={draftAutosave.status}
                      lastSavedAt={draftAutosave.lastSavedAt}
                      errorMessage={draftAutosave.errorMessage}
                      onRetry={draftAutosave.retry}
                      isAuthenticated={Boolean(user)}
                    />
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value as any)}
                      className="px-3 py-1 bg-black border border-borderDark rounded-lg text-xs text-textPrimary focus:outline-none focus:border-lemonChiffon"
                    >
                      <option value="draft">Status: Draft</option>
                      <option value="reviewed">Status: Reviewed</option>
                      <option value="exported">Status: Exported</option>
                    </select>
                    <button
                      onClick={handleSaveDraft}
                      disabled={saving || syncingDraftId !== null}
                      className="px-4 py-1.5 bg-lemonChiffon hover:bg-sustainableLinen text-black text-xs font-bold rounded-full flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      <span>{saving ? 'Saving...' : 'Save Draft'}</span>
                    </button>
                  </div>
                </div>

                {/* Local Recovery Warning */}
                {draftAutosave.recovery.hasRecovery && (
                  <div className="p-3.5 rounded-xl bg-lemonChiffon/10 border border-lemonChiffon/30 flex flex-wrap items-center justify-between gap-3 text-xs text-lemonChiffon animate-fade-in">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-electricTangerine shrink-0" />
                      <span>
                        Restored unsaved local draft edits from {draftAutosave.recovery.recoveredAt}.
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={draftAutosave.recovery.discard}
                        className="px-2.5 py-1 text-xs text-textMuted hover:text-white underline transition-colors"
                      >
                        Discard
                      </button>
                      <button
                        type="button"
                        onClick={draftAutosave.recovery.restore}
                        className="px-3 py-1 rounded-full bg-lemonChiffon text-black text-xs font-semibold hover:bg-sustainableLinen transition-colors"
                      >
                        Keep Local
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <label htmlFor="draft-edit-title" className="block text-xs font-medium text-textMuted mb-1">
                      Issue Title
                    </label>
                    <input
                      id="draft-edit-title"
                      name="title"
                      type="text"
                      value={editTitle}
                      onChange={(e) => {
                        setEditTitle(e.target.value);
                        draftValidation.setFieldValue('title', e.target.value);
                      }}
                      onBlur={() => {
                        draftAutosave.handleBlur();
                        draftValidation.handleBlur('title');
                      }}
                      aria-invalid={Boolean(draftValidation.errors.title)}
                      aria-describedby={draftValidation.errors.title ? 'draft-edit-title-error' : undefined}
                      className={`w-full px-4 py-2.5 bg-black border rounded-xl text-xs sm:text-sm text-textPrimary focus:outline-none transition-colors ${
                        draftValidation.errors.title
                          ? 'border-rosewood/80 focus:border-red-400'
                          : 'border-borderDark focus:border-lemonChiffon'
                      }`}
                    />
                    <FormFieldError id="draft-edit-title-error" error={draftValidation.errors.title} />
                  </div>

                  <div>
                    <label htmlFor="draft-edit-labels" className="block text-xs font-medium text-textMuted mb-1 flex items-center gap-1">
                      <Tag className="w-3 h-3 text-electricTangerine" />
                      <span>Suggested Labels (comma separated)</span>
                    </label>
                    <input
                      id="draft-edit-labels"
                      name="labels"
                      type="text"
                      value={editLabels}
                      onChange={(e) => {
                        setEditLabels(e.target.value);
                        draftValidation.setFieldValue('labels', e.target.value);
                      }}
                      onBlur={() => {
                        draftAutosave.handleBlur();
                        draftValidation.handleBlur('labels');
                      }}
                      aria-invalid={Boolean(draftValidation.errors.labels)}
                      aria-describedby={draftValidation.errors.labels ? 'draft-edit-labels-error' : undefined}
                      placeholder="e.g. security, good-first-issue, beginner"
                      className={`w-full px-4 py-2 bg-black border rounded-xl text-xs text-textPrimary focus:outline-none transition-colors ${
                        draftValidation.errors.labels
                          ? 'border-rosewood/80 focus:border-red-400'
                          : 'border-borderDark focus:border-lemonChiffon'
                      }`}
                    />
                    <FormFieldError id="draft-edit-labels-error" error={draftValidation.errors.labels} />
                  </div>

                  <div>
                    <label htmlFor="draft-edit-body" className="block text-xs font-medium text-textMuted mb-1">
                      Markdown Body
                    </label>
                    <textarea
                      id="draft-edit-body"
                      name="body"
                      value={editBody}
                      onChange={(e) => {
                        setEditBody(e.target.value);
                        draftValidation.setFieldValue('body', e.target.value);
                      }}
                      onBlur={() => {
                        draftAutosave.handleBlur();
                        draftValidation.handleBlur('body');
                      }}
                      aria-invalid={Boolean(draftValidation.errors.body)}
                      aria-describedby={draftValidation.errors.body ? 'draft-edit-body-error' : undefined}
                      rows={18}
                      className={`w-full p-4 bg-black border rounded-xl font-mono text-xs text-lemonChiffon/90 focus:outline-none leading-relaxed transition-colors ${
                        draftValidation.errors.body
                          ? 'border-rosewood/80 focus:border-red-400'
                          : 'border-borderDark focus:border-lemonChiffon'
                      }`}
                    />
                    <FormFieldError id="draft-edit-body-error" error={draftValidation.errors.body} />
                  </div>
                </div>
              </div>
            )}

            {/* View Mode 2: Sustainable Linen Cream Preview */}
            {viewMode === 'preview' && (
              <div className="p-4 sm:p-8 md:p-10 rounded-2xl bg-sustainableLinen text-[#1a1614] shadow-2xl border border-sustainableLinen/80 space-y-6 overflow-hidden">
                {/* Surface Header with Badges */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#e2d8c7] text-xs text-[#665e57]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-[#4d4036] bg-[#ebe3d7] px-2.5 py-1 rounded-md">
                      GitHub Issue Preview
                    </span>
                    {selectedDraft.findingId && (
                      <Link
                        href={`/app/findings/${selectedDraft.findingId}`}
                        className="inline-flex items-center gap-1 text-[11px] font-mono font-medium text-[#7d2e1b] bg-[#f2e6dc] hover:bg-[#e8d7c9] px-2.5 py-1 rounded-md transition-colors"
                      >
                        <ExternalLink className="w-3 h-3 text-[#943828]" />
                        <span>Evidence #{selectedDraft.findingId}</span>
                      </Link>
                    )}
                    <span className="text-[11px] font-mono text-[#332b26] bg-[#ebe3d7] px-2.5 py-1 rounded-md">
                      {selectedDraft.generatedBy === 'gemini' ? '✦ Gemma 4 Grounded' : 'Deterministic Explanation'}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {selectedDraft.labels && selectedDraft.labels.length > 0 && (
                      <div className="flex items-center gap-1 mr-2">
                        {selectedDraft.labels.map((lbl) => (
                          <span
                            key={lbl}
                            className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-[#dfd4c4] text-[#4d4036]"
                          >
                            {lbl}
                          </span>
                        ))}
                      </div>
                    )}
                    <span className="font-semibold text-rosewood bg-[#f7e6d8] border border-rosewood/30 px-2.5 py-0.5 rounded-full text-[11px] flex items-center gap-1">
                      <ShieldAlert className="w-3 h-3 text-rosewood" />
                      Maintainer review required • Never auto-published
                    </span>
                  </div>
                </div>

                {/* Markdown Rendered Content */}
                <div className="space-y-6 text-xs sm:text-sm leading-relaxed">
                  {selectedDraft.markdownContent.split('\n\n').map((block, idx) => {
                    const trimmed = block.trim();

                    // Main Title
                    if (trimmed.startsWith('# ')) {
                      return (
                        <h1
                          key={idx}
                          className="text-2xl font-bold text-[#141210] border-b border-[#e2d8c7] pb-3 tracking-tight"
                        >
                          {trimmed.replace('# ', '')}
                        </h1>
                      );
                    }

                    // Section Headings (1-7)
                    if (trimmed.startsWith('### ')) {
                      const isReviewNote = trimmed.includes('Maintainer Review Note');
                      return (
                        <h3
                          key={idx}
                          className={`text-base font-bold mt-6 mb-2 flex items-center gap-2 ${
                            isReviewNote ? 'text-rosewood border-t border-[#e2d8c7] pt-4' : 'text-[#3d1810]'
                          }`}
                        >
                          {trimmed.replace('### ', '')}
                        </h3>
                      );
                    }

                    // Maintainer Notice Blockquote
                    if (trimmed.startsWith('> ')) {
                      return (
                        <div
                          key={idx}
                          className="p-4 rounded-xl bg-[#ede3d3] border-l-4 border-rosewood text-[#3d2f25] text-xs space-y-1 my-3 shadow-inner"
                        >
                          {trimmed.split('\n').map((line, lIdx) => (
                            <p key={lIdx} className="leading-relaxed">
                              {line.replace(/^>\s?/, '')}
                            </p>
                          ))}
                        </div>
                      );
                    }

                    // Code Blocks (Evidence)
                    if (trimmed.startsWith('```')) {
                      return (
                        <pre
                          key={idx}
                          className="p-4 bg-[#231e1a] text-lemonChiffon rounded-xl font-mono text-xs overflow-x-auto whitespace-pre-wrap break-all border border-[#3b332c] shadow-md"
                        >
                          {trimmed.replace(/```[a-z]*\n?/g, '').replace(/```/g, '')}
                        </pre>
                      );
                    }

                    // Bullet / Checklist items
                    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                      return (
                        <ul key={idx} className="space-y-2 pl-2 text-[#332b26]">
                          {trimmed.split('\n').map((li, liIdx) => {
                            const isChecklist = li.includes('- [ ]') || li.includes('- [x]');
                            const isChecked = li.includes('- [x]');
                            const text = li.replace(/^[*-] (\[[ x]\] )?/, '');

                            return (
                              <li key={liIdx} className="flex items-start gap-2">
                                {isChecklist ? (
                                  <span
                                    className={`mt-0.5 inline-flex items-center justify-center w-4 h-4 rounded border ${
                                      isChecked
                                        ? 'bg-rosewood text-cotton border-rosewood'
                                        : 'border-[#8c7e73] bg-[#f4ece0]'
                                    }`}
                                  >
                                    {isChecked && <Check className="w-3 h-3 text-cotton" />}
                                  </span>
                                ) : (
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#8c7e73] mt-2 shrink-0" />
                                )}
                                <span>{text}</span>
                              </li>
                            );
                          })}
                        </ul>
                      );
                    }

                    // Footer divider
                    if (trimmed === '---') {
                      return <hr key={idx} className="border-[#e2d8c7] my-4" />;
                    }

                    // Standard Paragraph
                    return (
                      <p key={idx} className="text-[#332b26]">
                        {trimmed}
                      </p>
                    );
                  })}
                </div>
              </div>
            )}

            {/* View Mode 3: Raw Markdown */}
            {viewMode === 'raw' && (
              <div className="glass-panel p-4 sm:p-6 rounded-2xl border border-borderDark font-mono text-xs overflow-x-auto text-lemonChiffon/90 bg-black leading-relaxed">
                <pre className="whitespace-pre-wrap break-all select-text">{selectedDraft.markdownContent}</pre>
              </div>
            )}

            {/* Strict Safe Disclosure Policy Card */}
            <div className="p-4 rounded-xl bg-coffeeBean/70 border border-electricTangerine/30 flex items-start gap-3 text-xs text-lemonChiffon">
              <ShieldAlert className="w-5 h-5 text-electricTangerine shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-lemonChiffon block">ContribLens Safe Disclosure Policy</span>
                <p className="text-textMuted mt-0.5">
                  ContribLens never connects directly to GitHub issue or pull request APIs. Maintainers must review and publish issue drafts manually. Secrets, credentials, and sensitive private security disclosures are strictly blocked from public issue generation.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : errorType ? (
        <ErrorState
          type={errorType}
          title={
            errorType === 'session_expired'
              ? 'Session Expired'
              : errorType === 'forbidden'
              ? 'Access Denied'
              : errorType === 'network_offline'
              ? 'Connection Lost'
              : errorType === 'not_found'
              ? 'Drafts Not Found'
              : 'Unable to Load Issue Drafts'
          }
          message={fetchError || 'An error occurred while loading issue drafts.'}
          onRetry={errorType === 'not_found' ? undefined : fetchDrafts}
          retrying={loading}
          secondaryAction={
            errorType === 'not_found'
              ? {
                  label: 'Back to Dashboard',
                  href: '/app/dashboard',
                }
              : undefined
          }
        />
      ) : (
        /* Empty State */
        <EmptyState
          icon={FileText}
          title="No Issue Drafts Available"
          description="Generate your first maintainer-reviewable issue draft from verified findings in the Contributions + Stack view."
          action={{
            label: 'Browse Verified Findings →',
            href: '/app/findings',
          }}
          secondaryHint={
            <div className="flex flex-wrap justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => router.push('/app/contributions')}
                className="px-3.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-lemonChiffon border border-lemonChiffon/20 font-mono text-xs inline-flex items-center press-spring touch-manipulation"
              >
                Browse Contributions
              </button>
              <button
                type="button"
                onClick={() => router.push('/app/scan')}
                className="px-3.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-sustainableLinen border border-platinumSilver/20 font-mono text-xs inline-flex items-center press-spring touch-manipulation"
              >
                Scan Repository
              </button>
            </div>
          }
        />
      )}

      {/* Confirmation Dialog 1: Delete Draft */}
      {selectedDraft && (
        <ConfirmDialog
          isOpen={showDeleteConfirm}
          title="Delete Issue Draft?"
          description={`Are you sure you want to delete the issue draft for ${selectedDraft.repoName}?`}
          consequenceWarning="This permanently deletes this draft record from both local cache and database storage. It cannot be recovered."
          confirmLabel="Delete Draft"
          cancelLabel="Keep Draft"
          isDestructive={true}
          isBusy={deleting}
          onConfirm={handleDeleteDraft}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      {/* Confirmation Dialog 2: Unsaved Changes Guard before Switching Drafts */}
      <ConfirmDialog
        isOpen={showDiscardUnsavedConfirm}
        title="Discard Unsaved Draft Edits?"
        description={`You have unsaved changes in your current issue draft. Switching drafts now will discard your unsaved edits.`}
        consequenceWarning="Unsaved changes will be discarded and cannot be recovered."
        confirmLabel="Discard & Switch"
        cancelLabel="Keep Editing"
        isDestructive={true}
        onConfirm={() => {
          if (pendingDraftToSwitch) {
            setSelectedDraft(pendingDraftToSwitch);
            setPendingDraftToSwitch(null);
          }
          setShowDiscardUnsavedConfirm(false);
        }}
        onCancel={() => {
          setPendingDraftToSwitch(null);
          setShowDiscardUnsavedConfirm(false);
        }}
      />
    </div>
  );
}

export default function IssueDraftsPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-7xl mx-auto p-8 text-center text-textMuted">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-lemonChiffon mb-2" />
          <p className="text-xs">Loading Issue Drafts Workspace...</p>
        </div>
      }
    >
      <DraftsContent />
    </Suspense>
  );
}
