'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Phone, Eye, EyeOff, Loader2, MailIcon } from 'lucide-react';
import { motion } from 'framer-motion';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const GoogleIcon = () => (
  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
    <path fill="#E07A5F" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#8DB88A" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#C9A84C" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#9B8EC4" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

const GitHubIcon = () => (
  <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
  </svg>
);

const socialBtn =
  'w-full flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl text-sm font-medium transition-all cursor-pointer border border-[var(--bloom-border)] bg-[var(--bloom-surface)] hover:bg-[var(--bloom-bg)] hover:shadow-sm';

const strengthColors = ['', '#E07A5F', '#C9A84C', '#8DB88A', '#8DB88A'];
const strengthLabels = ['', 'Weak — add uppercase & numbers', 'Fair — add a number', 'Good — add a special character', 'Strong password'];

function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailForm, setEmailForm] = useState({ name: '', email: '', password: '' });
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [phoneForm, setPhoneForm] = useState({ name: '', countryCode: '+91', phone: '' });
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [countdown, setCountdown] = useState(0);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const errorParam = searchParams.get('error');
    const emailParam = searchParams.get('email');
    if (errorParam === 'not_registered' && emailParam) {
      setError(`The email ${emailParam} is not registered. Please sign up.`);
      setEmailForm(prev => ({ ...prev, email: emailParam }));
    }
  }, [searchParams]);

  useEffect(() => {
    const pwd = emailForm.password;
    let s = 0;
    if (pwd.length >= 8) s = 1;
    if (s === 1 && /[A-Z]/.test(pwd)) s = 2;
    if (s === 2 && /\d/.test(pwd)) s = 3;
    if (s === 3 && /[!@#$%^&*]/.test(pwd)) s = 4;
    setPasswordStrength(s);
  }, [emailForm.password]);

  useEffect(() => {
    if (countdown > 0) {
      const t = setTimeout(() => setCountdown(c => c - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [countdown]);

  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/email/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: emailForm.name, email: emailForm.email, password: emailForm.password }),
      });
      if (res.ok) { setVerificationEmail(emailForm.email); setRegistrationSuccess(true); }
      else { const d = await res.json(); setError(d.detail || 'Registration failed'); }
    } catch (err) { setError(`An error occurred: ${err instanceof Error ? err.message : 'Unknown error'}`); }
    finally { setLoading(false); }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/phone/send-otp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: `${phoneForm.countryCode}${phoneForm.phone}`, name: phoneForm.name }),
      });
      if (res.ok) { setOtpSent(true); setCountdown(60); setOtp(['', '', '', '', '', '']); otpRefs.current[0]?.focus(); }
      else { const d = await res.json(); setError(d.detail || 'Failed to send OTP'); }
    } catch { setError('An error occurred. Please try again.'); }
    finally { setLoading(false); }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const n = [...otp]; n[index] = value.slice(-1); setOtp(n);
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
  };
  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) otpRefs.current[index - 1]?.focus();
  };
  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6).split('');
    if (digits.length > 0) {
      e.preventDefault();
      const n = [...otp]; digits.forEach((d, i) => { if (i < 6) n[i] = d; }); setOtp(n);
      if (digits.length === 6) otpRefs.current[5]?.focus();
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    const otpCode = otp.join('');
    if (otpCode.length !== 6) { setError('Please enter all 6 digits'); setLoading(false); return; }
    try {
      const res = await fetch(`${API_URL}/api/auth/phone/verify-otp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: `${phoneForm.countryCode}${phoneForm.phone}`, otp: otpCode }),
      });
      if (res.ok) { const d = await res.json(); localStorage.setItem('token', d.access_token); router.push('/dashboard'); }
      else { const d = await res.json(); setError(d.detail || 'Invalid OTP'); setOtp(['', '', '', '', '', '']); otpRefs.current[0]?.focus(); }
    } catch { setError('An error occurred. Please try again.'); }
    finally { setLoading(false); }
  };

  const handleResendOtp = async () => {
    setError(''); setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/phone/resend-otp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: `${phoneForm.countryCode}${phoneForm.phone}` }),
      });
      if (res.ok) { setCountdown(60); setOtp(['', '', '', '', '', '']); otpRefs.current[0]?.focus(); }
      else { const d = await res.json(); setError(d.detail || 'Failed to resend OTP'); }
    } catch { setError('An error occurred. Please try again.'); }
    finally { setLoading(false); }
  };

  const handleResendEmail = async () => {
    setError(''); setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/email/resend-verification`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: verificationEmail }),
      });
      if (res.ok) setError('Verification email sent!');
      else { const d = await res.json(); setError(d.detail || 'Failed to resend email'); }
    } catch { setError('An error occurred. Please try again.'); }
    finally { setLoading(false); }
  };

  /* ── Success screen ── */
  if (registrationSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bloom-bg)' }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          className="bloom-card p-10 max-w-md w-full text-center"
          style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}
        >
          <div className="mb-6 flex justify-center">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: 'var(--bloom-coral-bg)' }}
            >
              <MailIcon className="w-8 h-8" style={{ color: 'var(--bloom-coral)' }} />
            </div>
          </div>
          <h2 className="font-serif text-2xl font-bold mb-2" style={{ color: 'var(--bloom-text)' }}>
            Check your inbox
          </h2>
          <p className="text-sm mb-6" style={{ color: 'var(--bloom-muted)' }}>
            We sent a verification link to <span className="font-semibold" style={{ color: 'var(--bloom-text)' }}>{verificationEmail}</span>
          </p>
          <button
            onClick={handleResendEmail}
            data-testid="resend-email-link"
            className="text-sm font-semibold underline underline-offset-2 transition-opacity hover:opacity-70 mb-5 block mx-auto"
            style={{ color: 'var(--bloom-coral)' }}
          >
            Didn&apos;t get it? Resend email
          </button>
          <button
            onClick={() => setRegistrationSuccess(false)}
            className="text-sm transition-opacity hover:opacity-70"
            style={{ color: 'var(--bloom-muted)' }}
          >
            Wrong email? Go back
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bloom-bg)' }}>
      {/* Decorative blobs */}
      <div className="fixed top-0 right-0 w-96 h-96 rounded-full blur-3xl opacity-30 pointer-events-none"
        style={{ background: 'var(--bloom-purple-bg)', transform: 'translate(30%, -30%)' }} />
      <div className="fixed bottom-0 left-0 w-96 h-96 rounded-full blur-3xl opacity-30 pointer-events-none"
        style={{ background: 'var(--bloom-coral-bg)', transform: 'translate(-30%, 30%)' }} />

      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        className="max-w-md w-full relative z-10"
      >
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center gap-2 mb-5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white text-base"
              style={{ background: 'var(--bloom-coral)' }}>P</div>
            <span className="font-serif text-xl font-bold" style={{ color: 'var(--bloom-text)' }}>ProjectHub</span>
          </div>
          <h1 className="font-serif text-3xl font-bold mb-1.5" style={{ color: 'var(--bloom-text)' }}>
            Create your account
          </h1>
          <p className="text-sm" style={{ color: 'var(--bloom-muted)' }}>Join your team and start collaborating</p>
        </div>

        {/* Error banner */}
        {error && !registrationSuccess && (
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
            <button data-testid="google-signup-btn"
              onClick={() => (window.location.href = `${API_URL}/api/auth/google`)}
              className={socialBtn} style={{ color: 'var(--bloom-text)' }}>
              <GoogleIcon /> Continue with Google
            </button>
            <button data-testid="github-signup-btn"
              onClick={() => (window.location.href = `${API_URL}/api/auth/github`)}
              className={socialBtn} style={{ color: 'var(--bloom-text)' }}>
              <GitHubIcon /> Continue with GitHub
            </button>
            <button data-testid="phone-signup-btn"
              onClick={() => { setActiveTab('phone'); setOtpSent(false); }}
              className={socialBtn}
              style={{
                color: activeTab === 'phone' ? 'var(--bloom-coral)' : 'var(--bloom-text)',
                borderColor: activeTab === 'phone' ? 'var(--bloom-coral)' : 'var(--bloom-border)',
                background: activeTab === 'phone' ? 'var(--bloom-coral-bg)' : 'var(--bloom-surface)',
              }}>
              <Phone style={{ width: 18, height: 18 }} /> Continue with Phone
            </button>
          </div>

          {/* Divider */}
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t" style={{ borderColor: 'var(--bloom-border)' }} />
            </div>
            <div className="relative flex justify-center">
              <span className="px-3 text-xs font-medium uppercase tracking-wider"
                style={{ background: 'var(--bloom-surface)', color: 'var(--bloom-muted)' }}>
                or continue with email
              </span>
            </div>
          </div>

          {/* Email Form */}
          {activeTab === 'email' && (
            <form onSubmit={handleEmailRegister} className="space-y-3">
              {[
                { label: 'Full name', field: 'name', type: 'text', placeholder: 'Jane Smith', testId: 'name-input' },
                { label: 'Email address', field: 'email', type: 'email', placeholder: 'you@example.com', testId: 'email-input' },
              ].map(({ label, field, type, placeholder, testId }) => (
                <div key={field}>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--bloom-muted)' }}>{label}</label>
                  <input
                    data-testid={testId} type={type} placeholder={placeholder}
                    value={emailForm[field as keyof typeof emailForm]}
                    onChange={(e) => setEmailForm({ ...emailForm, [field]: e.target.value })}
                    required className="bloom-input w-full" style={{ padding: '10px 14px' }}
                  />
                </div>
              ))}

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--bloom-muted)' }}>Password</label>
                <div className="relative">
                  <input
                    data-testid="password-input"
                    type={showPassword ? 'text' : 'password'} placeholder="Create a password"
                    value={emailForm.password}
                    onChange={(e) => setEmailForm({ ...emailForm, password: e.target.value })}
                    required className="bloom-input w-full" style={{ padding: '10px 40px 10px 14px' }}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer"
                    style={{ color: 'var(--bloom-muted)' }}>
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {/* Strength bar */}
                {emailForm.password && (
                  <div className="mt-2">
                    <div className="flex gap-1 mb-1">
                      {[1, 2, 3, 4].map((seg) => (
                        <div key={seg} className="h-1 flex-1 rounded-full transition-all"
                          style={{ background: seg <= passwordStrength ? strengthColors[passwordStrength] : 'var(--bloom-border)' }} />
                      ))}
                    </div>
                    <p className="text-xs" style={{ color: 'var(--bloom-muted)' }}>
                      {strengthLabels[passwordStrength]}
                    </p>
                  </div>
                )}
              </div>

              <button data-testid="register-btn" type="submit" disabled={loading}
                className="bloom-btn-primary w-full justify-center mt-2"
                style={{ padding: '11px 18px', fontSize: 15, opacity: loading ? 0.7 : 1 }}>
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Create account
              </button>
            </form>
          )}

          {/* Phone Form — Step 1 */}
          {activeTab === 'phone' && !otpSent && (
            <form onSubmit={handleSendOtp} className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--bloom-muted)' }}>Full name</label>
                <input data-testid="phone-name-input" type="text" placeholder="Jane Smith"
                  value={phoneForm.name} onChange={(e) => setPhoneForm({ ...phoneForm, name: e.target.value })}
                  required className="bloom-input w-full" style={{ padding: '10px 14px' }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--bloom-muted)' }}>Phone number</label>
                <div className="flex gap-2">
                  <select value={phoneForm.countryCode}
                    onChange={(e) => setPhoneForm({ ...phoneForm, countryCode: e.target.value })}
                    className="bloom-input" style={{ padding: '10px 10px' }}>
                    <option value="+91">+91 India</option>
                    <option value="+1">+1 US</option>
                    <option value="+44">+44 UK</option>
                    <option value="+61">+61 AU</option>
                    <option value="+971">+971 UAE</option>
                    <option value="+65">+65 SG</option>
                  </select>
                  <input data-testid="phone-input" type="tel" placeholder="Phone number"
                    value={phoneForm.phone}
                    onChange={(e) => setPhoneForm({ ...phoneForm, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                    required className="bloom-input flex-1" style={{ padding: '10px 14px' }} />
                </div>
              </div>
              <button data-testid="send-otp-btn" type="submit"
                disabled={loading || !phoneForm.name || !phoneForm.phone}
                className="bloom-btn-primary w-full justify-center mt-2"
                style={{ padding: '11px 18px', fontSize: 15, opacity: loading || !phoneForm.name || !phoneForm.phone ? 0.6 : 1 }}>
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
                  {otp.map((digit, i) => (
                    <input key={i} ref={(el) => { otpRefs.current[i] = el; }}
                      data-testid={`otp-box-${i}`} type="text" maxLength={1} value={digit}
                      onChange={(e) => handleOtpChange(i, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(i, e)} onPaste={handleOtpPaste}
                      className="w-11 h-12 text-center rounded-xl text-lg font-bold transition-colors"
                      style={{
                        background: 'var(--bloom-bg)', outline: 'none',
                        border: `2px solid ${digit ? 'var(--bloom-coral)' : 'var(--bloom-border)'}`,
                        color: 'var(--bloom-text)',
                      }} />
                  ))}
                </div>
              </div>
              <div className="text-center text-sm">
                {countdown > 0 ? (
                  <p style={{ color: 'var(--bloom-muted)' }}>Resend in 00:{countdown.toString().padStart(2, '0')}</p>
                ) : (
                  <button data-testid="resend-otp-btn" type="button" onClick={handleResendOtp}
                    disabled={loading}
                    className="font-medium underline underline-offset-2 transition-opacity hover:opacity-70"
                    style={{ color: 'var(--bloom-coral)' }}>
                    Resend OTP
                  </button>
                )}
              </div>
              <button data-testid="verify-otp-btn" type="submit"
                disabled={loading || otp.join('').length !== 6}
                className="bloom-btn-primary w-full justify-center"
                style={{ padding: '11px 18px', fontSize: 15, opacity: loading || otp.join('').length !== 6 ? 0.6 : 1 }}>
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Verify &amp; Sign up
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-sm mt-5" style={{ color: 'var(--bloom-muted)' }}>
          Already have an account?{' '}
          <a href="/login" className="font-semibold transition-opacity hover:opacity-70"
            style={{ color: 'var(--bloom-coral)' }}>
            Sign in
          </a>
        </p>
      </motion.div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bloom-bg)' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--bloom-coral)' }} />
      </div>
    }>
      <RegisterContent />
    </Suspense>
  );
}
