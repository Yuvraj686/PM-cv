'use client';

import { useEffect, useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Navbar } from '@/components/layout/Navbar';
import { useAuthStore } from '@/lib/store';
import api from '@/lib/api';

const PROJECT_COLORS = ['#E07A5F','#8DB88A','#C9A84C','#9B8EC4','#7A8FA6','#D4845A'];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const setUser = useAuthStore((s) => s.setUser);
  const user = useAuthStore((s) => s.user);
  const [projects, setProjects] = useState<any[]>([]);

  useEffect(() => {
    if (!user?.id) {
      api.get('/api/users/me').then((res) => setUser(res.data)).catch(() => {});
    }
    api.get('/api/projects').then((res) => {
      setProjects(res.data.map((p: any, i: number) => ({ ...p, color: PROJECT_COLORS[i % PROJECT_COLORS.length] })));
    }).catch(() => {});
  }, []);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bloom-bg)' }}>
      <Sidebar projects={projects} />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar pageTitle="Dashboard" />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
