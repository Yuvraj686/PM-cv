'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error to Sentry
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0F1117] text-white p-6">
      <div className="max-w-md w-full text-center space-y-6 bg-[#161B22] p-8 rounded-2xl border border-[#30363D] shadow-2xl relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/10 via-transparent to-transparent pointer-events-none" />
        
        <div className="mx-auto w-16 h-16 bg-red-500/10 text-red-500 flex items-center justify-center rounded-full animate-bounce">
          <AlertTriangle size={32} />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Something went wrong</h1>
          <p className="text-[#8B949E] text-sm">
            We encountered an unexpected error on our end. Sentry has been notified.
          </p>
          {error.digest && (
            <p className="text-xs text-[#58A6FF] font-mono select-all mt-1">
              Error ID: {error.digest}
            </p>
          )}
        </div>

        <div className="flex gap-4 justify-center">
          <button
            onClick={() => reset()}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#6366F1] hover:bg-[#4f46e5] active:bg-[#4338ca] transition rounded-xl text-sm font-semibold text-white shadow-md focus:outline-none"
          >
            <RefreshCw size={16} />
            Try again
          </button>
          
          <Link
            href="/dashboard"
            className="flex items-center gap-2 px-5 py-2.5 bg-[#21262D] hover:bg-[#30363D] transition border border-[#30363D] rounded-xl text-sm font-semibold text-white"
          >
            <Home size={16} />
            Back Home
          </Link>
        </div>
      </div>
    </div>
  );
}
