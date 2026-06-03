'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, XCircle, Loader2, Github, ArrowRight, Sparkles } from 'lucide-react';

import { apiClient } from '@/lib/api-client';

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

export default function OnboardingPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [githubHandle, setGithubHandle] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const [usernameMessage, setUsernameMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [checkTimer, setCheckTimer] = useState<NodeJS.Timeout | null>(null);

  // Debounced username availability check
  const checkUsername = useCallback(
    (value: string) => {
      if (checkTimer) clearTimeout(checkTimer);

      if (!value || value.length < 3) {
        setUsernameStatus('idle');
        setUsernameMessage('');
        return;
      }

      setUsernameStatus('checking');
      const timer = setTimeout(async () => {
        try {
          const data = await apiClient.get(
            `/api/users/check-username?username=${encodeURIComponent(value)}`
          );

          if (data.reason === 'invalid_format') {
            setUsernameStatus('invalid');
            setUsernameMessage('Only letters, numbers, _ and - allowed (3–30 chars)');
          } else if (data.available) {
            setUsernameStatus('available');
            setUsernameMessage('@' + value + ' is available!');
          } else {
            setUsernameStatus('taken');
            setUsernameMessage('That username is already taken');
          }
        } catch {
          setUsernameStatus('idle');
        }
      }, 500);

      setCheckTimer(timer);
    },
    [checkTimer]
  );

  useEffect(() => {
    checkUsername(username);
    return () => {
      if (checkTimer) clearTimeout(checkTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (usernameStatus !== 'available') return;

    setSubmitting(true);
    setError('');

    try {
      await apiClient.post('/api/users/me/onboarding', {
        username: username.trim().toLowerCase(),
        github_username: githubHandle.trim() || null,
      });
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const statusIcon = () => {
    if (usernameStatus === 'checking')
      return <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />;
    if (usernameStatus === 'available')
      return <CheckCircle className="w-4 h-4 text-emerald-400" />;
    if (usernameStatus === 'taken' || usernameStatus === 'invalid')
      return <XCircle className="w-4 h-4 text-red-400" />;
    return null;
  };

  const statusColor = () => {
    if (usernameStatus === 'available') return 'text-emerald-400';
    if (usernameStatus === 'taken' || usernameStatus === 'invalid') return 'text-red-400';
    return 'text-slate-400';
  };

  const canSubmit = usernameStatus === 'available' && !submitting;

  return (
    <div className="min-h-screen bg-[#0a0d14] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient glow blobs */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-violet-600/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Header card */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 mb-5 shadow-lg shadow-indigo-500/30">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Welcome aboard! 🎉</h1>
          <p className="text-slate-400 text-base">
            Just a couple of details before you dive in.
          </p>
        </div>

        {/* Form card */}
        <div className="bg-[#13172a]/80 border border-white/[0.08] rounded-2xl p-8 shadow-2xl backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="space-y-6">

            {/* Username field */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Choose your username <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 font-medium select-none">@</span>
                <input
                  id="username-input"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_\-]/g, ''))}
                  placeholder="your_username"
                  maxLength={30}
                  required
                  className={`w-full pl-9 pr-10 py-3 rounded-xl bg-[#0f1220] border text-white placeholder-slate-600 text-sm transition-all outline-none focus:ring-2
                    ${usernameStatus === 'available' ? 'border-emerald-500/50 focus:ring-emerald-500/20' :
                      usernameStatus === 'taken' || usernameStatus === 'invalid' ? 'border-red-500/50 focus:ring-red-500/20' :
                      'border-white/10 focus:ring-indigo-500/30 focus:border-indigo-500/50'}`}
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2">
                  {statusIcon()}
                </span>
              </div>
              {usernameMessage && (
                <p className={`mt-2 text-xs flex items-center gap-1 ${statusColor()}`}>
                  {usernameMessage}
                </p>
              )}
              <p className="mt-1.5 text-xs text-slate-600">
                This is how others will find and mention you on ProjectHub.
              </p>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-white/[0.06]" />
              <span className="text-xs text-slate-600 uppercase tracking-widest">Optional</span>
              <div className="flex-1 h-px bg-white/[0.06]" />
            </div>

            {/* GitHub username field */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                GitHub username
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">
                  <Github className="w-4 h-4" />
                </span>
                <input
                  id="github-input"
                  type="text"
                  value={githubHandle}
                  onChange={(e) => setGithubHandle(e.target.value)}
                  placeholder="octocat"
                  maxLength={39}
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#0f1220] border border-white/10 text-white placeholder-slate-600 text-sm transition-all outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/50"
                />
              </div>
              <p className="mt-1.5 text-xs text-slate-600">
                Linking your GitHub lets ProjectHub pull commits and repos automatically.
              </p>
            </div>

            {/* Error message */}
            {error && (
              <div className="p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              id="onboarding-submit"
              type="submit"
              disabled={!canSubmit}
              className={`w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl font-semibold text-sm transition-all duration-200
                ${canSubmit
                  ? 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:scale-[1.01] active:scale-100'
                  : 'bg-white/5 text-slate-600 cursor-not-allowed border border-white/5'}`}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Setting up…
                </>
              ) : (
                <>
                  Go to Dashboard
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mt-6">
          <div className="w-2 h-2 rounded-full bg-indigo-500" />
          <div className="w-6 h-1 rounded-full bg-indigo-500" />
          <div className="w-2 h-2 rounded-full bg-white/20" />
        </div>
        <p className="text-center text-xs text-slate-600 mt-3">Step 1 of 1 — you can always change this later in settings.</p>
      </div>
    </div>
  );
}
