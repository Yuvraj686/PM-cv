'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getTokenExpiryMs } from '@/lib/auth';
import { useAuthStore } from '@/lib/store';

const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/verify-email',
  '/forgot-password',
  '/reset-password',
  '/auth/callback',
];

const MAX_TIMEOUT_MS = 2_147_483_647;

export function AuthSessionWatcher() {
  const router = useRouter();
  const pathname = usePathname();
  const accessToken = useAuthStore((s) => s.accessToken);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    const token = refreshToken || accessToken;
    const expiryMs = getTokenExpiryMs(token);

    if (!token || !expiryMs) return;

    const endSession = () => {
      logout();
      const isPublicPath = PUBLIC_PATHS.some((path) => pathname.startsWith(path));
      if (!isPublicPath) {
        router.replace('/login');
      }
    };

    const delayMs = expiryMs - Date.now();
    if (delayMs <= 0) {
      endSession();
      return;
    }

    const timer = window.setTimeout(endSession, Math.min(delayMs, MAX_TIMEOUT_MS));
    return () => window.clearTimeout(timer);
  }, [accessToken, refreshToken, logout, pathname, router]);

  return null;
}
