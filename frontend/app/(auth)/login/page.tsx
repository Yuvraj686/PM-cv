'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Phone, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/lib/store';
import { motion } from 'framer-motion';
import { apiClient } from '@/lib/api-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function LoginPage() {
  const router = useRouter();
  const setTokens = useAuthStore((s) => s.setTokens);
  const setUser = useAuthStore((s) => s.setUser);
  const [activeTab, setActiveTab] = useState('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [errorType, setErrorType] = useState<'default' | 'verify-email' | 'deactivated'>('default');
  const [showPassword, setShowPassword] = useState(false);

  // Email form state
  const [emailForm, setEmailForm] = useState({ email: '', password: '' });

  // Phone form state
  const [phoneForm, setPhoneForm] = useState({ countryCode: '+91', phone: '' });
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [countdown, setCountdown] = useState(0);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setErrorType('default'); setLoading(true);
    try {
      const data = await apiClient.post('/api/auth/email/login', {
        email: emailForm.email,
        password: emailForm.password,
      }, { skipAuth: true });

      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);
      document.cookie = `access_token=${data.access_token}; path=/`;
      setTokens(data.access_token, data.refresh_token);

      try {
        const user = await apiClient.get('/api/users/me');
        setUser(user);
      } catch {}

      router.push('/dashboard');
    } catch (err: any) {
      const detail = err.message || 'Invalid email or password';
      if (detail.includes('not registered')) {
        router.push(`/register?error=not_registered&email=${encodeURIComponent(emailForm.email)}`);
        return;
      } else if (detail.includes('verify')) {
        setError('Please verify your email first'); setErrorType('verify-email');
      } else if (detail.includes('deactivated')) {
        setError('Account deactivated'); setErrorType('deactivated');
      } else {
        setError(detail); setErrorType('default');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setErrorType('default'); setLoading(true);
    try {
      await apiClient.post('/api/auth/phone/send-otp', {
        phone_number: `${phoneForm.countryCode}${phoneForm.phone}`,
      }, { skipAuth: true });
      setOtpSent(true); setCountdown(60); setOtp(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
    } catch (err: any) {
      setError(err.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp]; newOtp[index] = value.slice(-1); setOtp(newOtp);
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) otpRefs.current[index - 1]?.focus();
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const paste = e.clipboardData.getData('text');
    const digits = paste.replace(/\D/g, '').slice(0, 6).split('');
    if (digits.length > 0) {
      e.preventDefault();
      const newOtp = [...otp]; digits.forEach((d, i) => { if (i < 6) newOtp[i] = d; });
      setOtp(newOtp);
      if (digits.length === 6) otpRefs.current[5]?.focus();
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setErrorType('default'); setLoading(true);
    const otpCode = otp.join('');
    if (otpCode.length !== 6) { setError('Please enter all 6 digits'); setLoading(false); return; }
    try {
      const data = await apiClient.post('/api/auth/phone/verify-otp', {
        phone_number: `${phoneForm.countryCode}${phoneForm.phone}`,
        otp: otpCode,
      }, { skipAuth: true });

      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);
      document.cookie = `access_token=${data.access_token}; path=/`;
      setTokens(data.access_token, data.refresh_token);

      try {
        const user = await apiClient.get('/api/users/me');
        setUser(user);
      } catch {}

      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Invalid OTP');
      setOtp(['', '', '', '', '', '']); otpRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setError(''); setLoading(true);
    try {
      await apiClient.post('/api/auth/phone/resend-otp', {
        phone_number: `${phoneForm.countryCode}${phoneForm.phone}`,
      }, { skipAuth: true });
      setCountdown(60); setOtp(['', '', '', '', '', '']); otpRefs.current[0]?.focus();
    } catch (err: any) {
      setError(err.message || 'Failed to resend OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerificationEmail = async () => {
    setError(''); setLoading(true);
    try {
      await apiClient.post('/api/auth/email/resend-verification', {
        email: emailForm.email,
      }, { skipAuth: true });
      setError('Verification email sent!');
    } catch (err: any) {
      setError(err.message || 'Failed to resend email');
    } finally {
      setLoading(false);
    }
  };

  /* ─── Google SVG ─── */
  const GoogleIcon = () => (
    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
      <path fill="#E07A5F" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#8DB88A" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#C9A84C" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#9B8EC4" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );

  /* ─── GitHub SVG ─── */
  const GitHubIcon = () => (
    <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--bloom-text)' }}>
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
    </svg>
  );

  /* ─── Social button base style ─── */
  const socialBtn =
    'w-full flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl text-sm font-medium transition-all cursor-pointer border border-[var(--bloom-border)] bg-[var(--bloom-surface)] hover:bg-[var(--bloom-bg)] hover:shadow-sm';

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'var(--bloom-bg)' }}
    >
      {/* Decorative blobs */}
      <div
        className="fixed top-0 right-0 w-96 h-96 rounded-full blur-3xl opacity-30 pointer-events-none"
        style={{ background: 'var(--bloom-coral-bg)', transform: 'translate(30%, -30%)' }}
      />
      <div
        className="fixed bottom-0 left-0 w-96 h-96 rounded-full blur-3xl opacity-30 pointer-events-none"
        style={{ background: 'var(--bloom-green-bg)', transform: 'translate(-30%, 30%)' }}
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-md w-full relative z-10"
      >
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center gap-2 mb-5">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white text-base"
              style={{ background: 'var(--bloom-coral)' }}
            >
              P
            </div>
            <span
              className="font-serif text-xl font-bold"
              style={{ color: 'var(--bloom-text)' }}
            >
              ProjectHub
            </span>
          </div>
          <h1 className="font-serif text-3xl font-bold mb-1.5" style={{ color: 'var(--bloom-text)' }}>
            Welcome back
          </h1>
          <p className="text-sm" style={{ color: 'var(--bloom-muted)' }}>
            Sign in to continue to your workspace
          </p>
        </div>

        {/* Error banners */}
        {error && errorType === 'verify-email' && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="mb-4 p-3 rounded-xl text-sm border"
            style={{ background: 'var(--bloom-yellow-bg)', borderColor: 'var(--bloom-yellow)', color: '#9b7a28' }}
          >
            <p className="mb-1.5">{error}</p>
            <button
              data-testid="resend-from-login-btn"
              onClick={handleResendVerificationEmail}
              className="text-xs font-semibold underline underline-offset-2 cursor-pointer"
              style={{ color: 'var(--bloom-yellow)' }}
            >
              Resend verification email
            </button>
          </motion.div>
        )}
        {error && errorType === 'deactivated' && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="mb-4 p-3 rounded-xl text-sm border"
            style={{ background: 'var(--bloom-coral-bg)', borderColor: 'var(--bloom-coral)', color: 'var(--bloom-coral)' }}
          >
            {error}
          </motion.div>
        )}
        {error && errorType === 'default' && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="mb-4 p-3 rounded-xl text-sm border"
            style={{ background: 'var(--bloom-coral-bg)', borderColor: 'var(--bloom-coral)', color: 'var(--bloom-coral)' }}
          >
            {error}
          </motion.div>
        )}

        {/* Card */}
        <div className="bloom-card p-8" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>

          {/* Social buttons */}
          <div className="space-y-2.5 mb-6">
            <button
              data-testid="google-login-btn"
              onClick={() => (window.location.href = `${API_URL}/api/auth/google`)}
              className={socialBtn}
              style={{ color: 'var(--bloom-text)' }}
            >
              <GoogleIcon />
              Continue with Google
            </button>

            <button
              data-testid="github-login-btn"
              onClick={() => (window.location.href = `${API_URL}/api/auth/github`)}
              className={socialBtn}
              style={{ color: 'var(--bloom-text)' }}
            >
              <GitHubIcon />
              Continue with GitHub
            </button>

            <button
              data-testid="phone-login-btn"
              onClick={() => { setActiveTab('phone'); setOtpSent(false); }}
              className={socialBtn}
              style={{
                color: activeTab === 'phone' ? 'var(--bloom-coral)' : 'var(--bloom-text)',
                borderColor: activeTab === 'phone' ? 'var(--bloom-coral)' : 'var(--bloom-border)',
                background: activeTab === 'phone' ? 'var(--bloom-coral-bg)' : 'var(--bloom-surface)',
              }}
            >
              <Phone className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
              Continue with Phone
            </button>
          </div>

          {/* Divider */}
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t" style={{ borderColor: 'var(--bloom-border)' }} />
            </div>
            <div className="relative flex justify-center">
              <span
                className="px-3 text-xs font-medium uppercase tracking-wider"
                style={{ background: 'var(--bloom-surface)', color: 'var(--bloom-muted)' }}
              >
                or sign in with email
              </span>
            </div>
          </div>

          {/* Email Form */}
          {activeTab === 'email' && (
            <form onSubmit={handleEmailLogin} className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--bloom-muted)' }}>
                  Email address
                </label>
                <input
                  data-testid="login-email-input"
                  type="email"
                  placeholder="you@example.com"
                  value={emailForm.email}
                  onChange={(e) => setEmailForm({ ...emailForm, email: e.target.value })}
                  required
                  className="bloom-input w-full"
                  style={{ padding: '10px 14px' }}
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--bloom-muted)' }}>
                  Password
                </label>
                <div className="relative">
                  <input
                    data-testid="login-password-input"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Your password"
                    value={emailForm.password}
                    onChange={(e) => setEmailForm({ ...emailForm, password: e.target.value })}
                    required
                    className="bloom-input w-full"
                    style={{ padding: '10px 40px 10px 14px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer"
                    style={{ color: 'var(--bloom-muted)' }}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="flex justify-end mt-1.5">
                  <a
                    href="/forgot-password"
                    className="text-xs font-medium transition-opacity hover:opacity-70"
                    style={{ color: 'var(--bloom-coral)' }}
                  >
                    Forgot password?
                  </a>
                </div>
              </div>

              <button
                data-testid="login-btn"
                type="submit"
                disabled={loading}
                className="bloom-btn-primary w-full justify-center mt-2"
                style={{ padding: '11px 18px', fontSize: 15, opacity: loading ? 0.7 : 1 }}
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Sign in
              </button>
            </form>
          )}

          {/* Phone Form — Step 1 */}
          {activeTab === 'phone' && !otpSent && (
            <form onSubmit={handleSendOtp} className="space-y-3">
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--bloom-muted)' }}>
                Phone number
              </label>
              <div className="flex gap-2">
                <select
                  value={phoneForm.countryCode}
                  onChange={(e) => setPhoneForm({ ...phoneForm, countryCode: e.target.value })}
                  className="bloom-input"
                  style={{ padding: '10px 10px' }}
                >
                  <option value="+91">+91 India</option>
                  <option value="+1">+1 US</option>
                  <option value="+44">+44 UK</option>
                  <option value="+61">+61 Australia</option>
                  <option value="+971">+971 UAE</option>
                  <option value="+65">+65 Singapore</option>
                </select>
                <input
                  data-testid="phone-input"
                  type="tel"
                  placeholder="Phone number"
                  value={phoneForm.phone}
                  onChange={(e) => setPhoneForm({ ...phoneForm, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                  required
                  className="bloom-input flex-1"
                  style={{ padding: '10px 14px' }}
                />
              </div>
              <button
                data-testid="send-otp-btn"
                type="submit"
                disabled={loading || !phoneForm.phone}
                className="bloom-btn-primary w-full justify-center mt-2"
                style={{ padding: '11px 18px', fontSize: 15, opacity: loading || !phoneForm.phone ? 0.6 : 1 }}
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Send OTP
              </button>
            </form>
          )}

          {/* Phone Form — Step 2 */}
          {activeTab === 'phone' && otpSent && (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <p className="text-sm font-medium" style={{ color: 'var(--bloom-green)' }}>
                OTP sent to {phoneForm.countryCode}***{phoneForm.phone.slice(-4)}
              </p>

              <div>
                <label className="block text-xs font-medium mb-3" style={{ color: 'var(--bloom-muted)' }}>
                  Enter 6-digit code
                </label>
                <div className="flex justify-center gap-2">
                  {otp.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => { otpRefs.current[index] = el; }}
                      data-testid={`otp-box-${index}`}
                      type="text"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(index, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(index, e)}
                      onPaste={handleOtpPaste}
                      className="w-11 h-12 text-center rounded-xl text-lg font-bold transition-colors"
                      style={{
                        background: 'var(--bloom-bg)',
                        border: `2px solid ${digit ? 'var(--bloom-coral)' : 'var(--bloom-border)'}`,
                        color: 'var(--bloom-text)',
                        outline: 'none',
                      }}
                    />
                  ))}
                </div>
              </div>

              <div className="text-center text-sm">
                {countdown > 0 ? (
                  <p style={{ color: 'var(--bloom-muted)' }}>
                    Resend in 00:{countdown.toString().padStart(2, '0')}
                  </p>
                ) : (
                  <button
                    data-testid="resend-otp-btn"
                    type="button"
                    onClick={handleResendOtp}
                    disabled={loading}
                    className="font-medium underline underline-offset-2 transition-opacity hover:opacity-70"
                    style={{ color: 'var(--bloom-coral)' }}
                  >
                    Resend OTP
                  </button>
                )}
              </div>

              <button
                data-testid="verify-otp-btn"
                type="submit"
                disabled={loading || otp.join('').length !== 6}
                className="bloom-btn-primary w-full justify-center"
                style={{ padding: '11px 18px', fontSize: 15, opacity: loading || otp.join('').length !== 6 ? 0.6 : 1 }}
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Sign in
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-sm mt-5" style={{ color: 'var(--bloom-muted)' }}>
          Don&apos;t have an account?{' '}
          <a
            href="/register"
            className="font-semibold transition-opacity hover:opacity-70"
            style={{ color: 'var(--bloom-coral)' }}
          >
            Sign up
          </a>
        </p>
      </motion.div>
    </div>
  );
}
