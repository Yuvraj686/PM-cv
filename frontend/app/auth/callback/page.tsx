'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState('');
  const [state, setState] = useState<'loading' | 'error'>('loading');

  useEffect(() => {
    const accessToken = searchParams.get('access_token');
    const refreshToken = searchParams.get('refresh_token');
    const errorParam = searchParams.get('error');

    if (errorParam) {
      let errorMessage = 'Sign-in failed. Please try again.';

      if (errorParam === 'google_failed') {
        errorMessage = 'Google sign-in failed. Please try again.';
      } else if (errorParam === 'github_failed') {
        errorMessage = 'GitHub sign-in failed. Please try again.';
      }

      setError(errorMessage);
      setState('error');
      return;
    }

    if (accessToken && refreshToken) {
      // Store tokens
      localStorage.setItem('access_token', accessToken);
      localStorage.setItem('refresh_token', refreshToken);
      document.cookie = `access_token=${accessToken}; path=/`;

      // Replace URL to remove tokens from history
      window.history.replaceState({}, '', '/auth/callback');

      // Redirect after 1 second
      const timer = setTimeout(() => {
        router.push('/dashboard');
      }, 1000);

      return () => clearTimeout(timer);
    } else if (!accessToken && !refreshToken && !errorParam) {
      // No tokens and no error means invalid callback
      setError('Sign-in failed. Please try again.');
      setState('error');
    }
  }, [searchParams, router]);

  if (state === 'error') {
    return (
      <div className="min-h-screen bg-[#0F1117] flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-[#1a1f2e] border border-white/10 rounded-2xl p-10 text-center">
            <h1 className="text-2xl font-bold text-white mb-4">Sign-in Error</h1>

            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-red-400">{error}</p>
            </div>

            <a
              href="/login"
              className="w-full block py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg transition"
            >
              Try again
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F1117] flex items-center justify-center p-4">
      <div className="text-center">
        <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mx-auto mb-4" />
        <p className="text-white text-lg">Signing you in...</p>
      </div>
    </div>
  );
}
