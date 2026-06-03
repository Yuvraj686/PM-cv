'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProjectWebSocket } from '@/hooks/useProjectWebSocket';
import { useAuthStore } from '@/lib/store';

const AVATAR_COLORS = ['#E07A5F', '#8DB88A', '#C9A84C', '#9B8EC4', '#7A8FA6'];

function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h += name.charCodeAt(i);
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

interface PresenceUser {
  id: string;
  name: string;
  avatar?: string | null;
}

interface PresenceBarProps {
  projectId: string;
}

export function PresenceBar({ projectId }: PresenceBarProps) {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const [users, setUsers] = useState<PresenceUser[]>([]);

  const handleEvent = useCallback((event: { type?: string; user?: PresenceUser; user_id?: string; users?: PresenceUser[] }) => {
    if (event.type === 'presence:snapshot' && event.users) {
      setUsers(event.users.filter((u) => u.id !== currentUserId));
      return;
    }
    if (event.type === 'presence:joined' && event.user) {
      setUsers((prev) => {
        if (event.user!.id === currentUserId) return prev;
        if (prev.some((u) => u.id === event.user!.id)) return prev;
        return [...prev, event.user!];
      });
      return;
    }
    if (event.type === 'presence:left' && event.user_id) {
      setUsers((prev) => prev.filter((u) => u.id !== event.user_id));
    }
  }, [currentUserId]);

  useProjectWebSocket(projectId, handleEvent);

  const visible = users.slice(0, 5);
  const overflow = users.length - 5;

  if (users.length === 0) return null;

  return (
    <div className="flex items-center gap-2 mb-3 shrink-0">
      <span className="text-xs font-medium" style={{ color: 'var(--bloom-muted)' }}>
        Viewing now
      </span>
      <div className="flex items-center -space-x-2">
        <AnimatePresence mode="popLayout">
          {visible.map((user) => (
            <motion.div
              key={user.id}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={{ duration: 0.2 }}
              className="w-8 h-8 rounded-full border-2 flex items-center justify-center text-[11px] font-bold text-white overflow-hidden"
              style={{ borderColor: 'var(--bloom-bg)', background: avatarColor(user.name || '?') }}
              title={user.name}
            >
              {user.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                (user.name || '?').charAt(0).toUpperCase()
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        {overflow > 0 && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="ml-3 text-xs font-medium px-2 py-0.5 rounded-full"
            style={{ background: 'var(--bloom-border)', color: 'var(--bloom-muted)' }}
          >
            +{overflow} more
          </motion.span>
        )}
      </div>
    </div>
  );
}
