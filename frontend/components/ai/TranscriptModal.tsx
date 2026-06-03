'use client';

import { useState } from 'react';
import { Loader2, X, FileText, CheckSquare, Square } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';

interface ExtractedTask {
  title: string;
  assignee_mention?: string;
  assignee_id?: string;
  due_date_mention?: string;
  priority: string;
}

interface TranscriptModalProps {
  projectId: string;
  members: { user_id: string; user?: { name?: string } }[];
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function TranscriptModal({ projectId, members, isOpen, onClose, onSaved }: TranscriptModalProps) {
  const [transcript, setTranscript] = useState('');
  const [phase, setPhase] = useState<'paste' | 'preview'>('paste');
  const [tasks, setTasks] = useState<ExtractedTask[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const memberName = (id?: string) =>
    members.find((m) => m.user_id === id)?.user?.name || null;

  const handleExtract = async () => {
    if (transcript.trim().length < 10) {
      toast.error('Please paste a longer transcript');
      return;
    }
    setLoading(true);
    try {
      const res = await apiClient.post('/api/ai/transcript-to-tasks', {
        transcript,
        project_id: projectId,
      });
      const extracted: ExtractedTask[] = res.tasks || [];
      setTasks(extracted);
      setSelected(new Set(extracted.map((_, i) => i)));
      setPhase('preview');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to extract tasks');
    } finally {
      setLoading(false);
    }
  };

  const toggle = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const handleSave = async () => {
    const toSave = tasks.filter((_, i) => selected.has(i));
    if (toSave.length === 0) {
      toast.error('Select at least one task');
      return;
    }
    setSaving(true);
    try {
      await Promise.all(
        toSave.map((t) =>
          apiClient.post('/api/tasks', {
            project_id: projectId,
            title: t.title,
            priority: t.priority || 'medium',
            assignee_id: t.assignee_id || null,
            status: 'todo',
          }),
        ),
      );
      toast.success(`Created ${toSave.length} task${toSave.length > 1 ? 's' : ''} from transcript`);
      onSaved();
      onClose();
      setTranscript('');
      setPhase('paste');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create tasks');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg bloom-card p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-lg font-bold flex items-center gap-2" style={{ color: 'var(--bloom-text)' }}>
            <FileText size={18} /> Paste meeting transcript
          </h2>
          <button onClick={onClose} style={{ color: 'var(--bloom-muted)' }}><X size={18} /></button>
        </div>

        {phase === 'paste' && (
          <>
            <textarea
              rows={8}
              className="bloom-input w-full text-sm font-mono"
              placeholder="Paste your meeting notes or transcript here…"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="bloom-btn-secondary">Cancel</button>
              <button disabled={loading} onClick={handleExtract} className="bloom-btn-primary">
                {loading ? <Loader2 size={16} className="animate-spin" /> : 'Extract action items'}
              </button>
            </div>
          </>
        )}

        {phase === 'preview' && (
          <>
            <p className="text-sm" style={{ color: 'var(--bloom-muted)' }}>
              Review extracted tasks before saving:
            </p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {tasks.map((task, i) => (
                <label
                  key={i}
                  className="flex items-start gap-3 p-3 rounded-lg cursor-pointer"
                  style={{ border: '1px solid var(--bloom-border)' }}
                >
                  <button type="button" onClick={() => toggle(i)} className="mt-0.5">
                    {selected.has(i)
                      ? <CheckSquare size={16} style={{ color: 'var(--bloom-coral)' }} />
                      : <Square size={16} style={{ color: 'var(--bloom-muted)' }} />}
                  </button>
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--bloom-text)' }}>{task.title}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--bloom-muted)' }}>
                      {task.assignee_mention && (
                        <>Assignee: {memberName(task.assignee_id) || task.assignee_mention} · </>
                      )}
                      {task.due_date_mention && <>Due: {task.due_date_mention} · </>}
                      Priority: {task.priority}
                    </p>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setPhase('paste')} className="bloom-btn-secondary">Back</button>
              <button disabled={saving} onClick={handleSave} className="bloom-btn-primary">
                {saving ? 'Saving…' : `Create ${selected.size} task${selected.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
