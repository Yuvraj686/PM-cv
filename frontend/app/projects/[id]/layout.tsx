'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { Navbar } from '@/components/layout/Navbar';
import { LayoutDashboard, CheckSquare, MessageSquare, Bot, GitCommit, Settings, Users } from 'lucide-react';
import { useParams } from 'next/navigation';

export default function ProjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const id = params.id as string;

  const projectNavItems = [
    { name: 'Analytics', href: `/projects/${id}/analytics`, icon: LayoutDashboard },
    { name: 'Kanban Board', href: `/projects/${id}/tasks`, icon: CheckSquare },
    { name: 'Team Chat', href: `/projects/${id}/chat`, icon: MessageSquare },
    { name: 'AI Assistant', href: `/projects/${id}/ai`, icon: Bot },
    { name: 'Commit Feed', href: `/projects/${id}/commits`, icon: GitCommit },
    { name: 'Members', href: `/projects/${id}/members`, icon: Users },
    { name: 'Settings', href: `/projects/${id}/settings`, icon: Settings },
  ];

  return (
    <div className="flex h-screen bg-background overflow-hidden relative">
      <div className="absolute top-0 left-0 w-full h-[500px] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/10 via-background to-background" />
      
      <Sidebar secondaryNavItems={projectNavItems} />
      
      <div className="flex-1 flex flex-col min-w-0 z-10">
        <Navbar />
        <main className="flex-1 overflow-hidden w-full relative">
          {children}
        </main>
      </div>
    </div>
  );
}
