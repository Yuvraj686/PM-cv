'use client';

import { useState } from 'react';
import { Loader2, Mail } from 'lucide-react';

import { apiClient } from '@/lib/api-client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await apiClient.post('/api/auth/email/forgot-password', { email });
      setSubmittedEmail(email);
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Failed to send reset link');
    } finally {
      setLoading(false);
    }
  };

  const handleTryDifferent = () => {
    setSuccess(false);
    setEmail('');
    setError('');
  };

  if (success) {
    return (
      <div className="min-h-screen bg-[#0F1117] flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-[#1a1f2e] border border-white/10 rounded-2xl p-10 text-center">
            <div className="mb-6 flex justify-center">
              <div className="w-16 h-16 bg-indigo-600/10 rounded-full flex items-center justify-center">
                <Mail className="w-8 h-8 text-indigo-400" />
              </div>
            </div>

            <h2 className="text-2xl font-bold text-white mb-2">Check your inbox</h2>
            <p className="text-white/60 mb-6">
              If {submittedEmail} is registered, we sent a password reset link.
            </p>

            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 mb-6">
              <p className="text-blue-400 text-sm">Link expires in 1 hour.</p>
            </div>

            <button
              onClick={handleTryDifferent}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg transition mb-3"
            >
              Try a different email
            </button>

            <a href="/login" className="text-indigo-400 hover:text-indigo-300 text-sm">
              ← Back to login
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F1117] flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Forgot your password?</h1>
          <p className="text-white/60">Enter your email and we&apos;ll send a reset link.</p>
        </div>

        {/* Card */}
        <div className="bg-[#1a1f2e] border border-white/10 rounded-2xl p-10">
          {/* Error Banner */}
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                data-testid="forgot-email-input"
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-indigo-500/50"
              />
            </div>

            <button
              data-testid="forgot-submit-btn"
              type="submit"
              disabled={loading || !email}
              className="w-full mt-6 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white font-medium rounded-lg transition flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Send reset link
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-white/60 text-sm mt-6">
          <a href="/login" className="text-indigo-400 hover:text-indigo-300">
            ← Back to login
          </a>
        </p>
      </div>
    </div>
  );
}
