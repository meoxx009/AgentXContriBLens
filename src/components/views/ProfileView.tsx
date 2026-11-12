'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '@/components/AppContext';
import {
  User as UserIcon,
  Download,
  Trash2,
  LogOut,
  Shield,
  Sliders,
  ChevronDown,
  Lock,
  AlertTriangle,
  Activity,
  Clock,
  ExternalLink,
  HelpCircle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { ActivityEvent } from '@/types';
import { ProfileSkeleton, useDelayedLoading } from '@/components/ui/Skeleton';
import { useAutosave } from '@/lib/useAutosave';
import AutosaveStatusBadge from '@/components/ui/AutosaveStatusBadge';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useFormValidation, ProfileUpdateSchema, FormFieldError } from '@/lib/validation';

const DISCLOSURE_FAQ = [
  {
    q: 'How does the Disclosure Guard protect exposed secrets?',
    a: 'All API keys, GitHub tokens, AWS credentials, and passwords detected during analysis are masked in-memory before database persistence, logs, or AI prompt contexts. When secrets or critical severity findings are identified, public issue draft generation is strictly blocked (DISCLOSURE_BLOCKED 403), and maintainer private disclosure guidance is provided instead.',
  },
  {
    q: 'Does ContribLens execute repository code?',
    a: 'Never. ContribLens performs 100% static, read-only AST and manifest parsing. It never executes repository code, never runs shell scripts, and never executes package manager commands (e.g. npm install, pip install).',
  },
  {
    q: 'Will ContribLens ever auto-publish pull requests or issues?',
    a: 'Strictly never. Operating under the invariant "Code verifies. AI explains. Human approves.", ContribLens requires explicit human approval for any external publication or PR submission. We never auto-create GitHub issues or PRs.',
  },
  {
    q: 'How are vulnerability advisories and CVEs verified?',
    a: 'Vulnerabilities are cross-referenced directly against official OSV.dev schemas and deterministic scanner rules. AI explanations can only interpret verified finding IDs and cannot invent CVEs or manipulate risk ratings.',
  },
  {
    q: 'Where is my repository analysis data stored?',
    a: 'Analysis results are stored ephemerally with zero long-term raw repository caching. You have complete data sovereignty: export your entire history as JSON at any time or purge all records with one click.',
  },
];

export default function ProfileView() {
  const router = useRouter();
  const { user, setUser, updateSettings, showToast, setActiveScan, loading: appLoading } = useApp();
  const showDelayedSkeleton = useDelayedLoading(appLoading || !user, 150);

  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState(user?.name || '');
  const [clearing, setClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false);
  const [showDiscardRecoveryConfirm, setShowDiscardRecoveryConfirm] = useState(false);
  const [showLogoutWithUnsavedConfirm, setShowLogoutWithUnsavedConfirm] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const isLoggingOutRef = useRef(false);
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [integrationStatus, setIntegrationStatus] = useState<any>(null);

  // Authoritative form validation for profile and bio updates
  const profileValidation = useFormValidation({
    schema: ProfileUpdateSchema,
    initialValues: {
      name: user?.name || '',
      bio: user?.bio || '',
    },
    idPrefix: 'profile',
  });

  // Accordion open sections
  const [openSection, setOpenSection] = useState<'profile' | 'appearance' | 'safety' | 'activity' | 'data'>('safety');
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    if (user?.name) {
      setDisplayName(user.name);
      profileValidation.setFieldValue('name', user.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.name]);

  const [bioText, setBioText] = useState(user?.bio || '');

  useEffect(() => {
    if (user?.bio !== undefined && user?.bio !== null) {
      setBioText(user.bio);
      profileValidation.setFieldValue('bio', user.bio);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.bio]);

  const bioAutosave = useAutosave<string>({
    id: user?.id ? `profile_bio_${user.id}` : 'profile_bio_anonymous',
    value: bioText,
    enabled: true,
    isAuthenticated: Boolean(user),
    storageKey: user?.id ? `contriblens_bio_${user.id}` : 'contriblens_bio_draft',
    delayMs: 850,
    onSave: async (val) => {
      if (isLoggingOutRef.current || !user) return { success: false, error: 'Sign in to save' };
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bio: val }),
      });
      if (res.ok) {
        const data = await res.json();
        if (!isLoggingOutRef.current) {
          setUser(data.user);
        }
        return { success: true };
      } else {
        const data = await res.json().catch(() => ({}));
        return { success: false, error: data.error?.message || data.error || 'Failed to save bio' };
      }
    },
    onRestore: (val) => {
      if (isLoggingOutRef.current) return;
      setBioText(val);
      showToast('Restored unsaved bio notes from browser storage.', 'info');
    },
  });

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const res = await fetch('/api/profile');
        if (res.ok && isMounted && !isLoggingOutRef.current) {
          const data = await res.json();
          if (data.activities && isMounted && !isLoggingOutRef.current) {
            setActivities(data.activities);
          }
        }
      } catch (err) {
        if (!isLoggingOutRef.current) {
          console.warn('Failed to load profile activities:', err);
        }
      }

      try {
        const statusRes = await fetch('/api/integrations/status');
        if (statusRes.ok && isMounted && !isLoggingOutRef.current) {
          const statusData = await statusRes.json();
          if (isMounted && !isLoggingOutRef.current) {
            setIntegrationStatus(statusData.status);
          }
        }
      } catch (err) {
        if (!isLoggingOutRef.current) {
          console.warn('Failed to load integration status:', err);
        }
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  const userSettings = user?.settings;
  const settings = {
    theme: userSettings?.theme || 'black-hole',
    fontSize: userSettings?.fontSize || 'medium',
    fontFamily: userSettings?.fontFamily || 'sans',
    reducedMotion: Boolean(userSettings?.reducedMotion ?? (userSettings as any)?.reduceMotion ?? false),
    strictRedaction: userSettings?.strictRedaction !== false,
    geminiGroundingPolicy: userSettings?.geminiGroundingPolicy !== false,
  };

  const handleUpdateName = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!user) return;

    // Validate with authoritative Zod schema
    const validationResult = profileValidation.validateAll({
      name: displayName,
      bio: bioText,
    });
    if (!validationResult.isValid) {
      return;
    }

    const previousUser = { ...user };
    const previousName = user.name;
    const trimmedName = displayName.trim();

    // 1. Optimistically update local user state immediately
    setUser({ ...user, name: trimmedName });
    setSavingName(true);
    setNameError(null);

    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName }),
      });
      if (res.ok) {
        // 2. Reconcile with server-confirmed user data
        const data = await res.json();
        setUser(data.user);
        setDisplayName(data.user.name);
        profileValidation.setFieldValue('name', data.user.name);
        showToast('Profile name updated!', 'success');
      } else {
        // 3. Rollback on server failure
        setUser(previousUser);
        setDisplayName(previousName);
        const errData = await res.json().catch(() => ({}));
        const mapped = profileValidation.applyServerErrors(errData, ['name', 'bio']);
        if (!mapped) {
          setNameError(errData.error?.message || errData.error || 'Failed to update name on server.');
        }
        showToast('Failed to update name. Reverted changes.', 'error');
      }
    } catch {
      // 3. Rollback on network failure
      setUser(previousUser);
      setDisplayName(previousName);
      setNameError('Network error while updating name. Reverted changes.');
      showToast('Failed to update name. Reverted changes.', 'error');
    } finally {
      setSavingName(false);
    }
  };

  const handleExportData = async () => {
    try {
      const res = await fetch('/api/profile?export=true');
      if (res.ok) {
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `contriblens_workspace_export_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showToast('Workspace data exported successfully (.JSON)', 'success');
      }
    } catch {
      showToast('Export failed', 'error');
    }
  };

  const handleClearData = async () => {
    setClearing(true);
    try {
      const res = await fetch('/api/profile', { method: 'DELETE' });
      if (res.ok) {
        try {
          localStorage.removeItem('contriblens_active_scan');
        } catch (err) {
          console.debug('Failed to remove active scan from localStorage:', err);
        }
        setActiveScan(null);
        showToast('All scan records and drafts cleared.', 'info');
        setShowClearConfirm(false);
        router.push('/app/dashboard');
      }
    } catch {
      showToast('Failed to clear data', 'error');
    } finally {
      setClearing(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      const res = await fetch('/api/profile?account=true', { method: 'DELETE' });
      if (res.ok) {
        try {
          localStorage.removeItem('contriblens_active_scan');
          localStorage.removeItem('contriblens_user_settings');
        } catch (err) {
          console.debug('Failed to clear account storage items:', err);
        }
        setActiveScan(null);
        setUser(null);
        setShowDeleteAccountConfirm(false);
        showToast('Account and associated data deleted permanently.', 'info');
        router.push('/');
      } else {
        showToast('Failed to delete account', 'error');
      }
    } catch {
      showToast('Network error deleting account', 'error');
    } finally {
      setDeletingAccount(false);
    }
  };

  const executeLogout = async () => {
    if (isLoggingOutRef.current) return;
    isLoggingOutRef.current = true;
    setIsLoggingOut(true);

    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (err) {
      console.debug('Failed to call logout endpoint:', err);
    }

    try {
      localStorage.removeItem('contriblens_active_scan');
    } catch (err) {
      console.debug('Failed to clear active scan upon logout:', err);
    }
    setActiveScan(null);
    setUser(null);
    setShowLogoutWithUnsavedConfirm(false);
    showToast('Logged out successfully', 'info');
    router.push('/');
    router.refresh();
  };

  const handleLogoutClick = () => {
    if (isLoggingOutRef.current || isLoggingOut) return;
    if (bioAutosave.hasUnsavedChanges) {
      setShowLogoutWithUnsavedConfirm(true);
    } else {
      executeLogout();
    }
  };

  // Unsaved changes guard: warn user before navigating or closing tab if bio has unsaved content
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (bioAutosave.hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [bioAutosave.hasUnsavedChanges]);

  if ((appLoading || !user) && showDelayedSkeleton) {
    return <ProfileSkeleton />;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6 bg-transparent text-textPrimary">
      {/* Header */}
      <div className="pb-6 border-b border-borderDark">
        <h1 className="text-2xl font-heading font-bold text-textPrimary flex items-center gap-2">
          <UserIcon className="w-6 h-6 text-electricTangerine" />
          <span>Profile &amp; Safety Controls</span>
        </h1>
        <p className="text-xs text-textMuted mt-1">
          Safety policies, visual accessibility preferences, live diagnostics, and local data retention settings.
        </p>
      </div>

      {/* Accordion 1: Safety & AI Guardrails + Disclosure FAQ */}
      <div className="glass-panel rounded-2xl border border-borderDark overflow-hidden">
        <button
          onClick={() => setOpenSection(openSection === 'safety' ? ('' as any) : 'safety')}
          className="w-full min-h-[44px] p-6 text-left flex items-center justify-between hover:bg-blackHole/40 transition-colors press-spring touch-manipulation"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-coffeeBean flex items-center justify-center text-electricTangerine border border-borderDark">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-heading font-bold text-textPrimary">Safety &amp; Responsible Disclosure Center</h2>
              <span className="text-xs text-textMuted">Secret masking, AI grounding policy, and disclosure FAQ</span>
            </div>
          </div>
          <ChevronDown
            className={`w-5 h-5 text-botticelli transition-transform ${
              openSection === 'safety' ? 'rotate-180 text-lemonChiffon' : ''
            }`}
          />
        </button>

        {openSection === 'safety' && (
          <div className="p-6 pt-2 border-t border-borderDark space-y-5 text-xs">
            {/* Always ON: Secret Masking */}
            <div className="p-4 rounded-xl bg-black border border-borderDark flex items-center justify-between">
              <div>
                <span className="font-semibold text-textPrimary block">Strict Secret Masking</span>
                <span className="text-textMuted">
                  API tokens, AWS keys, and private keys are masked with asterisks before model calls or database writes.
                </span>
              </div>
              <span className="text-lemonChiffon font-bold px-3 py-1 rounded-full bg-coffeeBean border border-lemonChiffon/30 text-[10px]">
                ALWAYS ON
              </span>
            </div>

            {/* Toggle: Gemini Grounding Policy */}
            <div className="p-4 rounded-xl bg-black border border-borderDark flex items-center justify-between">
              <div>
                <span className="font-semibold text-textPrimary block">Gemini Evidence Grounding Policy</span>
                <span className="text-textMuted">
                  Restricts AI explanations strictly to verified finding IDs with deterministic fallback on failure.
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(settings.geminiGroundingPolicy)}
                  onChange={(e) => updateSettings({ geminiGroundingPolicy: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-blackHole peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-black after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-cotton after:border-borderDark after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-lemonChiffon" />
              </label>
            </div>

            {/* Sensitive Publishing Control */}
            <div className="p-4 rounded-xl bg-coffeeBean/70 border border-borderDark flex items-center justify-between">
              <div>
                <span className="font-semibold text-textPrimary block">Human Review Enforcement</span>
                <span className="text-textMuted">
                  Prohibits automatic PR creation and forces human maintainer review for all issue drafts.
                </span>
              </div>
              <span className="text-electricTangerine font-bold px-3 py-1 rounded-full bg-black border border-electricTangerine/40 text-[10px]">
                ENFORCED
              </span>
            </div>

            {/* Live Integration Status (Safe enum report - No secrets in payload) */}
            {integrationStatus && (
              <div className="p-4 rounded-xl bg-black border border-borderDark space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-textPrimary text-xs block">
                    Verified Integration Status (Diagnostics)
                  </span>
                  <span className="text-[10px] text-textMuted font-mono">Zero secrets exposed</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <div className="p-2.5 rounded-lg bg-blackHole border border-borderDark">
                    <span className="text-[10px] text-textMuted block">Supabase</span>
                    <span
                      className={`text-[11px] font-mono font-bold capitalize ${
                        integrationStatus.supabase === 'configured' ? 'text-lemonChiffon' : 'text-textMuted'
                      }`}
                    >
                      {integrationStatus.supabase}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-blackHole border border-borderDark">
                    <span className="text-[10px] text-textMuted block">GitHub API</span>
                    <span
                      className={`text-[11px] font-mono font-bold capitalize ${
                        integrationStatus.github === 'token configured' ? 'text-electricTangerine' : 'text-botticelli'
                      }`}
                    >
                      {integrationStatus.github}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-blackHole border border-borderDark">
                    <span className="text-[10px] text-textMuted block">OSV Engine</span>
                    <span
                      className={`text-[11px] font-mono font-bold capitalize ${
                        integrationStatus.osv === 'reachable' ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {integrationStatus.osv}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-blackHole border border-borderDark">
                    <span className="text-[10px] text-textMuted block">Gemini AI</span>
                    <span
                      className={`text-[11px] font-mono font-bold capitalize ${
                        integrationStatus.gemini === 'configured' ? 'text-lemonChiffon' : 'text-electricTangerine'
                      }`}
                    >
                      {integrationStatus.gemini}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-blackHole border border-borderDark">
                    <span className="text-[10px] text-textMuted block">Persistence DB</span>
                    <span className="text-[11px] font-mono font-bold text-emerald-400">
                      {integrationStatus.database}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Task 3: FAQ-style Disclosure Accordion */}
            <div className="space-y-2 pt-2 border-t border-borderDark">
              <span className="font-heading font-bold text-sustainableLinen text-xs block mb-2 flex items-center gap-1.5">
                <HelpCircle className="w-4 h-4 text-electricTangerine" />
                <span>Responsible Disclosure FAQ</span>
              </span>
              <div className="space-y-2">
                {DISCLOSURE_FAQ.map((faq, idx) => {
                  const isOpen = openFaq === idx;
                  return (
                    <div key={idx} className="rounded-xl border border-borderDark bg-black overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setOpenFaq(isOpen ? null : idx)}
                        className="w-full min-h-[44px] p-3 text-left flex items-center justify-between text-xs font-semibold text-textPrimary hover:bg-blackHole transition-colors press-spring touch-manipulation"
                      >
                        <span>{faq.q}</span>
                        <ChevronDown
                          className={`w-3.5 h-3.5 text-botticelli transition-transform shrink-0 ml-2 ${
                            isOpen ? 'rotate-180 text-lemonChiffon' : ''
                          }`}
                        />
                      </button>
                      {isOpen && (
                        <div className="p-3 pt-1 text-[11px] text-textMuted border-t border-borderDark/60 leading-relaxed bg-blackHole/40">
                          {faq.a}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Privacy & Safety Center Documentation Links */}
            <div className="pt-2 border-t border-borderDark flex flex-wrap items-center justify-between gap-3 text-xs">
              <span className="text-textMuted">Official Safety &amp; Governance Center:</span>
              <div className="flex items-center gap-4">
                <Link
                  href="/security"
                  className="text-lemonChiffon hover:underline flex items-center gap-1 font-mono text-[11px]"
                >
                  <span>Security Model &amp; Disclosure Policy</span>
                  <ExternalLink className="w-3 h-3" />
                </Link>
                <Link
                  href="/safety"
                  className="text-lemonChiffon hover:underline flex items-center gap-1 font-mono text-[11px]"
                >
                  <span>Safety Guarantees</span>
                  <ExternalLink className="w-3 h-3" />
                </Link>
                <Link
                  href="/privacy"
                  className="text-lemonChiffon hover:underline flex items-center gap-1 font-mono text-[11px]"
                >
                  <span>Privacy Notice</span>
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Accordion 2: Profile & Credentials (Account, Email + GitHub connection) */}
      <div className="glass-panel rounded-2xl border border-borderDark overflow-hidden">
        <button
          onClick={() => setOpenSection(openSection === 'profile' ? ('' as any) : 'profile')}
          className="w-full min-h-[44px] p-6 text-left flex items-center justify-between hover:bg-blackHole/40 transition-colors press-spring touch-manipulation"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-coffeeBean flex items-center justify-center text-lemonChiffon border border-borderDark">
              <UserIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-heading font-bold text-textPrimary">Account &amp; Credentials</h2>
              <span className="text-xs text-textMuted">Display name, email address, and GitHub connection</span>
            </div>
          </div>
          <ChevronDown
            className={`w-5 h-5 text-botticelli transition-transform ${
              openSection === 'profile' ? 'rotate-180 text-lemonChiffon' : ''
            }`}
          />
        </button>

        {openSection === 'profile' && (
          <div className="p-6 pt-2 border-t border-borderDark space-y-4">
            <form onSubmit={handleUpdateName} className="space-y-4 max-w-lg">
              <div>
                <label htmlFor="profile-name" className="block text-xs font-medium text-textMuted mb-1">Display Name</label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    id="profile-name"
                    name="name"
                    type="text"
                    value={displayName ?? ''}
                    onChange={(e) => {
                      setDisplayName(e.target.value);
                      profileValidation.setFieldValue('name', e.target.value);
                      if (nameError) setNameError(null);
                    }}
                    onBlur={() => profileValidation.handleBlur('name')}
                    aria-invalid={Boolean(profileValidation.errors.name || nameError)}
                    aria-describedby={
                      profileValidation.errors.name
                        ? 'profile-name-error'
                        : nameError
                        ? 'profile-name-server-error'
                        : undefined
                    }
                    inputMode="text"
                    autoCapitalize="words"
                    autoCorrect="off"
                    spellCheck={false}
                    className={`flex-1 min-h-[44px] px-4 py-2 bg-black/60 border rounded-xl text-base sm:text-sm text-textPrimary focus:outline-none transition-colors ${
                      profileValidation.errors.name || nameError
                        ? 'border-rosewood/70 focus:border-red-400'
                        : 'border-borderDark focus:border-lemonChiffon'
                    } ${savingName ? 'opacity-80' : ''}`}
                  />
                  <button
                    type="submit"
                    disabled={savingName}
                    className="min-h-[44px] px-5 py-2 bg-lemonChiffon hover:bg-sustainableLinen text-black text-xs font-semibold rounded-full transition-colors disabled:opacity-50 press-spring touch-manipulation flex items-center justify-center gap-1.5"
                  >
                    {savingName ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Syncing...</span>
                      </>
                    ) : (
                      'Save Name'
                    )}
                  </button>
                </div>
                <FormFieldError id="profile-name-error" error={profileValidation.errors.name} />
                {nameError && (
                  <div id="profile-name-server-error" role="alert" className="mt-2 p-3 rounded-xl bg-rosewood/25 border border-rosewood/60 text-xs text-sustainableLinen flex items-center justify-between gap-3 animate-fade-in">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                      <span>{nameError}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleUpdateName()}
                      className="min-h-[44px] px-3.5 py-2 rounded-full bg-lemonChiffon text-black text-xs font-semibold hover:bg-sustainableLinen transition-colors press-spring touch-manipulation flex items-center justify-center"
                    >
                      Retry
                    </button>
                  </div>
                )}
              </div>

              {/* Account (Email) */}
              <div className="text-xs">
                <div className="p-3.5 rounded-xl bg-black border border-borderDark space-y-1">
                  <span className="text-textMuted block text-[10px] uppercase font-mono">Email Address</span>
                  <span className="text-textPrimary font-medium font-mono">{user?.email || 'N/A'}</span>
                </div>
              </div>

              {/* Long-form Contributor Bio & Notes with Autosave */}
              <div className="pt-4 border-t border-borderDark space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <label htmlFor="profile-bio" className="block text-xs font-semibold text-textPrimary">
                      Contributor Bio &amp; Research Notes
                    </label>
                    <span className="text-[11px] text-textMuted">
                      Personal bio, research focus, or security disclosure notes. Automatically saved as you type.
                    </span>
                  </div>
                  <AutosaveStatusBadge
                    status={bioAutosave.status}
                    lastSavedAt={bioAutosave.lastSavedAt}
                    errorMessage={bioAutosave.errorMessage}
                    onRetry={bioAutosave.retry}
                    isAuthenticated={Boolean(user)}
                  />
                </div>

                {/* Local Recovery Warning */}
                {bioAutosave.recovery.hasRecovery && (
                  <div className="p-3 rounded-xl bg-lemonChiffon/10 border border-lemonChiffon/30 flex flex-wrap items-center justify-between gap-3 text-xs text-lemonChiffon animate-fade-in">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-electricTangerine shrink-0" />
                      <span>
                        Restored unsaved local bio notes from {bioAutosave.recovery.recoveredAt}.
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowDiscardRecoveryConfirm(true)}
                        className="min-h-[44px] px-3 py-2 text-xs text-textMuted hover:text-white underline transition-colors touch-manipulation flex items-center"
                      >
                        Discard
                      </button>
                      <button
                        type="button"
                        onClick={bioAutosave.recovery.restore}
                        className="min-h-[44px] px-3.5 py-2 rounded-full bg-lemonChiffon text-black text-xs font-semibold hover:bg-sustainableLinen transition-colors touch-manipulation flex items-center justify-center press-spring"
                      >
                        Keep Local
                      </button>
                    </div>
                  </div>
                )}

                <textarea
                  id="profile-bio"
                  name="bio"
                  value={bioText}
                  onChange={(e) => {
                    setBioText(e.target.value);
                    profileValidation.setFieldValue('bio', e.target.value);
                  }}
                  onBlur={() => {
                    bioAutosave.handleBlur();
                    profileValidation.handleBlur('bio');
                  }}
                  rows={4}
                  maxLength={2000}
                  aria-invalid={Boolean(profileValidation.errors.bio)}
                  aria-describedby={profileValidation.errors.bio ? 'profile-bio-error' : undefined}
                  placeholder="Share your open-source background, security research interests, or contribution notes..."
                  className={`w-full p-3.5 bg-black/60 border rounded-xl text-base sm:text-xs text-textPrimary placeholder:text-textMuted/50 focus:outline-none transition-colors font-mono leading-relaxed resize-y ${
                    profileValidation.errors.bio
                      ? 'border-rosewood/80 focus:border-red-400'
                      : 'border-borderDark focus:border-lemonChiffon'
                  }`}
                />
                <FormFieldError id="profile-bio-error" error={profileValidation.errors.bio} />
                <div className="flex justify-end text-[10px] text-textMuted font-mono">
                  {bioText.length}/2000 characters
                </div>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Accordion 3: Appearance & Accessibility (font scale, font family, reduce motion) */}
      <div className="glass-panel rounded-2xl border border-borderDark overflow-hidden">
        <button
          onClick={() => setOpenSection(openSection === 'appearance' ? ('' as any) : 'appearance')}
          className="w-full min-h-[44px] p-6 text-left flex items-center justify-between hover:bg-blackHole/40 transition-colors press-spring touch-manipulation"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-coffeeBean flex items-center justify-center text-botticelli border border-borderDark">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-heading font-bold text-textPrimary">Appearance &amp; Accessibility</h2>
              <span className="text-xs text-textMuted">Font scale, typography stack, and reduced motion</span>
            </div>
          </div>
          <ChevronDown
            className={`w-5 h-5 text-botticelli transition-transform ${
              openSection === 'appearance' ? 'rotate-180 text-lemonChiffon' : ''
            }`}
          />
        </button>

        {openSection === 'appearance' && (
          <div className="p-6 pt-2 border-t border-borderDark space-y-6">
            {/* Font Scale: small / medium / large */}
            <div>
              <label className="block text-xs font-medium text-textMuted mb-2">Font Scale</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-md">
                {[
                  { id: 'small', label: 'Small (14px)' },
                  { id: 'medium', label: 'Medium (16px)' },
                  { id: 'large', label: 'Large (18px)' },
                ].map((fs) => {
                  const isSelected =
                    settings.fontSize === fs.id ||
                    (fs.id === 'medium' && (settings.fontSize === 'normal' || !settings.fontSize));
                  return (
                    <button
                      key={fs.id}
                      type="button"
                      onClick={() => updateSettings({ fontSize: fs.id as any })}
                      className={`min-h-[44px] py-2 px-3 rounded-full border text-xs font-medium transition-colors press-spring touch-manipulation flex items-center justify-center ${
                        isSelected
                          ? 'bg-lemonChiffon text-black font-semibold shadow-sm'
                          : 'bg-black border-borderDark text-textMuted hover:text-textPrimary'
                      }`}
                    >
                      {fs.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Typography Stack: sans / mono / system */}
            <div>
              <label className="block text-xs font-medium text-textMuted mb-2">Typography Stack</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-md">
                {[
                  { id: 'sans', label: 'Inter Sans' },
                  { id: 'mono', label: 'JetBrains Mono' },
                  { id: 'system', label: 'System Native' },
                ].map((ff) => {
                  const isSelected = (settings.fontFamily || 'sans') === ff.id;
                  return (
                    <button
                      key={ff.id}
                      type="button"
                      onClick={() => updateSettings({ fontFamily: ff.id as any })}
                      className={`min-h-[44px] py-2 px-3 rounded-full border text-xs font-medium transition-colors press-spring touch-manipulation flex items-center justify-center ${
                        isSelected
                          ? 'bg-lemonChiffon text-black font-semibold shadow-sm'
                          : 'bg-black border-borderDark text-textMuted hover:text-textPrimary'
                      }`}
                    >
                      {ff.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Reduced Motion Toggle */}
            <div className="pt-2">
              <label className="min-h-[44px] flex items-center gap-3 cursor-pointer touch-manipulation">
                <input
                  type="checkbox"
                  checked={Boolean(settings.reducedMotion)}
                  onChange={(e) =>
                    updateSettings({ reducedMotion: e.target.checked, reduceMotion: e.target.checked })
                  }
                  className="w-5 h-5 rounded bg-black border-borderDark text-lemonChiffon focus:ring-lemonChiffon touch-manipulation"
                />
                <div>
                  <span className="text-xs font-semibold text-textPrimary block">
                    Enable Reduced Motion
                  </span>
                  <span className="text-[11px] text-textMuted">
                    Disables ambient float effects, spring animations, and smooth transitions.
                  </span>
                </div>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Accordion 4: Activity History & Audit Trail */}
      <div className="glass-panel rounded-2xl border border-borderDark overflow-hidden">
        <button
          onClick={() => setOpenSection(openSection === 'activity' ? ('' as any) : 'activity')}
          className="w-full min-h-[44px] p-6 text-left flex items-center justify-between hover:bg-blackHole/40 transition-colors press-spring touch-manipulation"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-coffeeBean flex items-center justify-center text-electricTangerine border border-borderDark">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-heading font-bold text-textPrimary">Activity History &amp; Audit Trail</h2>
              <span className="text-xs text-textMuted">Local timeline of scans, generated routes, and issue draft exports</span>
            </div>
          </div>
          <ChevronDown
            className={`w-5 h-5 text-botticelli transition-transform ${
              openSection === 'activity' ? 'rotate-180 text-lemonChiffon' : ''
            }`}
          />
        </button>

        {openSection === 'activity' && (
          <div className="p-6 pt-2 border-t border-borderDark space-y-3">
            {activities.length === 0 ? (
              <div className="text-center py-8 text-textMuted text-xs">
                <Clock className="w-6 h-6 mx-auto mb-2 text-textMuted/60" />
                <p>No activity recorded yet.</p>
                <p className="text-[11px] text-textMuted/70 mt-1">
                  Run a repository scan or create contribution routes to begin tracking actions.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                {activities.map((act) => {
                  const getBadge = (type: string) => {
                    switch (type) {
                      case 'scan':
                        return 'bg-botticelli/20 text-botticelli border-botticelli/30';
                      case 'route_created':
                        return 'bg-lemonChiffon/20 text-lemonChiffon border-lemonChiffon/30';
                      case 'draft_generated':
                        return 'bg-electricTangerine/20 text-electricTangerine border-electricTangerine/30';
                      case 'route_updated':
                      case 'route_completed':
                        return 'bg-sustainableLinen/20 text-sustainableLinen border-sustainableLinen/30';
                      default:
                        return 'bg-coffeeBean text-cotton border-borderDark';
                    }
                  };

                  return (
                    <div
                      key={act.id}
                      className="p-3.5 rounded-xl bg-black border border-borderDark flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="flex items-start sm:items-center gap-2.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase border ${getBadge(
                            act.type
                          )}`}
                        >
                          {act.type.replace('_', ' ')}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-textPrimary">{act.repoName}</span>
                          </div>
                          <p className="text-[11px] text-textMuted mt-0.5">{act.description}</p>
                        </div>
                      </div>
                      <div className="text-[10px] font-mono text-textMuted flex items-center gap-1 sm:self-center shrink-0">
                        <Clock className="w-3 h-3 text-textMuted/80" />
                        <span>{new Date(act.timestamp).toLocaleString()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Accordion 5: Workspace Data & Export (Task 3: Botticelli Export + Rosewood Clear) */}
      <div className="glass-panel rounded-2xl border border-borderDark overflow-hidden">
        <button
          onClick={() => setOpenSection(openSection === 'data' ? ('' as any) : 'data')}
          className="w-full min-h-[44px] p-6 text-left flex items-center justify-between hover:bg-blackHole/40 transition-colors press-spring touch-manipulation"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-coffeeBean flex items-center justify-center text-lemonChiffon border border-borderDark">
              <Download className="w-5 h-5 text-lemonChiffon" />
            </div>
            <div>
              <h2 className="text-sm font-heading font-bold text-textPrimary">Workspace Data &amp; Export</h2>
              <span className="text-xs text-textMuted">Export scans as JSON, clear database history, or delete account</span>
            </div>
          </div>
          <ChevronDown
            className={`w-5 h-5 text-botticelli transition-transform ${
              openSection === 'data' ? 'rotate-180 text-lemonChiffon' : ''
            }`}
          />
        </button>

        {openSection === 'data' && (
          <div className="p-6 pt-2 border-t border-borderDark space-y-4">
            <div className="flex flex-col sm:flex-row flex-wrap gap-3">
              {/* Task 3: Export All Data (Botticelli) */}
              <button
                onClick={handleExportData}
                className="min-h-[44px] px-5 py-2.5 rounded-full bg-botticelli/15 hover:bg-botticelli/25 text-botticelli border border-botticelli/40 text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm press-spring touch-manipulation"
              >
                <Download className="w-4 h-4 text-botticelli" />
                <span>Export All Data (.JSON)</span>
              </button>

              {/* Clear History (Rosewood) with Modal Confirmation */}
              <button
                type="button"
                onClick={() => setShowClearConfirm(true)}
                disabled={clearing}
                className="min-h-[44px] px-5 py-2.5 rounded-full bg-rosewood/30 hover:bg-rosewood/50 text-sustainableLinen text-xs font-semibold flex items-center justify-center gap-2 transition-colors border border-rosewood/60 press-spring touch-manipulation disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4 text-red-300" />
                <span>Clear History</span>
              </button>

              {/* Delete Account (Rosewood) with High-Severity Typed Confirmation */}
              <button
                type="button"
                onClick={() => setShowDeleteAccountConfirm(true)}
                disabled={deletingAccount}
                className="min-h-[44px] px-5 py-2.5 rounded-full bg-black hover:bg-rosewood/25 text-red-300 hover:text-red-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors border border-rosewood/60 press-spring touch-manipulation disabled:opacity-50"
              >
                <AlertTriangle className="w-4 h-4" />
                <span>Delete Account</span>
              </button>
            </div>

            <div className="pt-4 border-t border-borderDark">
              <button
                type="button"
                onClick={handleLogoutClick}
                disabled={isLoggingOut}
                className="min-h-[44px] px-5 py-2.5 rounded-full bg-black hover:bg-rosewood/25 text-red-300 hover:text-red-200 border border-rosewood/60 text-xs font-semibold flex items-center gap-2 transition-colors press-spring touch-manipulation focus:outline-none focus:ring-2 focus:ring-rosewood/60 focus:ring-offset-2 focus:ring-offset-black disabled:opacity-50"
                aria-label="Log out of ContribLens"
              >
                {isLoggingOut ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-red-300" />
                    <span>Signing out...</span>
                  </>
                ) : (
                  <>
                    <LogOut className="w-4 h-4 text-red-300" />
                    <span>Sign Out of ContribLens</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Session Management / Logout Section at Bottom of Profile Settings */}
      <div className="glass-panel rounded-2xl border border-borderDark p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <LogOut className="w-4 h-4 text-rosewood" />
            <h2 className="text-sm font-heading font-bold text-textPrimary">Sign Out</h2>
          </div>
          <p className="text-xs text-textMuted">
            End your authenticated session on this device and return to the home page.
          </p>
        </div>
        <button
          type="button"
          onClick={handleLogoutClick}
          disabled={isLoggingOut}
          className="min-h-[44px] w-full sm:w-auto px-5 py-2.5 rounded-full bg-black hover:bg-rosewood/25 text-red-300 hover:text-red-200 border border-rosewood/60 text-xs font-semibold flex items-center justify-center gap-2 transition-colors press-spring touch-manipulation focus:outline-none focus:ring-2 focus:ring-rosewood/60 focus:ring-offset-2 focus:ring-offset-black disabled:opacity-50"
          aria-label="Log out of ContribLens"
        >
          {isLoggingOut ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-red-300" />
              <span>Signing out...</span>
            </>
          ) : (
            <>
              <LogOut className="w-4 h-4 text-red-300" />
              <span>Log out</span>
            </>
          )}
        </button>
      </div>

      {/* Confirmation Dialog 1: Clear History */}
      <ConfirmDialog
        isOpen={showClearConfirm}
        title="Clear Workspace History?"
        description="Are you sure you want to clear your repository scan records, routes, and local cache?"
        consequenceWarning="This wipes your scan history and active analysis contexts from the database."
        confirmLabel="Clear History"
        cancelLabel="Keep Data"
        isDestructive={true}
        isBusy={clearing}
        onConfirm={handleClearData}
        onCancel={() => setShowClearConfirm(false)}
      />

      {/* Confirmation Dialog 2: Permanently Delete Account (Typed Confirmation Required) */}
      <ConfirmDialog
        isOpen={showDeleteAccountConfirm}
        title="Permanently Delete Account?"
        description={`Are you sure you want to delete your ContribLens account (${user?.email || 'this account'})?`}
        consequenceWarning="Permanent: All credentials, repository scans, contribution routes, and progress will be purged immediately. There is no recovery."
        requireTypedConfirmation={true}
        typedConfirmationPhrase="DELETE"
        typedConfirmationPrompt="Type DELETE below to confirm permanent account deletion:"
        confirmLabel="Permanently Delete Account"
        cancelLabel="Keep My Account"
        isDestructive={true}
        isBusy={deletingAccount}
        onConfirm={handleDeleteAccount}
        onCancel={() => setShowDeleteAccountConfirm(false)}
      />

      {/* Confirmation Dialog 3: Discard Local Bio Recovery */}
      <ConfirmDialog
        isOpen={showDiscardRecoveryConfirm}
        title="Discard Local Notes Recovery?"
        description="Are you sure you want to discard the restored local bio notes?"
        consequenceWarning="The unsaved local notes will be permanently removed from your browser's local recovery cache."
        confirmLabel="Discard Local Notes"
        cancelLabel="Keep Recovered Notes"
        isDestructive={true}
        onConfirm={() => {
          bioAutosave.recovery.discard();
          setShowDiscardRecoveryConfirm(false);
        }}
        onCancel={() => setShowDiscardRecoveryConfirm(false)}
      />

      {/* Confirmation Dialog 4: Sign Out with Unsaved Changes */}
      <ConfirmDialog
        isOpen={showLogoutWithUnsavedConfirm}
        title="Sign Out with Unsaved Changes?"
        description="You have unsaved changes in your contributor bio or research notes that have not yet synced to the server."
        consequenceWarning="Signing out now will discard your unsaved edits."
        confirmLabel="Discard & Sign Out"
        cancelLabel="Stay & Save"
        isDestructive={true}
        onConfirm={executeLogout}
        onCancel={() => setShowLogoutWithUnsavedConfirm(false)}
      />

    </div>
  );
}
