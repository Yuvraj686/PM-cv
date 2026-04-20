'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, CheckCircle2 } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function VerifyEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [errorType, setErrorType] = useState<'invalid' | 'expired' | 'unknown'>('unknown');
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    const token = searchParams.get('token');

    if (!token) {
      setState('error');
      setErrorMessage('Invalid verification link');
      setErrorType('invalid');
      return;
    }

    // Verify email
    const verifyEmail = async () => {
      try {
        const response = await fetch(`${API_URL}/api/auth/email/verify-email?token=${token}`, {
          method: 'GET',
        });

        if (response.ok) {
          setState('success');
        } else {
          const data = await response.json();
          const detail = data.detail || 'Verification failed';

          if (detail.includes('expired')) {
            setErrorType('expired');
            setErrorMessage('Link expired');
          } else if (detail.includes('invalid')) {
            setErrorType('invalid');
            setErrorMessage('Invalid verification link');
          } else {
            setErrorType('unknown');
            setErrorMessage('An error occurred during verification');
          }

          setState('error');
        }
      } catch (err) {
        setState('error');
        setErrorType('unknown');
        setErrorMessage('An error occurred. Please contact support.');
      }
    };

    verifyEmail();
  }, [searchParams]);

  // Countdown timer for redirect
  useEffect(() => {
    if (state === 'success') {
      if (countdown > 0) {
        const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
        return () => clearTimeout(timer);
      } else {
        router.push('/dashboard');
      }
    }
  }, [state, countdown, router]);

  const handleResendEmail = async () => {
    const email = localStorage.getItem('registration_email');
    if (!email) {
      setErrorMessage('Email not found. Please register again.');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/auth/email/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (response.ok) {
        setErrorMessage('Verification email sent! Check your inbox.');
      } else {
        const data = await response.json();
        setErrorMessage(data.detail || 'Failed to resend verification email');
      }
    } catch (err) {
      setErrorMessage('An error occurred. Please try again.');
    }
  };

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-[#0F1117] flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mx-auto mb-4" />
          <p className="text-white text-lg">Verifying your email...</p>
        </div>
      </div>
    );
  }

  if (state === 'success') {
    return (
      <div className="min-h-screen bg-[#0F1117] flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="mb-6 flex justify-center">
            <svg
              className="w-16 h-16 text-green-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                animation: 'drawCheckmark 0.8s ease-in-out forwards',
              }}
            >
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <style>{`
              @keyframes drawCheckmark {
                to {
                  stroke-dashoffset: 0;
                }
                from {
                  stroke-dashoffset: 56;
                }
              }
              svg {
                stroke-dasharray: 56;
                stroke-dashoffset: 56;
              }
            `}</style>
          </div>

          <h1 className="text-3xl font-bold text-white mb-2">Email verified!</h1>
          <p className="text-white/60 mb-6">Your account is now active.</p>

          <p className="text-white/40 mb-8">
            Redirecting to dashboard in {countdown} second{countdown !== 1 ? 's' : ''}...
          </p>

          <button
            onClick={() => router.push('/dashboard')}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg transition"
          >
            Go to Dashboard now
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F1117] flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-[#1a1f2e] border border-white/10 rounded-2xl p-10 text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Verification Error</h1>

          <div className="my-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-red-400">{errorMessage}</p>
          </div>

          {errorType === 'expired' && (
            <button
              onClick={handleResendEmail}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg transition mb-3"
            >
              Resend verification email
            </button>
          )}

          {errorType === 'invalid' && (
            <a
              href="/register"
              className="block w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg transition text-center mb-3"
            >
              Create new account
            </a>
          )}

          {errorType === 'unknown' && (
            <a
              href="/register"
              className="block w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg transition text-center mb-3"
            >
              Contact support
            </a>
          )}

          <a href="/login" className="text-indigo-400 hover:text-indigo-300 text-sm">
            ← Back to login
          </a>
        </div>
      </div>
    </div>
  );
}
