'use client';

import { Bell, Search, Plus } from 'lucide-react';
import { useAuthStore } from '@/lib/store';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { toast } from 'sonner';

interface NavbarProps {
  pageTitle?: string;
  onNewTask?: () => void;
}

export function Navbar({ pageTitle, onNewTask }: NavbarProps) {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.accessToken);
  const [unreadCounts, setUnreadCounts] = useState(0);

  useEffect(() => {
    const fetchNotifs = async () => {
      try {
        const res = await api.get('/api/notifications');
        const unread = res.data.filter((n: any) => !n.read).length;
        setUnreadCounts(unread);
      } catch (err) {}
    };
    if (user) fetchNotifs();
  }, [user]);

  useEffect(() => {
    if (!user || !token) return;
    const wsUrl = `${process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000'}/api/chat/ws/user_${user.id}/${user.id}?token=${token}`;
    const ws = new WebSocket(wsUrl);
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'notification') {
          setUnreadCounts((c) => c + 1);
          if (data.notification?.type === 'deadline_alert') {
            toast.warning(data.notification?.content || 'Deadline approaching');
          }
        }
      } catch {}
    };
    return () => ws.close();
  }, [user, token]);

  return (
    <header
      className="h-16 flex items-center justify-between px-6 shrink-0"
      style={{
        background: 'var(--bloom-bg)',
        borderBottom: '1px solid var(--bloom-border)',
      }}
    >
      {/* Page title */}
      <h1 className="font-serif text-2xl font-bold" style={{ color: 'var(--bloom-text)' }}>
        {pageTitle || 'Dashboard'}
      </h1>

      {/* Centre search */}
      <div className="flex-1 max-w-sm mx-8 relative">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2"
          style={{ color: 'var(--bloom-muted)' }}
        />
        <input
          type="text"
          placeholder="Search projects, tasks, people..."
          className="bloom-input w-full pl-9 pr-4 py-2 text-sm"
          style={{ background: 'var(--bloom-surface)' }}
        />
        <span
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-medium px-1.5 py-0.5 rounded-md"
          style={{ background: 'var(--bloom-border)', color: 'var(--bloom-muted)' }}
        >
          ⌘K
        </span>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-3">
        <button
          className="relative p-2 rounded-xl transition-colors hover:bg-black/5"
          style={{ color: 'var(--bloom-muted)' }}
        >
          <Bell size={18} />
          {unreadCounts > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center text-white"
              style={{ background: 'var(--bloom-coral)' }}
            >
              {unreadCounts}
            </span>
          )}
        </button>

        <button
          data-testid="new-task-btn"
          onClick={onNewTask}
          className="bloom-btn-primary text-sm"
        >
          <Plus size={14} />
          New task
        </button>
      </div>
    </header>
  );
}
