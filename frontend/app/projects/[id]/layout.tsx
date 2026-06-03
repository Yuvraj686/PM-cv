'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { Navbar } from '@/components/layout/Navbar';
import { LayoutDashboard, CheckSquare, MessageSquare, Bot, GitCommit, Settings, Users, Activity } from 'lucide-react';
import { useAuthStore } from '@/lib/store';
import api from '@/lib/api';

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const id = params.id as string;
  const setUser = useAuthStore((s) => s.setUser);
  const user = useAuthStore((s) => s.user);
  const [projectName, setProjectName] = useState('Project');

  useEffect(() => {
    if (!user?.id) {
      api.get('/api/users/me').then((res) => setUser(res.data)).catch(() => {});
    }
    api.get(`/api/projects/${id}`).then((res) => setProjectName(res.data.name)).catch(() => {});
  }, [id]);

  const projectNavItems = [
    { name: 'Analytics',    href: `/projects/${id}/analytics`, icon: LayoutDashboard },
    { name: 'Kanban Board', href: `/projects/${id}/tasks`,     icon: CheckSquare },
    { name: 'Activity',     href: `/projects/${id}/activity`,  icon: Activity },
    { name: 'Team Chat',    href: `/projects/${id}/chat`,      icon: MessageSquare },
    { name: 'AI Assistant', href: `/projects/${id}/ai`,        icon: Bot },
    { name: 'Commit Feed',  href: `/projects/${id}/commits`,   icon: GitCommit },
    { name: 'Members',      href: `/projects/${id}/members`,   icon: Users },
    { name: 'Settings',     href: `/projects/${id}/settings`,  icon: Settings },
  ];

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bloom-bg)' }}>
      <Sidebar secondaryNavItems={projectNavItems} />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar pageTitle={projectName} />
        <main className="flex-1 overflow-hidden w-full relative">
          {children}
        </main>
      </div>
    </div>
  );
}
