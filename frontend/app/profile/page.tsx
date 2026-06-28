'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  User,
  Lock,
  BarChart3,
  AlertTriangle,
  Loader2,
  Eye,
  EyeOff,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { clearTokens } from '@/lib/auth';

const AVATAR_COLORS = ['#E07A5F', '#8DB88A', '#C9A84C', '#9B8EC4', '#7A8FA6'];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h += name.charCodeAt(i);
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

type ProfileData = {
  id: string;
  name: string | null;
  username: string | null;
  email: string | null;
  avatar_url: string | null;
  github_username: string | null;
  onboarding_complete: boolean;
  created_at: string;
  project_count: number;
  task_count: number;
  workspace_count: number;
};

const INPUT_CLASS =
  'w-full bg-[#F7F4EF] border border-[#E8E4DD] rounded-xl px-4 py-2.5 text-sm text-[#1C1C1C] placeholder-[#8A8178] outline-none focus:border-[#E07A5F] focus:ring-2 focus:ring-[#E07A5F]/15 transition-all';

function CardWrapper({ children, danger = false }: { children: React.ReactNode; danger?: boolean }) {
  return (
    <div
      className="rounded-2xl border"
      style={{
        background: danger ? '#FEF2F2' : '#ffffff',
        borderColor: danger ? 'rgba(239,68,68,0.25)' : '#E8E4DD',
        boxShadow: '0 1px 8px rgba(28,28,28,0.05)',
      }}
    >
      {children}
    </div>
  );
}

function CardHead({
  icon,
  title,
  danger = false,
}: {
  icon: React.ReactNode;
  title: string;
  danger?: boolean;
}) {
  return (
    <div className="px-6 pt-6 pb-4">
      <div className="flex items-center gap-2.5 mb-4">
        <span className={danger ? 'text-red-500' : 'text-[#E07A5F]'}>{icon}</span>
        <h3
          className={`text-base font-bold ${danger ? 'text-red-600' : 'text-[#1C1C1C]'}`}
          style={{ fontFamily: "'Lora', Georgia, serif" }}
        >
          {title}
        </h3>
      </div>
      <div className={`h-px ${danger ? 'bg-red-200/60' : 'bg-[#E8E4DD]'}`} />
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-sm font-medium text-[#1C1C1C] mb-1.5">{children}</label>;
}

function HelperText({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-xs text-[#8A8178]">{children}</p>;
}

function PrimaryButton({
  children,
  loading = false,
  disabled = false,
  onClick,
  type = 'button',
}: {
  children: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className="w-full flex items-center justify-center gap-2 bg-[#1C1C1C] hover:bg-[#333] text-white font-semibold py-2.5 rounded-xl text-sm transition-all shadow-sm disabled:opacity-50"
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : children}
    </button>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // Profile form
  const [name, setName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Password form
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  // Delete modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await api.get('/api/users/me/profile');
        const data = res.data as ProfileData;
        setProfile(data);
        setName(data.name || '');
      } catch {
        toast.error('Failed to load profile');
      } finally {
        setLoadingProfile(false);
      }
    };
    fetch();
  }, []);

  const handleSaveProfile = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    setSavingProfile(true);
    try {
      const res = await api.put('/api/users/me/profile', { name: name.trim() });
      setProfile((prev) => prev ? { ...prev, name: res.data.name } : prev);
      toast.success('Profile saved!');
    } catch {
      toast.error('Failed to save profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPw || !newPw || !confirmPw) {
      toast.error('All password fields are required');
      return;
    }
    if (newPw.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }
    if (newPw !== confirmPw) {
      toast.error('New passwords do not match');
      return;
    }
    setSavingPw(true);
    try {
      await api.put('/api/users/me/password', {
        current_password: currentPw,
        new_password: newPw,
        confirm_password: confirmPw,
      });
      toast.success('Password updated!');
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to update password');
    } finally {
      setSavingPw(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteInput !== 'DELETE') {
      toast.error('Type DELETE to confirm');
      return;
    }
    setDeletingAccount(true);
    try {
      await api.delete('/api/users/me', { data: { confirmation: 'DELETE' } });
      toast.success('Account deleted');
      clearTokens();
      document.cookie = 'access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;';
      logout();
      router.push('/login');
    } catch {
      toast.error('Failed to delete account');
    } finally {
      setDeletingAccount(false);
    }
  };

  const initial = name?.charAt(0)?.toUpperCase() || user?.name?.charAt(0)?.toUpperCase() || 'U';
  const bg = avatarColor(name || user?.name || 'U');

  const joinedDate = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '—';

  if (loadingProfile) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-[#E07A5F]" />
      </div>
    );
  }

  return (
    <div
      className="p-6 h-full overflow-y-auto w-full"
      style={{ backgroundColor: 'var(--bloom-bg)', fontFamily: "'Inter', sans-serif" }}
    >
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Page Header */}
        <div>
          <h1
            className="text-2xl font-bold text-[#1C1C1C]"
            style={{ fontFamily: "'Lora', Georgia, serif" }}
          >
            Account Settings
          </h1>
          <p className="text-sm text-[#8A8178] mt-1">Manage your profile and account preferences</p>
        </div>

        {/* ── CARD 1: Profile Information ── */}
        <CardWrapper>
          <CardHead icon={<User size={16} />} title="Profile Information" />
          <div className="px-6 pb-0 space-y-5">
            {/* Avatar + fields row */}
            <div className="flex items-start gap-5">
              {/* Avatar */}
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-2xl shrink-0 shadow-sm"
                style={{ background: bg }}
              >
                {initial}
              </div>
              {/* Fields */}
              <div className="flex-1 space-y-4">
                <div>
                  <FieldLabel>Full Name</FieldLabel>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your full name"
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <FieldLabel>Email Address</FieldLabel>
                  <input
                    type="email"
                    value={profile?.email || ''}
                    readOnly
                    className={`${INPUT_CLASS} opacity-60 cursor-not-allowed`}
                  />
                  <HelperText>Email cannot be changed.</HelperText>
                </div>
                <p className="text-xs text-[#8A8178]">Member since {joinedDate}</p>
              </div>
            </div>
          </div>
          <div className="px-6 py-5 mt-4 border-t border-[#E8E4DD]">
            <PrimaryButton loading={savingProfile} onClick={handleSaveProfile}>
              <Save className="w-4 h-4" /> Save Profile
            </PrimaryButton>
          </div>
        </CardWrapper>

        {/* ── CARD 2: Change Password ── */}
        <CardWrapper>
          <CardHead icon={<Lock size={16} />} title="Change Password" />
          <div className="px-6 pb-0 space-y-4">

            {/* Current Password */}
            <div>
              <FieldLabel>Current Password</FieldLabel>
              <div className="relative">
                <input
                  type={showCurrentPw ? 'text' : 'password'}
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                  placeholder="••••••••"
                  className={`${INPUT_CLASS} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPw(!showCurrentPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8A8178] hover:text-[#1C1C1C] transition-colors"
                >
                  {showCurrentPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <FieldLabel>New Password</FieldLabel>
              <div className="relative">
                <input
                  type={showNewPw ? 'text' : 'password'}
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  placeholder="••••••••"
                  className={`${INPUT_CLASS} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPw(!showNewPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8A8178] hover:text-[#1C1C1C] transition-colors"
                >
                  {showNewPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <HelperText>Minimum 8 characters.</HelperText>
            </div>

            {/* Confirm New Password */}
            <div>
              <FieldLabel>Confirm New Password</FieldLabel>
              <div className="relative">
                <input
                  type={showConfirmPw ? 'text' : 'password'}
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  placeholder="••••••••"
                  className={`${INPUT_CLASS} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPw(!showConfirmPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8A8178] hover:text-[#1C1C1C] transition-colors"
                >
                  {showConfirmPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {confirmPw && newPw && confirmPw !== newPw && (
                <p className="mt-1.5 text-xs text-[#c45f46]">Passwords do not match</p>
              )}
              {confirmPw && newPw && confirmPw === newPw && (
                <p className="mt-1.5 text-xs text-[#4a8a46]">Passwords match ✓</p>
              )}
            </div>
          </div>
          <div className="px-6 py-5 mt-4 border-t border-[#E8E4DD]">
            <PrimaryButton loading={savingPw} onClick={handleChangePassword}>
              <Lock className="w-4 h-4" /> Update Password
            </PrimaryButton>
          </div>
        </CardWrapper>

        {/* ── CARD 3: Account Statistics ── */}
        <CardWrapper>
          <CardHead icon={<BarChart3 size={16} />} title="Account Statistics" />
          <div className="px-6 pb-6">
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Projects', value: profile?.project_count ?? 0 },
                { label: 'Tasks Assigned', value: profile?.task_count ?? 0 },
                { label: 'Workspaces', value: profile?.workspace_count ?? 0 },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="flex flex-col items-center justify-center p-4 bg-[#F7F4EF] rounded-xl border border-[#E8E4DD]"
                >
                  <span
                    className="text-3xl font-bold"
                    style={{ color: '#E07A5F', fontFamily: "'Lora', Georgia, serif" }}
                  >
                    {stat.value}
                  </span>
                  <span className="text-xs text-[#8A8178] mt-1 text-center">{stat.label}</span>
                </div>
              ))}
            </div>
          </div>
        </CardWrapper>

        {/* ── CARD 4: Danger Zone ── */}
        <CardWrapper danger>
          <CardHead icon={<AlertTriangle size={16} />} title="Danger Zone" danger />
          <div className="px-6 pb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <p className="text-sm text-[#6b6460] max-w-sm">
              Deleting your account is <strong className="text-red-600">permanent</strong>. You will be removed from all workspaces and projects, and all your data will be lost forever.
            </p>
            <button
              onClick={() => setShowDeleteModal(true)}
              className="shrink-0 flex items-center gap-2 border border-red-400/60 text-red-500 hover:bg-red-500 hover:text-white font-medium py-2.5 px-5 rounded-xl text-sm transition-all"
            >
              <Trash2 className="w-4 h-4" /> Delete Account
            </button>
          </div>
        </CardWrapper>
      </div>

      {/* ── Delete Account Modal ── */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-[#1C1C1C]/30 backdrop-blur-[2px]"
            onClick={() => { setShowDeleteModal(false); setDeleteInput(''); }}
          />
          <div className="relative bg-white border border-[#E8E4DD] rounded-2xl shadow-xl p-6 w-full max-w-md">
            {/* Close */}
            <button
              onClick={() => { setShowDeleteModal(false); setDeleteInput(''); }}
              className="absolute top-4 right-4 text-[#8A8178] hover:text-[#1C1C1C] transition-colors"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center">
                <AlertTriangle size={18} className="text-red-500" />
              </div>
              <h3 className="font-bold text-[#1C1C1C]" style={{ fontFamily: "'Lora', Georgia, serif" }}>
                Delete Account
              </h3>
            </div>

            <p className="text-sm text-[#6b6460] mb-5">
              This will <strong className="text-red-600">permanently delete your account</strong>, remove you from all workspaces and projects, and delete all your data. <strong>This cannot be undone.</strong>
            </p>

            <div className="mb-5">
              <label className="text-xs font-medium text-[#1C1C1C] mb-1.5 block">
                Type <strong>DELETE</strong> to confirm
              </label>
              <input
                type="text"
                value={deleteInput}
                onChange={(e) => setDeleteInput(e.target.value)}
                className={INPUT_CLASS}
                placeholder="DELETE"
              />
            </div>

            <div className="flex gap-2.5">
              <button
                onClick={() => { setShowDeleteModal(false); setDeleteInput(''); }}
                className="flex-1 px-4 py-2.5 border border-[#E8E4DD] rounded-xl text-sm font-medium text-[#8A8178] hover:bg-[#F7F4EF] transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteInput !== 'DELETE' || deletingAccount}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-2.5 rounded-xl text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {deletingAccount
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <><Trash2 className="w-4 h-4" /> Delete Account</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
