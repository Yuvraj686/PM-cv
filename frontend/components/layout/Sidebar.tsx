'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { LayoutDashboard, FolderKanban, MessageSquare, Bell, Settings, ChevronLeft, ChevronRight, LogOut, Bot, GitCommit } from 'lucide-react';
import { useAuthStore } from '@/lib/store';

const mainNavItems = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Projects', href: '/dashboard', icon: FolderKanban },
];

export function Sidebar({ secondaryNavItems }: { secondaryNavItems?: any[] }) {
  const [expanded, setExpanded] = useState(true);
  const pathname = usePathname();
  const logout = useAuthStore(s => s.logout);

  return (
    <motion.aside
      initial={false}
      animate={{ width: expanded ? 240 : 64 }}
      className="h-screen bg-black/40 border-r border-white/10 backdrop-blur-xl flex flex-col transition-all duration-300 relative z-20 shrink-0"
    >
      <div className="h-16 flex items-center justify-between px-4 border-b border-white/10 shrink-0">
        {expanded && (
          <div className="flex items-center space-x-2 overflow-hidden">
            <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center shrink-0">
              <span className="font-bold text-white text-sm">P</span>
            </div>
            <span className="font-bold text-foreground font-geist">ProjectHub</span>
          </div>
        )}
        {!expanded && (
          <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center shrink-0 mx-auto">
            <span className="font-bold text-white text-sm">P</span>
          </div>
        )}
        
      </div>

      <button
        onClick={() => setExpanded(!expanded)}
        className="absolute -right-3 top-20 w-6 h-6 bg-indigo-600 rounded-full flex items-center justify-center text-white shadow-lg border-2 border-[#0F1117] z-50 hover:bg-indigo-500 transition-colors"
      >
        {expanded ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
      </button>

      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1 scrollbar-hide">
        {(!secondaryNavItems || secondaryNavItems.length === 0) ? (
          <>
            <p className={`text-xs font-semibold text-muted-foreground mb-2 px-2 uppercase tracking-wider ${expanded ? '' : 'text-center'}`}>
              {expanded ? 'Menu' : '•••'}
            </p>
            {mainNavItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link key={item.name} href={item.href}>
                  <div className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-all group ${isActive ? 'bg-indigo-500/10 text-indigo-400' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}>
                    <item.icon size={20} className={isActive ? 'text-indigo-400' : 'text-gray-400 group-hover:text-white'} />
                    {expanded && <span className="font-medium text-sm whitespace-nowrap">{item.name}</span>}
                  </div>
                </Link>
              );
            })}
          </>
        ) : (
          <>
            <Link href="/dashboard">
              <div className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-all group text-gray-400 hover:bg-white/5 hover:text-white mb-6 border border-white/5`}>
                <ChevronLeft size={20} className="text-gray-400 group-hover:text-white" />
                {expanded && <span className="font-medium text-sm whitespace-nowrap">Back to Dashboard</span>}
              </div>
            </Link>

            <p className={`text-xs font-semibold text-muted-foreground mb-2 px-2 uppercase tracking-wider ${expanded ? '' : 'text-center'}`}>
              {expanded ? 'Workspace' : '•••'}
            </p>
            {secondaryNavItems.map((item) => {
              const isActive = pathname.includes(item.href);
              return (
                <Link key={item.name} href={item.href}>
                  <div className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-all group ${isActive ? 'bg-indigo-500/10 text-indigo-400' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}>
                    <item.icon size={20} className={isActive ? 'text-indigo-400' : 'text-gray-400 group-hover:text-white'} />
                    {expanded && <span className="font-medium text-sm whitespace-nowrap">{item.name}</span>}
                  </div>
                </Link>
              );
            })}
          </>
        )}
      </div>

      <div className="p-4 border-t border-white/10 shrink-0">
        <button 
          onClick={() => {
            logout();
            window.location.href = '/login';
          }}
          className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all ${!expanded && 'justify-center px-0'}`}
        >
          <LogOut size={20} />
          {expanded && <span className="font-medium text-sm whitespace-nowrap">Logout</span>}
        </button>
      </div>
    </motion.aside>
  );
}
