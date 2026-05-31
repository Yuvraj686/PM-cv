'use client';

import { useState } from 'react';
import { Loader2, Sparkles, X, CheckSquare, Square } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useSSE, StreamingCursor } from '@/src/hooks/useSSE';
import { toast } from 'sonner';

interface GeneratedTask {
  id: string;
  title: string;
  description?: string;
  priority: string;
  estimated_hours?: number;
}

interface GenerateTasksModalProps {
  projectId: string;
  projectName?: string;
  isOpen: boolean;
  onClose: () => void;
  onComplete?: (projectId: string) => void;
}

export function GenerateTasksModal({
  projectId,
  projectName,
  isOpen,
  onClose,
  onComplete,
}: GenerateTasksModalProps) {
  const [projectGoal, setProjectGoal] = useState('');
  const [context, setContext] = useState('');
  const [phase, setPhase] = useState<'form' | 'generating' | 'preview'>('form');
  const [tasks, setTasks] = useState<GeneratedTask[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [taskId, setTaskId] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [streamPreview, setStreamPreview] = useState('');
  const { stream, isStreaming } = useSSE();

  if (!isOpen) return null;

  const toggleTask = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleGenerate = async () => {
    if (!projectGoal.trim()) {
      toast.error('Please describe your project goal');
      return;
    }
    setPhase('generating');
    setStreamPreview('');

    try {
      const { task_id } = await apiClient.post('/api/ai/generate-tasks', {
        project_id: projectId,
        project_goal: projectGoal,
        context: context || null,
      });
      setTaskId(task_id);

      for await (const msg of stream(`/api/ai/generate-tasks/${task_id}/stream`, { method: 'GET' })) {
        if (msg.chunk) setStreamPreview((p) => p + msg.chunk);
        if (msg.done && msg.tasks) {
          const generated = msg.tasks as GeneratedTask[];
          setTasks(generated);
          setSelected(new Set(generated.map((t) => t.id)));
          setPhase('preview');
          return;
        }
        if (msg.error) throw new Error(msg.error);
      }

      // Fallback to polling if stream ends without done
      const poll = async (): Promise<void> => {
        const res = await apiClient.get(`/api/ai/generate-tasks/${task_id}`);
        if (res.status === 'pending' || res.status === 'processing') {
          await new Promise((r) => setTimeout(r, 1500));
          return poll();
        }
        if (res.status === 'error') throw new Error(res.error || 'Generation failed');
        setTasks(res.tasks);
        setSelected(new Set(res.tasks.map((t: GeneratedTask) => t.id)));
        setPhase('preview');
      };
      await poll();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to generate tasks';
      toast.error(message);
      setPhase('form');
    }
  };

  const handleAccept = async () => {
    if (!taskId || selected.size === 0) {
      toast.error('Select at least one task');
      return;
    }
    setAccepting(true);
    try {
      await apiClient.post(`/api/ai/generate-tasks/${taskId}/accept`, {
        task_ids: Array.from(selected),
      });
      toast.success(`Added ${selected.size} task${selected.size > 1 ? 's' : ''} to the board`);
      onComplete?.(projectId);
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save tasks');
    } finally {
      setAccepting(false);
    }
  };

  const priorityColor: Record<string, string> = {
    critical: 'var(--bloom-coral)',
    high: '#E07A5F',
    medium: 'var(--bloom-yellow)',
    low: 'var(--bloom-green-bg)',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg bloom-card p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-lg font-bold flex items-center gap-2" style={{ color: 'var(--bloom-text)' }}>
            <Sparkles size={18} style={{ color: 'var(--bloom-coral)' }} />
            Generate tasks with AI
          </h2>
          <button onClick={onClose} style={{ color: 'var(--bloom-muted)' }}><X size={18} /></button>
        </div>

        {projectName && (
          <p className="text-sm" style={{ color: 'var(--bloom-muted)' }}>
            For project: <strong style={{ color: 'var(--bloom-text)' }}>{projectName}</strong>
          </p>
        )}

        {phase === 'form' && (
          <>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--bloom-muted)' }}>
                Project goal *
              </label>
              <textarea
                rows={3}
                className="bloom-input w-full text-sm"
                placeholder="e.g. Launch a mobile app MVP with user auth and a dashboard by Q3"
                value={projectGoal}
                onChange={(e) => setProjectGoal(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--bloom-muted)' }}>
                Additional context (optional)
              </label>
              <textarea
                rows={2}
                className="bloom-input w-full text-sm"
                placeholder="Team size, tech stack, constraints..."
                value={context}
                onChange={(e) => setContext(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={onClose} className="bloom-btn-secondary">Cancel</button>
              <button onClick={handleGenerate} className="bloom-btn-primary flex items-center gap-1.5">
                <Sparkles size={14} /> Generate
              </button>
            </div>
          </>
        )}

        {phase === 'generating' && (
          <div className="py-8 flex flex-col items-center gap-4 text-center">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--bloom-coral)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--bloom-text)' }}>
              AI is generating your task breakdown…
            </p>
            {streamPreview && (
              <p className="text-xs font-mono text-left w-full p-3 rounded-lg max-h-24 overflow-hidden opacity-60" style={{ background: 'var(--bloom-border)' }}>
                {streamPreview.slice(-200)}
                {isStreaming && <StreamingCursor />}
              </p>
            )}
          </div>
        )}

        {phase === 'preview' && (
          <>
            <p className="text-sm" style={{ color: 'var(--bloom-muted)' }}>
              Select tasks to add to your Kanban board:
            </p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {tasks.map((task) => (
                <label
                  key={task.id}
                  className="flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors hover:bg-black/5"
                  style={{ border: '1px solid var(--bloom-border)' }}
                >
                  <button type="button" onClick={() => toggleTask(task.id)} className="mt-0.5 shrink-0">
                    {selected.has(task.id)
                      ? <CheckSquare size={16} style={{ color: 'var(--bloom-coral)' }} />
                      : <Square size={16} style={{ color: 'var(--bloom-muted)' }} />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate" style={{ color: 'var(--bloom-text)' }}>
                        {task.title}
                      </span>
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0"
                        style={{ background: priorityColor[task.priority] || 'var(--bloom-border)', color: 'var(--bloom-text)' }}
                      >
                        {task.priority}
                      </span>
                      {task.estimated_hours != null && (
                        <span className="text-[10px] shrink-0" style={{ color: 'var(--bloom-muted)' }}>
                          ~{task.estimated_hours}h
                        </span>
                      )}
                    </div>
                    {task.description && (
                      <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--bloom-muted)' }}>
                        {task.description}
                      </p>
                    )}
                  </div>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setPhase('form')} className="bloom-btn-secondary">Back</button>
              <button
                disabled={accepting || selected.size === 0}
                onClick={handleAccept}
                className="bloom-btn-primary"
              >
                {accepting ? 'Saving…' : `Add ${selected.size} task${selected.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
