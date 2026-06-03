'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useAuthStore } from '@/lib/store';
import { clearTokens } from '@/lib/auth';
import { LogOut, Plus } from 'lucide-react';

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
  const collapsed = false;

  const workspaceNav = secondaryNavItems || [];

  const handleLogout = () => {
    clearTokens();
    document.cookie = 'access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;';
    logout();
    window.location.href = '/login';
  };

  const initial = user?.name?.charAt(0)?.toUpperCase() || 'U';
  const bg = avatarColor(user?.name || 'U');

  /* ── shared hover style injected once ── */
  const hoverStyle = `
    .sidebar-link { transition: background 0.15s, color 0.15s, transform 0.15s; }
    .sidebar-link:hover { background: var(--bloom-coral-bg) !important; color: var(--bloom-coral) !important; transform: translateX(2px); }
    .sidebar-link:hover .sidebar-icon { transform: scale(1.15); }
    .sidebar-icon { transition: transform 0.15s; display: flex; align-items: center; }
    .sidebar-project-link { transition: background 0.15s, color 0.15s, transform 0.15s; }
    .sidebar-project-link:hover { background: rgba(0,0,0,0.06) !important; color: var(--bloom-coral) !important; transform: translateX(2px); }
  `;

  return (
    <>
      <style>{hoverStyle}</style>
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

          {/* ── Project-level nav (when inside a project) ── */}
          {secondaryNavItems && (
            <>
              {!collapsed && (
                <p className="text-[10px] font-semibold uppercase tracking-widest px-3 mb-2 mt-2" style={{ color: 'var(--bloom-muted)' }}>
                  Workspace
                </p>
              )}

              <Link
                href="/dashboard"
                className="sidebar-link flex items-center gap-3 px-3 py-2 rounded-xl text-sm"
                style={{ color: 'var(--bloom-muted)' }}
              >
                <span className="sidebar-icon text-base">←</span>
                {!collapsed && <span>Back</span>}
              </Link>

              {workspaceNav.map((item) => {
                const isActive = pathname.includes(item.href);
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className="sidebar-link flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium"
                    style={{
                      background: isActive ? 'var(--bloom-coral-bg)' : 'transparent',
                      color: isActive ? 'var(--bloom-coral)' : 'var(--bloom-muted)',
                    }}
                  >
                    <span className="sidebar-icon"><item.icon size={16} /></span>
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
          )}

          {/* ── Projects section (dashboard) ── */}
          {!secondaryNavItems && (
            <div className="mt-2">
              {/* Dashboard home link */}
              <Link
                href="/dashboard"
                className="sidebar-link flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium mb-1"
                style={{
                  background: pathname === '/dashboard' ? 'var(--bloom-coral-bg)' : 'transparent',
                  color: pathname === '/dashboard' ? 'var(--bloom-coral)' : 'var(--bloom-muted)',
                }}
              >
                <span className="sidebar-icon text-base">⊞</span>
                {!collapsed && <span>Dashboard</span>}
                {pathname === '/dashboard' && !collapsed && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full" style={{ background: 'var(--bloom-coral)' }} />
                )}
              </Link>

              {!collapsed && (
                <p className="text-[10px] font-semibold uppercase tracking-widest px-3 mb-2 mt-3" style={{ color: 'var(--bloom-muted)' }}>
                  Projects
                </p>
              )}
              {projects.length === 0 && !collapsed && (
                <p className="text-xs px-3 py-1 italic" style={{ color: 'var(--bloom-muted)', opacity: 0.6 }}>
                  No projects yet
                </p>
              )}
              {projects.slice(0, 6).map((p) => (
                <Link
                  key={p.id}
                  href={`/projects/${p.id}/tasks`}
                  className="sidebar-project-link flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all"
                  style={{ color: 'var(--bloom-muted)' }}
                >
                  <span
                    className="sidebar-icon w-2 h-2 rounded-full shrink-0"
                    style={{ background: p.color || 'var(--bloom-coral)', minWidth: 8 }}
                  />
                  {!collapsed && <span className="truncate">{p.name}</span>}
                </Link>
              ))}
              <Link
                href="/dashboard"
                className="sidebar-project-link flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium"
                style={{ color: 'var(--bloom-muted)' }}
              >
                <span className="sidebar-icon"><Plus size={14} /></span>
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
    </>
  );
}
