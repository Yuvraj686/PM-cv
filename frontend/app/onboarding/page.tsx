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
      return <Loader2 className="w-4 h-4 text-[#E07A5F] animate-spin" />;
    if (usernameStatus === 'available')
      return <CheckCircle className="w-4 h-4 text-[#8DB88A]" />;
    if (usernameStatus === 'taken' || usernameStatus === 'invalid')
      return <XCircle className="w-4 h-4 text-[#c45f46]" />;
    return null;
  };

  const statusColor = () => {
    if (usernameStatus === 'available') return 'text-[#4a8a46]';
    if (usernameStatus === 'taken' || usernameStatus === 'invalid') return 'text-[#c45f46]';
    return 'text-[#8A8178]';
  };

  const inputBorder = () => {
    if (usernameStatus === 'available') return 'border-[#8DB88A] focus:ring-[#8DB88A]/20';
    if (usernameStatus === 'taken' || usernameStatus === 'invalid')
      return 'border-[#E07A5F]/60 focus:ring-[#E07A5F]/15';
    return 'border-[#E8E4DD] focus:border-[#E07A5F] focus:ring-[#E07A5F]/15';
  };

  const canSubmit = usernameStatus === 'available' && !submitting;

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ backgroundColor: '#F7F4EF', fontFamily: "'Inter', sans-serif" }}
    >
      {/* Subtle decorative blobs */}
      <div
        className="absolute top-0 left-1/4 w-[480px] h-[480px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, #FDEEE9 0%, transparent 70%)', opacity: 0.7 }}
      />
      <div
        className="absolute bottom-0 right-1/4 w-[380px] h-[380px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, #EDF4EC 0%, transparent 70%)', opacity: 0.6 }}
      />

      <div className="w-full max-w-md relative z-10">
        {/* Header */}
        <div className="text-center mb-8">
          {/* Icon */}
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#E07A5F] to-[#c45f46] mb-5 shadow-lg shadow-[#E07A5F]/20">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h1
            className="text-3xl font-bold text-[#1C1C1C] mb-2"
            style={{ fontFamily: "'Lora', Georgia, serif" }}
          >
            Welcome aboard! 🎉
          </h1>
          <p className="text-[#8A8178] text-base">
            Just a couple of details before you dive in.
          </p>
        </div>

        {/* Form card */}
        <div className="bg-white border border-[#E8E4DD] rounded-2xl p-8 shadow-[0_4px_24px_rgba(28,28,28,0.07)]">
          <form onSubmit={handleSubmit} className="space-y-6">

            {/* Username field */}
            <div>
              <label className="block text-sm font-medium text-[#1C1C1C] mb-2">
                Choose your username <span className="text-[#E07A5F]">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8A8178] font-medium select-none text-sm">@</span>
                <input
                  id="username-input"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_\-]/g, ''))}
                  placeholder="your_username"
                  maxLength={30}
                  required
                  className={`w-full pl-9 pr-10 py-3 rounded-xl bg-[#F7F4EF] border text-[#1C1C1C] placeholder-[#8A8178] text-sm transition-all outline-none focus:ring-2 ${inputBorder()}`}
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
              <p className="mt-1.5 text-xs text-[#8A8178]">
                This is how others will find and mention you on ProjectHub.
              </p>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-[#E8E4DD]" />
              <span className="text-xs text-[#8A8178] uppercase tracking-widest font-medium">Optional</span>
              <div className="flex-1 h-px bg-[#E8E4DD]" />
            </div>

            {/* GitHub username field */}
            <div>
              <label className="block text-sm font-medium text-[#1C1C1C] mb-2">
                GitHub username
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8A8178]">
                  <Github className="w-4 h-4" />
                </span>
                <input
                  id="github-input"
                  type="text"
                  value={githubHandle}
                  onChange={(e) => setGithubHandle(e.target.value)}
                  placeholder="octocat"
                  maxLength={39}
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#F7F4EF] border border-[#E8E4DD] text-[#1C1C1C] placeholder-[#8A8178] text-sm transition-all outline-none focus:ring-2 focus:border-[#E07A5F] focus:ring-[#E07A5F]/15"
                />
              </div>
              <p className="mt-1.5 text-xs text-[#8A8178]">
                Linking your GitHub lets ProjectHub pull commits and repos automatically.
              </p>
            </div>

            {/* Error message */}
            {error && (
              <div className="px-4 py-3.5 bg-[#FDEEE9] border border-[#E07A5F]/30 rounded-xl">
                <p className="text-[#c45f46] text-sm">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              id="onboarding-submit"
              type="submit"
              disabled={!canSubmit}
              className={`w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl font-semibold text-sm transition-all duration-200
                ${canSubmit
                  ? 'bg-[#1C1C1C] hover:bg-[#333] text-white shadow-sm hover:shadow-md hover:scale-[1.01] active:scale-100'
                  : 'bg-[#F0EDE8] text-[#8A8178] cursor-not-allowed border border-[#E8E4DD]'}`}
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
          <div className="w-2 h-2 rounded-full bg-[#E07A5F]" />
          <div className="w-6 h-1 rounded-full bg-[#E07A5F]" />
          <div className="w-2 h-2 rounded-full bg-[#E8E4DD]" />
        </div>
        <p className="text-center text-xs text-[#8A8178] mt-3">
          Step 1 of 1 — you can always change this later in settings.
        </p>
      </div>
    </div>
  );
}
