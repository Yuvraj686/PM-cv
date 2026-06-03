'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { apiClient } from '@/lib/api-client';
import { useProjectWebSocket } from '@/hooks/useProjectWebSocket';

const AVATAR_COLORS = ['#E07A5F', '#8DB88A', '#C9A84C', '#9B8EC4', '#7A8FA6'];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h += name.charCodeAt(i);
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

const ACTION_LABELS: Record<string, (a: ActivityItem) => string> = {
  task_created: (a) => `created task "${a.metadata?.title || 'Untitled'}"`,
  task_updated: (a) => `updated task "${a.metadata?.title || 'Untitled'}"`,
  task_moved: (a) => `moved "${a.metadata?.title || 'task'}" to ${String(a.metadata?.to_status || '').replace('_', ' ')}`,
  member_invited: (a) => `invited ${a.metadata?.member_name || 'a member'} to the project`,
  comment_added: (a) => `commented on "${a.metadata?.task_title || 'a task'}"`,
  github_push: (a) => `pushed ${a.metadata?.commit_count || ''} commit(s) from ${a.metadata?.author || 'GitHub'}`,
};

interface ActivityItem {
  id: string;
  action: string;
  metadata?: Record<string, string | number>;
  created_at: string;
  actor?: { id: string; name: string; avatar_url?: string } | null;
}

export default function ActivityPage() {
  const { id } = useParams();
  const projectId = id as string;
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const loadMore = async () => {
    if (!hasMore || !cursor) return;
    try {
      const res = await apiClient.get(`/api/projects/${projectId}/activity?limit=20&cursor=${cursor}`);
      setItems((prev) => [...prev, ...(res.items || [])]);
      setCursor(res.next_cursor);
      setHasMore(res.has_more);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await apiClient.get(`/api/projects/${projectId}/activity?limit=20`);
        setItems(res.items || []);
        setCursor(res.next_cursor);
        setHasMore(res.has_more);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [projectId]);

  useProjectWebSocket(projectId, (event) => {
    if (event.type === 'activity:new' && (event as { activity?: ActivityItem }).activity) {
      const activity = (event as { activity: ActivityItem }).activity;
      setItems((prev) => {
        if (prev.some((i) => i.id === activity.id)) return prev;
        return [activity, ...prev];
      });
    }
  });

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin" style={{ color: 'var(--bloom-coral)' }} />
      </div>
    );
  }

  return (
    <div className="p-6 h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto">
        <h2 className="font-serif text-xl font-bold mb-1" style={{ color: 'var(--bloom-text)' }}>Activity</h2>
        <p className="text-sm mb-6" style={{ color: 'var(--bloom-muted)' }}>Recent project events</p>

        {items.length === 0 ? (
          <p className="text-sm text-center py-12" style={{ color: 'var(--bloom-muted)' }}>No activity yet</p>
        ) : (
          <div className="space-y-0">
            {items.map((item, i) => {
              const labelFn = ACTION_LABELS[item.action];
              const description = labelFn ? labelFn(item) : item.action;
              const actorName = item.actor?.name || 'Someone';

              return (
                <div key={item.id} className="flex gap-3 relative pb-6">
                  {i < items.length - 1 && (
                    <div
                      className="absolute left-[15px] top-8 bottom-0 w-px"
                      style={{ background: 'var(--bloom-border)' }}
                    />
                  )}
                  <div
                    className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold text-white z-10"
                    style={{ background: avatarColor(actorName) }}
                  >
                    {actorName.charAt(0)}
                  </div>
                  <div className="pt-0.5">
                    <p className="text-sm" style={{ color: 'var(--bloom-text)' }}>
                      <strong>{actorName}</strong>{' '}
                      <span style={{ color: 'var(--bloom-muted)' }}>{description}</span>
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--bloom-muted)' }}>
                      {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {hasMore && (
          <button onClick={loadMore} className="bloom-btn-secondary w-full mt-4 text-sm">
            Load more
          </button>
        )}
      </div>
    </div>
  );
}
