'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Eye, EyeOff, CheckCircle2 } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [state, setState] = useState<'form' | 'success' | 'error'>('form');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [form, setForm] = useState({
    password: '',
    confirmPassword: '',
  });

  const [passwordStrength, setPasswordStrength] = useState(0);
  const [passwordsMatch, setPasswordsMatch] = useState(true);

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      router.push('/forgot-password');
    }
  }, [searchParams, router]);

  // Calculate password strength
  useEffect(() => {
    const pwd = form.password;
    let strength = 0;
    if (pwd.length >= 8) strength = 1;
    if (pwd.length >= 8 && /[A-Z]/.test(pwd)) strength = 2;
    if (pwd.length >= 8 && /[A-Z]/.test(pwd) && /\d/.test(pwd)) strength = 3;
    if (pwd.length >= 8 && /[A-Z]/.test(pwd) && /\d/.test(pwd) && /[!@#$%^&*]/.test(pwd)) strength = 4;
    setPasswordStrength(strength);
  }, [form.password]);

  // Check if passwords match
  useEffect(() => {
    if (form.confirmPassword) {
      setPasswordsMatch(form.password === form.confirmPassword);
    }
  }, [form.password, form.confirmPassword]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const token = searchParams.get('token');

    if (!passwordsMatch) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (passwordStrength < 3) {
      setError('Password is not strong enough');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/auth/email/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          new_password: form.password,
        }),
      });

      if (response.ok) {
        setState('success');
      } else {
        const data = await response.json();
        const detail = data.detail || 'Failed to reset password';

        if (detail.includes('invalid') || detail.includes('expired')) {
          setState('error');
          setError('Invalid or expired reset link');
        } else {
          setError(detail);
        }
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (state === 'success') {
    return (
      <div className="min-h-screen bg-[#0F1117] flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="mb-6 flex justify-center">
            <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            </div>
          </div>

          <h1 className="text-3xl font-bold text-white mb-2">Password reset successfully!</h1>
          <p className="text-white/60 mb-8">You can now log in with your new password.</p>

          <a
            href="/login"
            className="w-full block py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg transition"
          >
            Go to login
          </a>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen bg-[#0F1117] flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-[#1a1f2e] border border-white/10 rounded-2xl p-10 text-center">
            <h1 className="text-2xl font-bold text-white mb-4">Reset Error</h1>

            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-red-400">{error}</p>
            </div>

            <a
              href="/forgot-password"
              className="w-full block py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg transition"
            >
              Request new reset link
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
          <h1 className="text-3xl font-bold text-white mb-2">Set a new password</h1>
          <p className="text-white/60">Enter a strong password for your account.</p>
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
            {/* New Password */}
            <div>
              <div className="relative mb-2">
                <input
                  data-testid="new-password-input"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="New password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-indigo-500/50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-white/40 hover:text-white/60"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>

              {/* Password Strength Bar */}
              <div className="flex gap-1 mb-2">
                {[1, 2, 3, 4].map((seg) => (
                  <div
                    key={seg}
                    className={`h-1 flex-1 rounded-full transition ${
                      seg <= passwordStrength
                        ? seg === 1
                          ? 'bg-red-500'
                          : seg === 2
                          ? 'bg-amber-500'
                          : seg === 3
                          ? 'bg-yellow-500'
                          : 'bg-green-500'
                        : 'bg-white/10'
                    }`}
                  />
                ))}
              </div>
              <p className="text-xs text-white/40">
                {passwordStrength === 0 && 'Weak (8+ characters)'}
                {passwordStrength === 1 && 'Fair (add uppercase & numbers)'}
                {passwordStrength === 2 && 'Good (add special characters)'}
                {passwordStrength === 3 && 'Good (add special characters)'}
                {passwordStrength === 4 && 'Strong'}
              </p>
            </div>

            {/* Confirm Password */}
            <div>
              <div className="relative mb-2">
                <input
                  data-testid="confirm-password-input"
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="Confirm password"
                  value={form.confirmPassword}
                  onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                  required
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-indigo-500/50"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-2.5 text-white/40 hover:text-white/60"
                >
                  {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>

              {/* Match indicator */}
              {form.confirmPassword && (
                <p
                  className={`text-xs ${
                    passwordsMatch ? 'text-green-400' : 'text-red-400'
                  }`}
                >
                  {passwordsMatch ? 'Passwords match ✓' : 'Passwords do not match'}
                </p>
              )}
            </div>

            <button
              data-testid="reset-submit-btn"
              type="submit"
              disabled={
                loading ||
                !form.password ||
                !form.confirmPassword ||
                !passwordsMatch ||
                passwordStrength < 3
              }
              className="w-full mt-6 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white font-medium rounded-lg transition flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Reset password
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
