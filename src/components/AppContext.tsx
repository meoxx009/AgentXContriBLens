'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { User, UserSettings, ScanSummary } from '@/types';
import { reconcileActiveScan } from '@/lib/dashboard-sync';
import { isSupabaseConfigured, getSupabaseBrowserClient } from '@/lib/supabase-browser';
import { AlertCircle, LogIn, ArrowLeft, WifiOff } from 'lucide-react';
import AuthModal from '@/components/auth/AuthModal';

export interface AuthModalOptions {
  initialMode?: 'login' | 'signup';
  title?: string;
  subtitle?: string;
  onSuccess?: () => void;
  onDismiss?: () => void;
}

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface AppContextType {
  user: User | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  activeScan: ScanSummary | null;
  setActiveScan: (scan: ScanSummary | null) => void;
  toasts: Toast[];
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  removeToast: (id: string) => void;
  refreshUser: () => Promise<void>;
  updateSettings: (newSettings: Partial<UserSettings>) => Promise<void>;
  isSessionExpired: boolean;
  setSessionExpired: (expired: boolean) => void;
  isOffline: boolean;
  selectedFindingId: string | null;
  setSelectedFindingId: (id: string | null) => void;
  isAuthModalOpen: boolean;
  authModalOptions: AuthModalOptions | null;
  openAuthModal: (options?: AuthModalOptions) => void;
  closeAuthModal: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function applySettingsToDom(settings?: UserSettings) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  const theme = settings?.theme || 'black-hole';
  root.classList.remove('theme-black-hole', 'theme-linen', 'theme-system', 'dark');
  if (theme === 'black-hole' || theme === 'dark') {
    root.classList.add('dark', 'theme-black-hole');
  } else if (theme === 'linen' || theme === 'light') {
    root.classList.add('theme-linen');
  } else {
    // system
    root.classList.add('theme-system');
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      root.classList.add('dark');
    }
  }

  // Font size: small/medium/large (also supports compact/normal/comfortable)
  root.classList.remove('text-sm-mode', 'text-base-mode', 'text-lg-mode');
  if (settings?.fontSize === 'small' || settings?.fontSize === 'compact') {
    root.classList.add('text-sm-mode');
  } else if (settings?.fontSize === 'large' || settings?.fontSize === 'comfortable') {
    root.classList.add('text-lg-mode');
  } else {
    root.classList.add('text-base-mode');
  }

  // Font family
  root.classList.remove('font-sans-mode', 'font-system-mode', 'font-mono-mode');
  if (settings?.fontFamily === 'mono') {
    root.classList.add('font-mono-mode');
  } else if (settings?.fontFamily === 'system') {
    root.classList.add('font-system-mode');
  } else {
    root.classList.add('font-sans-mode');
  }

  // Reduced motion
  if (settings?.reducedMotion || (settings as any)?.reduceMotion) {
    root.classList.add('reduce-motion');
  } else {
    root.classList.remove('reduce-motion');
  }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeScan, setActiveScan] = useState<ScanSummary | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('contriblens_active_scan');
        return saved ? JSON.parse(saved) : null;
      } catch (err) {
        console.debug('Failed to initialize activeScan from localStorage:', err);
        return null;
      }
    }
    return null;
  });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isSessionExpired, setSessionExpired] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalOptions, setAuthModalOptions] = useState<AuthModalOptions | null>(null);
  const [selectedFindingId, setSelectedFindingIdState] = useState<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  // Restore and sync selected finding ID per active scan
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const key = `contriblens_selected_finding_${activeScan?.id || 'active'}`;
        const saved = sessionStorage.getItem(key);
        if (saved) {
          setSelectedFindingIdState(saved);
        } else {
          setSelectedFindingIdState(null);
        }
      } catch (err) {
        console.debug('Failed to read selected finding from session storage:', err);
      }
    }
  }, [activeScan?.id]);

  const setSelectedFindingId = useCallback((id: string | null) => {
    setSelectedFindingIdState((prev) => (prev === id ? prev : id));
    if (typeof window !== 'undefined') {
      try {
        const key = `contriblens_selected_finding_${activeScan?.id || 'active'}`;
        if (id) {
          sessionStorage.setItem(key, id);
        } else {
          sessionStorage.removeItem(key);
        }
      } catch (err) {
        console.debug('Failed to update session storage for selected finding:', err);
      }
    }
  }, [activeScan?.id]);

  // Global network connectivity detection
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    setIsOffline(!navigator.onLine);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const openAuthModal = useCallback((options?: AuthModalOptions) => {
    setAuthModalOptions(options || {});
    setIsAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setIsAuthModalOpen(false);
    setAuthModalOptions(null);
  }, []);

  // Redirect on protected routes when not authenticated and not loading
  useEffect(() => {
    if (loading) return;
    const protectedPrefixes = ['/app', '/dashboard', '/scan', '/findings', '/contributions', '/drafts', '/issue-drafts', '/profile'];
    const isProtected = protectedPrefixes.some(
      (prefix) => pathname === prefix || pathname.startsWith(prefix + '/')
    );
    if (isProtected && !user) {
      setSessionExpired(true);
    }
  }, [loading, user, pathname]);

  const refreshUser = async (isRetry = false): Promise<void> => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setSessionExpired(false);
        applySettingsToDom(data.user?.settings);
        if (data.user?.settings) {
          try {
            localStorage.setItem('contriblens_user_settings', JSON.stringify(data.user.settings));
          } catch (err) {
            console.debug('Failed to write user settings to localStorage:', err);
          }
        }

        // Authoritative reconciliation: activeScan (localStorage) never contradicts server state
        if (data.user) {
          try {
            const scansRes = await fetch('/api/scans', { cache: 'no-store' });
            if (scansRes.ok) {
              const scansData = await scansRes.json();
              const serverScans: ScanSummary[] = scansData.scans || [];
              const savedScanRaw = typeof window !== 'undefined' ? localStorage.getItem('contriblens_active_scan') : null;
              const savedScan: ScanSummary | null = savedScanRaw ? JSON.parse(savedScanRaw) : null;
              if (serverScans.length > 0) {
                const reconciled = reconcileActiveScan(serverScans, savedScan);
                if (reconciled) {
                  const preservedFindings = savedScan?.findings || (reconciled.findings && reconciled.findings.length > 0 ? reconciled.findings : undefined);
                  const mergedScan = preservedFindings ? { ...reconciled, findings: preservedFindings } : reconciled;
                  handleSetActiveScan(mergedScan);
                }
              } else if (savedScan) {
                setActiveScan(savedScan);
              }
            } else if (scansRes.status === 401) {
              setUser(null);
              setSessionExpired(true);
            }
          } catch (err) {
            console.debug('Failed to fetch scans for activeScan reconciliation:', err);
          }
        }
      } else {
        const hasCookie = typeof document !== 'undefined' && document.cookie.includes('contriblens_session');
        if (hasCookie && !isRetry) {
          await new Promise((r) => setTimeout(r, 150));
          return refreshUser(true);
        }

        setUser(null);
        if (res.status === 401) {
          const protectedPrefixes = ['/app', '/dashboard', '/scan', '/findings', '/contributions', '/drafts', '/issue-drafts', '/profile'];
          const isProtected = protectedPrefixes.some(
            (prefix) => pathname === prefix || pathname.startsWith(prefix + '/')
          );
          if (isProtected) {
            setSessionExpired(true);
          }
        }
        try {
          const localSettings = localStorage.getItem('contriblens_user_settings');
          if (localSettings) {
            applySettingsToDom(JSON.parse(localSettings));
          }
        } catch (err) {
          console.debug('Failed to read local fallback settings:', err);
        }
      }
    } catch (err) {
      console.warn('Network error in refreshUser:', err);
      setUser(null);
      try {
        const localSettings = localStorage.getItem('contriblens_user_settings');
        if (localSettings) {
          applySettingsToDom(JSON.parse(localSettings));
        }
      } catch (storageErr) {
        console.debug('Failed to read local fallback settings after refresh error:', storageErr);
      }
    } finally {
      setLoading(false);
    }
  };

  // 1. Supabase browser auth event listener for automatic token refresh synchronization
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'TOKEN_REFRESHED' && session?.access_token) {
        try {
          const refreshRes = await fetch('/api/auth/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ supabaseToken: session.access_token }),
          });
          if (refreshRes.ok) {
            const data = await refreshRes.json();
            if (data.user) {
              setUser(data.user);
              setSessionExpired(false);
            }
          }
        } catch (err) {
          console.warn('Background Supabase token sync error:', err);
        }
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setSessionExpired(true);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // 2. Periodic background session keep-alive (every 4 minutes while authenticated)
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/auth/refresh', { method: 'POST' });
        if (res.status === 401) {
          setUser(null);
          setSessionExpired(true);
        } else if (res.ok) {
          const data = await res.json();
          if (data.user) setUser(data.user);
        }
      } catch (err) {
        // Non-blocking network hiccup
        console.debug('Session keepalive network hiccup:', err);
      }
    }, 4 * 60 * 1000);

    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    refreshUser();
    // Load last active scan from local storage if available
    try {
      const savedScan = localStorage.getItem('contriblens_active_scan');
      if (savedScan) {
        setActiveScan(JSON.parse(savedScan));
      }
    } catch (err) {
      console.debug('Failed to read active scan from localStorage:', err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSetActiveScan = useCallback((scan: ScanSummary | null) => {
    setActiveScan(scan);
    if (scan) {
      try {
        localStorage.setItem('contriblens_active_scan', JSON.stringify(scan));
      } catch (err) {
        console.debug('Failed to write active scan to localStorage:', err);
      }
    } else {
      try {
        localStorage.removeItem('contriblens_active_scan');
      } catch (err) {
        console.debug('Failed to remove active scan from localStorage:', err);
      }
    }
  }, []);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      removeToast(id);
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const updateSettings = async (newSettings: Partial<UserSettings>) => {
    const previousUser = user ? { ...user } : null;
    const currentSettings: Partial<UserSettings> = user?.settings || {};
    const updated: UserSettings = {
      theme: currentSettings.theme || 'black-hole',
      ...currentSettings,
      ...newSettings,
    };

    // 1. Optimistically update local React state and DOM immediately for zero-lag responsiveness
    if (user) {
      setUser({ ...user, settings: updated });
    }
    applySettingsToDom(updated);
    try {
      localStorage.setItem('contriblens_user_settings', JSON.stringify(updated));
    } catch (err) {
      console.debug('Failed to write settings to localStorage:', err);
    }

    if (!user) {
      showToast('Settings updated', 'info');
      return;
    }

    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: updated }),
      });
      if (res.ok) {
        // 2. Reconcile with server-confirmed user data
        const data = await res.json();
        setUser(data.user);
        showToast('Settings saved successfully', 'success');
      } else {
        // 3. Rollback on server error
        if (previousUser) {
          setUser(previousUser);
        }
        applySettingsToDom(currentSettings as UserSettings);
        try {
          localStorage.setItem('contriblens_user_settings', JSON.stringify(currentSettings));
        } catch (err) {
          console.debug('Failed to rollback settings in localStorage:', err);
        }
        showToast('Failed to save settings to server. Reverted changes.', 'error');
      }
    } catch (err) {
      // 3. Rollback on network failure
      console.warn('Network error saving settings:', err);
      if (previousUser) {
        setUser(previousUser);
      }
      applySettingsToDom(currentSettings as UserSettings);
      try {
        localStorage.setItem('contriblens_user_settings', JSON.stringify(currentSettings));
      } catch (storageErr) {
        console.debug('Failed to rollback settings in localStorage after error:', storageErr);
      }
      showToast('Network error saving settings. Reverted changes.', 'error');
    }
  };

  return (
    <AppContext.Provider
      value={{
        user,
        loading,
        setUser,
        activeScan,
        setActiveScan: handleSetActiveScan,
        toasts,
        showToast,
        removeToast,
        refreshUser,
        updateSettings,
        isSessionExpired,
        setSessionExpired,
        isOffline,
        selectedFindingId,
        setSelectedFindingId,
        isAuthModalOpen,
        authModalOptions,
        openAuthModal,
        closeAuthModal,
      }}
    >
      {/* Global Offline Banner (truthful, non-blocking indicator when disconnected) */}
      {isOffline && (
        <aside
          role="status"
          aria-live="polite"
          className="fixed top-0 inset-x-0 z-[110] bg-rosewood/95 backdrop-blur-md border-b border-rosewood text-recycledCotton px-4 py-2.5 flex items-center justify-between text-xs shadow-lg animate-fade-in"
        >
          <div className="flex items-center gap-2 max-w-2xl">
            <WifiOff className="w-4 h-4 text-electricTangerine shrink-0" aria-hidden="true" />
            <span className="leading-snug">
              You are currently offline. Changes are saved locally and will sync when connection is restored.
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined') {
                const online = navigator.onLine;
                setIsOffline(!online);
                if (online) {
                  showToast('Connection restored! Synchronizing data...', 'success');
                  refreshUser();
                } else {
                  showToast('Still offline. Please check your network connection.', 'error');
                }
              }
            }}
            className="min-h-[32px] px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-recycledCotton text-xs font-semibold border border-white/20 transition-colors shrink-0 ml-3 press-spring touch-manipulation"
          >
            Check Connection
          </button>
        </aside>
      )}

      {children}

      {/* Login / Signup Dismissible Modal Dialog */}
      <AuthModal />

      {/* Honest Session Expired Modal (Never silently empty lists or fake database errors) */}
      {isSessionExpired && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="session-expired-title"
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
        >
          <div className="liquid-glass p-6 sm:p-8 rounded-2xl max-w-md w-full border border-rosewood/40 shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-rosewood/25 border border-rosewood/60 flex items-center justify-center mx-auto text-red-300">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <h2 id="session-expired-title" className="text-base sm:text-lg font-heading font-bold text-sustainableLinen">
                Session Expired
              </h2>
              <p className="text-xs text-textMuted leading-relaxed">
                Your ContribLens authentication session has expired. To view your repository scans, findings, and contribution routes, please sign in again.
              </p>
            </div>
            <div className="pt-2 flex flex-col sm:flex-row gap-2.5 justify-center">
              <button
                type="button"
                onClick={() => {
                  openAuthModal({
                    initialMode: 'login',
                    title: 'Session Expired',
                    subtitle: 'Sign in to restore your session and continue working.',
                    onSuccess: () => {
                      setSessionExpired(false);
                    },
                  });
                }}
                className="w-full sm:w-auto px-5 py-2.5 rounded-full bg-electricTangerine hover:bg-electricTangerine-hover text-black font-semibold text-xs transition-colors flex items-center justify-center gap-2 press-spring"
              >
                <LogIn className="w-4 h-4" />
                <span>Sign In Again</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSessionExpired(false);
                  router.push('/');
                }}
                className="w-full sm:w-auto px-4 py-2.5 rounded-full bg-white/5 hover:bg-white/10 text-sustainableLinen font-semibold text-xs transition-colors border border-platinumSilver/20 press-spring"
              >
                Continue Browsing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Toast Notifications Container (z-[60] strictly above z-40 floating capsule nav & respecting safe-area-inset-bottom) */}
      <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] left-[max(1rem,env(safe-area-inset-left))] sm:left-auto z-[60] flex flex-col gap-2 max-w-sm pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center justify-between p-3.5 rounded-xl shadow-2xl text-sm border font-medium transition-all duration-200 glass-card ${
              toast.type === 'success'
                ? 'bg-coffeeBean text-lemonChiffon border-electricTangerine/60'
                : toast.type === 'error'
                ? 'bg-rosewood text-recycledCotton border-rosewood/60'
                : 'bg-coffeeBean text-sustainableLinen border-botticelli/30'
            }`}
          >
            <span className="text-xs sm:text-sm leading-snug">{toast.message}</span>
            <button
              onClick={() => removeToast(toast.id)}
              className="ml-3 min-w-[44px] min-h-[44px] -my-2 -mr-2 flex items-center justify-center text-botticelli hover:text-sustainableLinen text-xs press-spring touch-manipulation"
              aria-label="Dismiss notification"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
