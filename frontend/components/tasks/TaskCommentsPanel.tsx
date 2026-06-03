'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Send, Trash2, MessageSquare } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/lib/store';
import { useProjectWebSocket, ProjectWSEvent } from '@/hooks/useProjectWebSocket';
import { toast } from 'sonner';

interface Comment {
  id: string;
  content: string;
  author_id: string;
  parent_comment_id: string | null;
  created_at: string;
  author?: { id: string; name: string; avatar_url?: string };
  replies?: Comment[];
}

const AVATAR_COLORS = ['#E07A5F', '#8DB88A', '#C9A84C', '#9B8EC4', '#7A8FA6'];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h += name.charCodeAt(i);
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

interface TaskCommentsPanelProps {
  taskId: string;
  projectId: string;
  onCommentCountChange?: (count: number) => void;
}

export function TaskCommentsPanel({ taskId, projectId, onCommentCountChange }: TaskCommentsPanelProps) {
  const currentUser = useAuthStore((s) => s.user);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const countAll = useCallback((items: Comment[]): number => {
    return items.reduce((acc, c) => acc + 1 + countAll(c.replies || []), 0);
  }, []);

  const fetchComments = useCallback(async () => {
    try {
      const res = await apiClient.get(`/api/tasks/${taskId}/comments?limit=50`);
      setComments(res.items || []);
      onCommentCountChange?.(countAll(res.items || []));
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [taskId, countAll, onCommentCountChange]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const handleWSEvent = useCallback((event: ProjectWSEvent) => {
    if (event.type === 'task:comment_added' && event.task_id === taskId && event.comment) {
      const incoming = event.comment as Comment;
      setComments((prev) => {
        const exists = (items: Comment[]): boolean =>
          items.some((c) => c.id === incoming.id || (c.replies || []).some((r) => r.id === incoming.id));
        if (exists(prev)) return prev;

        let next: Comment[];
        if (incoming.parent_comment_id) {
          next = prev.map((c) =>
            c.id === incoming.parent_comment_id
              ? { ...c, replies: [...(c.replies || []), incoming] }
              : c,
          );
        } else {
          next = [incoming, ...prev];
        }
        onCommentCountChange?.(countAll(next));
        return next;
      });
    }
  }, [taskId, countAll, onCommentCountChange]);

  useProjectWebSocket(projectId, handleWSEvent);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      await apiClient.post(`/api/tasks/${taskId}/comments`, {
        content,
        parent_comment_id: replyTo,
      });
      setContent('');
      setReplyTo(null);
      // WS event will add comment for other clients; refetch for author consistency
      await fetchComments();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to post comment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!confirm('Delete this comment?')) return;
    try {
      await apiClient.delete(`/api/tasks/${taskId}/comments/${commentId}`);
      await fetchComments();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const renderComment = (comment: Comment, depth = 0) => {
    const canDelete =
      comment.author_id === currentUser?.id ||
      ['admin', 'project_lead'].includes(currentUser?.role || '');

    return (
      <div key={comment.id} className={depth > 0 ? 'ml-4 mt-2 pl-3 border-l-2' : ''} style={{ borderColor: 'var(--bloom-border)' }}>
        <div className="flex gap-2">
          <div
            className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
            style={{ background: avatarColor(comment.author?.name || '?') }}
          >
            {(comment.author?.name || '?').charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold" style={{ color: 'var(--bloom-text)' }}>
                {comment.author?.name || 'Unknown'}
              </span>
              <span className="text-[10px]" style={{ color: 'var(--bloom-muted)' }}>
                {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
              </span>
            </div>
            <p className="text-sm mt-0.5" style={{ color: 'var(--bloom-text)' }}>{comment.content}</p>
            <div className="flex items-center gap-2 mt-1">
              {depth < 1 && (
                <button
                  type="button"
                  onClick={() => setReplyTo(comment.id)}
                  className="text-[10px] font-medium hover:underline"
                  style={{ color: 'var(--bloom-coral)' }}
                >
                  Reply
                </button>
              )}
              {canDelete && (
                <button type="button" onClick={() => handleDelete(comment.id)} className="text-[10px]" style={{ color: 'var(--bloom-muted)' }}>
                  <Trash2 size={10} className="inline" />
                </button>
              )}
            </div>
            {(comment.replies || []).map((r) => renderComment(r, depth + 1))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full border-l pl-4" style={{ borderColor: 'var(--bloom-border)', minWidth: 280 }}>
      <div className="flex items-center gap-2 mb-3 shrink-0">
        <MessageSquare size={16} style={{ color: 'var(--bloom-coral)' }} />
        <h3 className="font-serif font-bold text-sm" style={{ color: 'var(--bloom-text)' }}>Comments</h3>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--bloom-coral)' }} />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-3 min-h-0 mb-3">
          {comments.length === 0 ? (
            <p className="text-xs text-center py-4" style={{ color: 'var(--bloom-muted)' }}>No comments yet</p>
          ) : (
            comments.map((c) => renderComment(c))
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="shrink-0 space-y-2">
        {replyTo && (
          <p className="text-[10px]" style={{ color: 'var(--bloom-muted)' }}>
            Replying…{' '}
            <button type="button" onClick={() => setReplyTo(null)} className="underline">cancel</button>
          </p>
        )}
        <textarea
          rows={2}
          className="bloom-input w-full text-sm resize-none"
          placeholder="Add a comment…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <button type="submit" disabled={submitting || !content.trim()} className="bloom-btn-primary w-full text-sm flex items-center justify-center gap-1">
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <><Send size={14} /> Post</>}
        </button>
      </form>
    </div>
  );
}
