'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSupabaseBrowserClient, isSupabaseConfigured } from '@/lib/supabase-browser';
import { formatOAuthError } from '@/lib/oauth-error';
import { getAuthRedirectFromParams } from '@/lib/auth-redirect';
import ContribLensLogo from '@/components/ContribLensLogo';

function AuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function completeAuth() {
      const destination = getAuthRedirectFromParams(searchParams, '/app/scan');

      if (!isSupabaseConfigured()) {
        setError('Supabase authentication is unconfigured.');
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setError('Unable to initialize Supabase client.');
        return;
      }

      // Check URL for error from provider
      const urlError = searchParams.get('error_description') || searchParams.get('error');
      if (urlError) {
        setError(formatOAuthError(urlError));
        return;
      }

      // Check URL hash for error fragment
      if (typeof window !== 'undefined' && window.location.hash) {
        try {
          const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
          const hashError = hashParams.get('error_description') || hashParams.get('error');
          if (hashError) {
            setError(formatOAuthError(hashError));
            return;
          }
        } catch {
          // ignore hash parsing failure
        }
      }

      try {
        // 1. Explicit PKCE code exchange if ?code= is in searchParams
        const code = searchParams.get('code');
        if (code) {
          try {
            const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
            if (exchangeError) {
              setError(formatOAuthError(exchangeError));
              return;
            }
            if (exchangeData?.session?.user) {
              await syncWithBackend(exchangeData.session, destination);
              return;
            }
          } catch (exErr) {
            setError(formatOAuthError(exErr));
            return;
          }
        }

        // 2. Check existing session from Supabase client
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          setError(formatOAuthError(sessionError));
          return;
        }

        if (session?.user) {
          await syncWithBackend(session, destination);
          return;
        }

        // 3. Listen to onAuthStateChange in case token exchange is in flight
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
          if (!isMounted) return;
          if (currentSession?.user) {
            subscription.unsubscribe();
            await syncWithBackend(currentSession, destination);
          }
        });

        // 4. Set a safety timeout
        const timeout = setTimeout(() => {
          if (isMounted) {
            setError('GitHub authentication timed out. Please try logging in again.');
          }
        }, 8000);

        return () => {
          clearTimeout(timeout);
          subscription.unsubscribe();
        };
      } catch (err: any) {
        if (isMounted) {
          setError(formatOAuthError(err));
        }
      }
    }

    async function syncWithBackend(session: any, destination: string) {
      const sbUser = session.user;
      const res = await fetch('/api/auth/oauth/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supabaseToken: session.access_token,
          supabaseUser: {
            id: sbUser.id,
            email: sbUser.email,
            name: sbUser.user_metadata?.full_name || sbUser.user_metadata?.name || sbUser.user_metadata?.user_name || sbUser.email?.split('@')[0],
            githubUsername: sbUser.user_metadata?.user_name || sbUser.user_metadata?.preferred_username,
            githubId: sbUser.user_metadata?.sub || sbUser.id,
          },
        }),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        if (typeof window !== 'undefined') {
          window.location.href = destination;
        } else {
          router.push(destination);
          router.refresh();
        }
      } else {
        setError(data.error || 'Failed to synchronize user session.');
      }
    }

    completeAuth();

    return () => {
      isMounted = false;
    };
  }, [router, searchParams]);

  return (
    <div className="min-h-screen bg-transparent text-textPrimary flex flex-col items-center justify-center p-6">
      <div className="liquid-glass p-8 max-w-sm w-full text-center space-y-5">
        <div className="flex justify-center">
          <ContribLensLogo size={36} />
        </div>

        {error ? (
          <div className="space-y-4">
            <div className="w-12 h-12 mx-auto rounded-full bg-rosewood/35 border border-rosewood/70 flex items-center justify-center text-red-300">
              <span className="text-xl">⚠️</span>
            </div>
            <p className="text-xs text-red-300 font-medium">{error}</p>
            <button
              onClick={() => router.push('/login')}
              className="px-4 py-2 rounded-full bg-electricTangerine text-black text-xs font-semibold hover:bg-electricTangerine-hover transition-colors"
            >
              Return to Login
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="w-8 h-8 border-2 border-electricTangerine border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs font-mono text-lemonChiffon/90">
              Completing GitHub authentication...
            </p>
            <p className="text-[11px] text-textMuted">
              Synchronizing contributor profile and security context
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-transparent text-textPrimary flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-electricTangerine border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <AuthCallbackInner />
    </Suspense>
  );
}
