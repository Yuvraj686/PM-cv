'use client';

import { useEffect, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '@/lib/store';
import { apiClient } from '@/lib/api-client';

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState('');
  const [state, setState] = useState<'loading' | 'error'>('loading');
  const [countdown, setCountdown] = useState(3);
  const setTokens = useAuthStore((s) => s.setTokens);
  const setUser = useAuthStore((s) => s.setUser);
  const processed = useRef(false);
  const redirected = useRef(false);

  // ── Hard 3-second fallback ───────────────────────────────────────────
  // If the searchParams flow hasn't redirected within 3 s, read whatever
  // token is already in localStorage and push to dashboard.
  useEffect(() => {
    const tick = setInterval(() => {
      setCountdown((c) => Math.max(0, c - 1));
    }, 1000);

    const fallback = setTimeout(() => {
      clearInterval(tick);
      if (redirected.current) return;
      redirected.current = true;
      const token = localStorage.getItem('access_token');
      router.push(token ? '/dashboard' : '/login');
    }, 3000);

    return () => {
      clearInterval(tick);
      clearTimeout(fallback);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Guard: don't process more than once.
    // Using searchParams as a dep so the effect re-runs when Next.js
    // finishes hydrating the URL params. The ref prevents us from
    // re-processing after window.history.replaceState clears the URL.
    if (processed.current) return;

    const accessToken = searchParams.get('access_token');
    const refreshToken = searchParams.get('refresh_token');
    const errorParam = searchParams.get('error');
    const needsOnboarding = searchParams.get('needs_onboarding') === 'true';

    // searchParams not yet populated — wait for the next render
    if (!accessToken && !refreshToken && !errorParam) return;

    // Mark as processed NOW so replaceState-triggered re-renders are no-ops
    processed.current = true;

    if (errorParam) {
      let msg = 'Sign-in failed. Please try again.';
      if (errorParam === 'google_failed') msg = 'Google sign-in failed. Please try again.';
      else if (errorParam === 'github_failed') msg = 'GitHub sign-in failed. Please try again.';
      setError(msg);
      setState('error');
      return;
    }

    if (accessToken && refreshToken) {
      // Persist tokens
      localStorage.setItem('access_token', accessToken);
      localStorage.setItem('refresh_token', refreshToken);
      document.cookie = `access_token=${accessToken}; path=/`;
      setTokens(accessToken, refreshToken);

      // Fetch user profile
      apiClient.get('/api/users/me')
        .then((u) => { if (u) setUser(u); })
        .catch(() => {});

      // Clear tokens from browser history before navigating
      window.history.replaceState({}, '', '/auth/callback');

      // Redirect immediately (fallback timer is the safety net)
      if (!redirected.current) {
        redirected.current = true;
        router.push(needsOnboarding ? '/onboarding' : '/dashboard');
      }
    }
  }, [searchParams, router, setTokens, setUser]);

  if (state === 'error') {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{ background: 'var(--bloom-bg)' }}
      >
        {/* Decorative blob */}
        <div
          className="fixed top-0 right-0 w-96 h-96 rounded-full blur-3xl opacity-30 pointer-events-none"
          style={{ background: 'var(--bloom-coral-bg)', transform: 'translate(30%, -30%)' }}
        />

        <div className="bloom-card p-10 max-w-md w-full text-center relative z-10"
          style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
          {/* Brand */}
          <div className="flex items-center justify-center gap-2 mb-8">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white"
              style={{ background: 'var(--bloom-coral)' }}>P</div>
            <span className="font-serif text-xl font-bold" style={{ color: 'var(--bloom-text)' }}>ProjectHub</span>
          </div>

          <h1 className="font-serif text-2xl font-bold mb-3" style={{ color: 'var(--bloom-text)' }}>
            Sign-in Error
          </h1>

          <div className="mb-6 p-4 rounded-xl border"
            style={{ background: 'var(--bloom-coral-bg)', borderColor: 'var(--bloom-coral)' }}>
            <p className="text-sm font-medium" style={{ color: 'var(--bloom-coral)' }}>{error}</p>
          </div>

          <a
            href="/login"
            className="bloom-btn-primary w-full justify-center"
            style={{ display: 'inline-flex', padding: '11px 18px', fontSize: 15 }}
          >
            Try again
          </a>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'var(--bloom-bg)' }}
    >
      <div className="text-center">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5"
          style={{ background: 'var(--bloom-coral-bg)' }}
        >
          <Loader2 className="w-7 h-7 animate-spin" style={{ color: 'var(--bloom-coral)' }} />
        </div>
        <p className="font-serif text-lg font-semibold" style={{ color: 'var(--bloom-text)' }}>
          Setting up your account…
        </p>
        <p className="text-sm mt-1" style={{ color: 'var(--bloom-muted)' }}>
          Redirecting in {countdown}s…
        </p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bloom-bg)' }}>
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--bloom-coral)' }} />
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
