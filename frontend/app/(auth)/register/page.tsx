'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Phone, Eye, EyeOff, Loader2, MailIcon } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function RegisterPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Email form state
  const [emailForm, setEmailForm] = useState({
    name: '',
    email: '',
    password: '',
  });
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');

  // Phone form state
  const [phoneForm, setPhoneForm] = useState({
    name: '',
    countryCode: '+91',
    phone: '',
  });
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [countdown, setCountdown] = useState(0);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Calculate password strength
  useEffect(() => {
    const pwd = emailForm.password;
    let strength = 0;
    if (pwd.length >= 8) strength = 1;
    if (pwd.length >= 8 && /[A-Z]/.test(pwd)) strength = 2;
    if (pwd.length >= 8 && /[A-Z]/.test(pwd) && /\d/.test(pwd)) strength = 3;
    if (pwd.length >= 8 && /[A-Z]/.test(pwd) && /\d/.test(pwd) && /[!@#$%^&*]/.test(pwd)) strength = 4;
    setPasswordStrength(strength);
  }, [emailForm.password]);

  // Countdown timer for OTP resend
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // Handle email registration
  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/auth/email/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: emailForm.name,
          email: emailForm.email,
          password: emailForm.password,
        }),
      });

      if (response.ok) {
        setVerificationEmail(emailForm.email);
        setRegistrationSuccess(true);
      } else {
        const data = await response.json();
        setError(data.detail || 'Registration failed');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle phone OTP send
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/auth/phone/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number: `${phoneForm.countryCode}${phoneForm.phone}`,
          name: phoneForm.name,
        }),
      });

      if (response.ok) {
        setOtpSent(true);
        setCountdown(60);
        setOtp(['', '', '', '', '', '']);
        otpRefs.current[0]?.focus();
      } else {
        const data = await response.json();
        setError(data.detail || 'Failed to send OTP');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle OTP digit input
  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);

    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  // Handle backspace in OTP
  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  // Handle paste in OTP
  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const paste = e.clipboardData.getData('text');
    const digits = paste.replace(/\D/g, '').slice(0, 6).split('');
    if (digits.length > 0) {
      e.preventDefault();
      const newOtp = [...otp];
      digits.forEach((digit, i) => {
        if (i < 6) newOtp[i] = digit;
      });
      setOtp(newOtp);
      if (digits.length === 6) {
        otpRefs.current[5]?.focus();
      }
    }
  };

  // Handle OTP verification
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const otpCode = otp.join('');
    if (otpCode.length !== 6) {
      setError('Please enter all 6 digits');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/auth/phone/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number: `${phoneForm.countryCode}${phoneForm.phone}`,
          otp: otpCode,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('token', data.access_token);
        router.push('/dashboard');
      } else {
        const data = await response.json();
        setError(data.detail || 'Invalid OTP');
        setOtp(['', '', '', '', '', '']);
        otpRefs.current[0]?.focus();
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle resend OTP
  const handleResendOtp = async () => {
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/auth/phone/resend-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number: `${phoneForm.countryCode}${phoneForm.phone}`,
        }),
      });

      if (response.ok) {
        setCountdown(60);
        setOtp(['', '', '', '', '', '']);
        otpRefs.current[0]?.focus();
      } else {
        const data = await response.json();
        setError(data.detail || 'Failed to resend OTP');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle resend verification email
  const handleResendEmail = async () => {
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/auth/email/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: verificationEmail }),
      });

      if (response.ok) {
        setError('Verification email sent!');
      } else {
        const data = await response.json();
        setError(data.detail || 'Failed to resend email');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (registrationSuccess) {
    return (
      <div className="min-h-screen bg-[#0F1117] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#1a1f2e] border border-white/10 rounded-2xl p-10 text-center">
          <div className="mb-6 flex justify-center">
            <div className="relative w-16 h-16 bg-indigo-600/10 rounded-full flex items-center justify-center animate-pulse">
              <MailIcon className="w-8 h-8 text-indigo-400" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Check your inbox</h2>
          <p className="text-white/60 mb-6">We sent a verification link to {verificationEmail}</p>
          <button
            onClick={handleResendEmail}
            data-testid="resend-email-link"
            className="text-indigo-400 hover:text-indigo-300 mb-8 text-sm"
          >
            Didn't get it? Resend email
          </button>
          <button
            onClick={() => setRegistrationSuccess(false)}
            className="text-white/60 hover:text-white/80 text-sm"
          >
            Wrong email? Go back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F1117] flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold">P</span>
            </div>
            <span className="text-xl font-bold text-white">ProjectHub</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Create your account</h1>
          <p className="text-white/60">Join your team today</p>
        </div>

        {/* Error Banner */}
        {error && !registrationSuccess && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Card */}
        <div className="bg-[#1a1f2e] border border-white/10 rounded-2xl p-10">
          {/* Social Buttons */}
          <div className="space-y-3 mb-6">
            <button
              data-testid="google-signup-btn"
              onClick={() => (window.location.href = `${API_URL}/api/auth/google`)}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 border border-white/10 rounded-xl hover:bg-white/5 transition text-white text-sm font-medium"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Continue with Google
            </button>

            <button
              data-testid="github-signup-btn"
              onClick={() => (window.location.href = `${API_URL}/api/auth/github`)}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 border border-white/10 rounded-xl hover:bg-white/5 transition text-white text-sm font-medium"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v 3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              Continue with GitHub
            </button>

            <button
              data-testid="phone-signup-btn"
              onClick={() => {
                setActiveTab('phone');
                setOtpSent(false);
              }}
              className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 border rounded-xl transition text-sm font-medium ${
                activeTab === 'phone'
                  ? 'border-indigo-500 bg-indigo-600/10 text-indigo-400'
                  : 'border-white/10 hover:bg-white/5 text-white'
              }`}
            >
              <Phone className="w-5 h-5" />
              Continue with Phone number
            </button>
          </div>

          {/* Divider */}
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-[#1a1f2e] text-white/40">─── or continue with email ───</span>
            </div>
          </div>

          {/* Email Form */}
          {activeTab === 'email' && (
            <form onSubmit={handleEmailRegister} className="space-y-4">
              <div>
                <input
                  data-testid="name-input"
                  type="text"
                  placeholder="Full name"
                  value={emailForm.name}
                  onChange={(e) => setEmailForm({ ...emailForm, name: e.target.value })}
                  required
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-indigo-500/50"
                />
              </div>

              <div>
                <input
                  data-testid="email-input"
                  type="email"
                  placeholder="Email address"
                  value={emailForm.email}
                  onChange={(e) => setEmailForm({ ...emailForm, email: e.target.value })}
                  required
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-indigo-500/50"
                />
              </div>

              <div>
                <div className="relative mb-2">
                  <input
                    data-testid="password-input"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Password"
                    value={emailForm.password}
                    onChange={(e) => setEmailForm({ ...emailForm, password: e.target.value })}
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

              <button
                data-testid="register-btn"
                type="submit"
                disabled={loading}
                className="w-full mt-6 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white font-medium rounded-xl transition flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Create account
              </button>
            </form>
          )}

          {/* Phone Form - Step 1 */}
          {activeTab === 'phone' && !otpSent && (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div>
                <input
                  data-testid="phone-name-input"
                  type="text"
                  placeholder="Full name"
                  value={phoneForm.name}
                  onChange={(e) => setPhoneForm({ ...phoneForm, name: e.target.value })}
                  required
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-indigo-500/50"
                />
              </div>

              <div className="flex gap-2">
                <select
                  value={phoneForm.countryCode}
                  onChange={(e) => setPhoneForm({ ...phoneForm, countryCode: e.target.value })}
                  className="px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-indigo-500/50"
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
                  className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-indigo-500/50"
                />
              </div>

              <button
                data-testid="send-otp-btn"
                type="submit"
                disabled={loading || !phoneForm.name || !phoneForm.phone}
                className="w-full mt-6 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white font-medium rounded-xl transition flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Send OTP
              </button>
            </form>
          )}

          {/* Phone Form - Step 2 (OTP Verification) */}
          {activeTab === 'phone' && otpSent && (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <p className="text-green-400 text-sm mb-4">
                OTP sent to {phoneForm.countryCode}***{phoneForm.phone.slice(-4)}
              </p>

              <div className="flex justify-center gap-2 mb-4">
                {otp.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => {
                      otpRefs.current[index] = el;
                    }}
                    data-testid={`otp-box-${index}`}
                    type="text"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(index, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(index, e)}
                    onPaste={handleOtpPaste}
                    className="w-12 h-12 text-center bg-white/5 border border-white/10 rounded-lg text-white text-lg font-semibold focus:outline-none focus:border-indigo-500/50"
                  />
                ))}
              </div>

              <div className="text-center text-sm">
                {countdown > 0 ? (
                  <p className="text-white/60">
                    Resend OTP in 00:{countdown.toString().padStart(2, '0')}
                  </p>
                ) : (
                  <button
                    data-testid="resend-otp-btn"
                    type="button"
                    onClick={handleResendOtp}
                    disabled={loading || countdown > 0}
                    className="text-indigo-400 hover:text-indigo-300 disabled:text-white/40"
                  >
                    Resend OTP
                  </button>
                )}
              </div>

              <button
                data-testid="verify-otp-btn"
                type="submit"
                disabled={loading || otp.join('').length !== 6}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white font-medium rounded-xl transition flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Verify OTP
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-white/60 text-sm mt-6">
          Already have an account?{' '}
          <a href="/login" className="text-indigo-400 hover:text-indigo-300">
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}
