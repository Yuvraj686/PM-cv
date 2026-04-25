'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useAuthStore } from '@/lib/store';
import { clearTokens } from '@/lib/auth';
import { Settings, LogOut, Plus } from 'lucide-react';

const AVATAR_COLORS = [
  '#E07A5F','#8DB88A','#C9A84C','#9B8EC4','#7A8FA6',
];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h += name.charCodeAt(i);
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

interface SidebarProps {
  secondaryNavItems?: { name: string; href: string; icon: React.ElementType }[];
  projects?: { id: string; name: string; color?: string }[];
}

export function Sidebar({ secondaryNavItems, projects = [] }: SidebarProps) {
  const pathname = usePathname();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const [collapsed, setCollapsed] = useState(false);

  const workspaceNav = secondaryNavItems || [];

  const mainNav = [
    { name: 'Dashboard', href: '/dashboard' },
    { name: 'Analytics', href: '#' },
    { name: 'Kanban', href: '#' },
    { name: 'Messages', href: '#' },
  ];

  const handleLogout = () => {
    clearTokens();
    document.cookie = 'access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;';
    logout();
    window.location.href = '/login';
  };

  const initial = user?.name?.charAt(0)?.toUpperCase() || 'U';
  const bg = avatarColor(user?.name || 'U');

  return (
    <aside
      className="bloom-sidebar flex flex-col shrink-0 z-20"
      style={{ width: collapsed ? 64 : 220, transition: 'width 0.2s' }}
    >
      {/* Logo */}
      <div className="h-16 flex items-center px-5 gap-2 shrink-0">
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0"
          style={{ background: 'linear-gradient(135deg, #E07A5F 0%, #C9A84C 100%)' }}
        >
          P
        </div>
        {!collapsed && (
          <span className="font-bold text-[15px]" style={{ color: 'var(--bloom-text)' }}>
            ProjectHub.
          </span>
        )}
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
        {/* Workspace */}
        {!collapsed && (
          <p className="text-[10px] font-semibold uppercase tracking-widest px-3 mb-2 mt-2" style={{ color: 'var(--bloom-muted)' }}>
            {secondaryNavItems ? 'Workspace' : 'Workspace'}
          </p>
        )}

        {secondaryNavItems ? (
          <>
            <Link
              href="/dashboard"
              className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors"
              style={{ color: 'var(--bloom-muted)' }}
            >
              <span className="text-base">←</span>
              {!collapsed && <span>Back</span>}
            </Link>
            {workspaceNav.map((item) => {
              const isActive = pathname.includes(item.href);
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all"
                  style={{
                    background: isActive ? 'var(--bloom-coral-bg)' : 'transparent',
                    color: isActive ? 'var(--bloom-coral)' : 'var(--bloom-muted)',
                  }}
                >
                  <item.icon size={16} />
                  {!collapsed && <span>{item.name}</span>}
                  {isActive && !collapsed && (
                    <span
                      className="ml-auto w-1.5 h-1.5 rounded-full"
                      style={{ background: 'var(--bloom-coral)' }}
                    />
                  )}
                </Link>
              );
            })}
          </>
        ) : (
          <>
            {[
              { name: 'Dashboard', href: '/dashboard', icon: '⊞' },
              { name: 'Analytics', href: '/dashboard', icon: '↗' },
              { name: 'Kanban', href: '/dashboard', icon: '▦' },
              { name: 'Messages', href: '/dashboard', icon: '◻' },
            ].map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all"
                  style={{
                    background: isActive ? 'var(--bloom-coral-bg)' : 'transparent',
                    color: isActive ? 'var(--bloom-coral)' : 'var(--bloom-muted)',
                  }}
                >
                  <span>{item.icon}</span>
                  {!collapsed && <span>{item.name}</span>}
                  {isActive && !collapsed && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full" style={{ background: 'var(--bloom-coral)' }} />
                  )}
                </Link>
              );
            })}
          </>
        )}

        {/* Projects section */}
        {!secondaryNavItems && (
          <div className="mt-4">
            {!collapsed && (
              <p className="text-[10px] font-semibold uppercase tracking-widest px-3 mb-2" style={{ color: 'var(--bloom-muted)' }}>
                Projects
              </p>
            )}
            {projects.slice(0, 6).map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.id}/tasks`}
                className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all hover:bg-black/5"
                style={{ color: 'var(--bloom-muted)' }}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: p.color || 'var(--bloom-coral)' }}
                />
                {!collapsed && <span className="truncate">{p.name}</span>}
              </Link>
            ))}
            <Link
              href="/dashboard"
              className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all hover:bg-black/5"
              style={{ color: 'var(--bloom-muted)' }}
            >
              <Plus size={14} />
              {!collapsed && <span>New project</span>}
            </Link>
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className="p-3 shrink-0 flex items-center gap-2"
        style={{ borderTop: '1px solid var(--bloom-border)' }}
      >
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-sm shrink-0"
          style={{ background: bg }}
        >
          {initial}
        </div>
        {!collapsed && (
          <>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate" style={{ color: 'var(--bloom-text)' }}>
                {user?.name || 'User'}
              </p>
              <p className="text-[10px] truncate" style={{ color: 'var(--bloom-muted)' }}>
                {user?.email || ''}
              </p>
            </div>
            <button
              onClick={handleLogout}
              title="Logout"
              className="p-1.5 rounded-lg hover:bg-black/5 transition-colors"
              style={{ color: 'var(--bloom-muted)' }}
            >
              <LogOut size={14} />
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
