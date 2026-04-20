'use client';

import { Bell, Search } from 'lucide-react';
import { useAuthStore } from '@/lib/store';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';

export function Navbar() {
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.accessToken);
  const [unreadCounts, setUnreadCounts] = useState(0);

  useEffect(() => {
    // Quick polling or initial fetch for notifications in real world
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
    <header className="h-16 bg-black/20 backdrop-blur-md border-b border-white/10 flex items-center justify-between px-6 sticky top-0 z-10">
      <div className="flex-1 max-w-md relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
        <input 
          type="text" 
          placeholder="Search projects, tasks, or members (Ctrl+K)" 
          className="w-full bg-black/40 border border-white/10 rounded-full pl-10 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
        />
      </div>

      <div className="flex items-center space-x-6">
        <button className="relative text-gray-400 hover:text-white transition-colors">
          <Bell className="w-5 h-5" />
          {unreadCounts > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-background">
              {unreadCounts}
            </span>
          )}
        </button>

        <div className="flex items-center space-x-3 border-l border-white/10 pl-6 cursor-pointer">
          <div className="text-right hidden md:block">
            <p className="text-sm font-medium text-white leading-none">{user?.name || 'User'}</p>
            <p className="text-xs text-gray-400 mt-1">{user?.email || 'user@example.com'}</p>
          </div>
          {user?.avatar_url ? (
            <img src={user.avatar_url} alt="avatar" className="w-9 h-9 rounded-full object-cover border border-white/20" />
          ) : (
            <div className="w-9 h-9 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-full flex items-center justify-center border border-white/20 shadow-inner">
              <span className="text-white text-sm font-bold uppercase">{user?.name?.charAt(0) || 'U'}</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
