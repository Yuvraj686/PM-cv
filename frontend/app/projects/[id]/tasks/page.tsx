'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import { apiClient } from '@/lib/api-client';
import { useApiError } from '@/hooks/useApiError';
import { Loader2, X, Filter, ChevronDown, FileText } from 'lucide-react';
import { useAuthStore, useKanbanStore } from '@/lib/store';
import { toast } from 'sonner';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { KanbanSkeleton } from '@/components/tasks/KanbanSkeleton';
import { ImproveTextButton } from '@/components/ai/ImproveTextButton';
import { TranscriptModal } from '@/components/ai/TranscriptModal';
import { PresenceBar } from '@/components/collaboration/PresenceBar';
import { TaskCommentsPanel } from '@/components/tasks/TaskCommentsPanel';

const KanbanBoard = dynamic(
  () => import('@/components/tasks/KanbanBoard').then((mod) => ({ default: mod.KanbanBoard })),
  { ssr: false, loading: () => <KanbanSkeleton /> },
);

const INPUT_CLASS = 'bloom-input w-full text-sm';

export default function KanbanPage() {
  const { id } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = id as string;
  const { handleApiError } = useApiError();
  const tasks = useKanbanStore((s) => s.tasksByProject[projectId] || []);
  const setProjectTasks = useKanbanStore((s) => s.setProjectTasks);
  const moveTaskOptimistic = useKanbanStore((s) => s.moveTaskOptimistic);
  const revertProjectTasks = useKanbanStore((s) => s.revertProjectTasks);
  const updateTaskCommentCount = useKanbanStore((s) => s.updateTaskCommentCount);

  const [members, setMembers] = useState<any[]>([]);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTask, setActiveTask] = useState<any | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<any | null>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    priority: 'medium',
    story_points: '',
    assignee_id: '',
    due_date: '',
    status: 'todo',
  });
  const [saving, setSaving] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const currentUser = useAuthStore((s) => s.user);

  const assigneeFilter = searchParams.get('assignee');
  const filteredTasks = assigneeFilter ? tasks.filter((task) => task.assignee_id === assigneeFilter) : tasks;
  const assigneeName = assigneeFilter
    ? members.find((m: any) => m.user_id === assigneeFilter)?.user?.name || 'Selected member'
    : null;

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const [taskRes, memberRes] = await Promise.all([
          apiClient.get(`/api/tasks?project_id=${projectId}`),
          apiClient.get(`/api/projects/${projectId}/members`),
        ]);
        setProjectTasks(projectId, taskRes);
        setMembers(memberRes);
        const mine = memberRes.find((m: any) => m.user_id === currentUser?.id);
        setMyRole(mine?.role || null);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchTasks();
  }, [projectId, currentUser?.id, setProjectTasks]);

  const canCreate  = myRole === 'admin' || myRole === 'project_lead';
  const canDelete  = canCreate;
  const canEditTask = (task: any) =>
    myRole === 'admin' || myRole === 'project_lead' ||
    (myRole === 'developer' && task.assignee_id === currentUser?.id);

  const openCreateModal = (status = 'todo') => {
    setEditingTask(null);
    setForm({
      title: '',
      description: '',
      priority: 'medium',
      story_points: '',
      assignee_id: '',
      due_date: '',
      status,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (task: any) => {
    setEditingTask(task);
    setForm({
      title: task.title || '',
      description: task.description || '',
      priority: task.priority || 'medium',
      story_points: task.story_points === null || task.story_points === undefined ? '' : String(task.story_points),
      assignee_id: task.assignee_id || '',
      due_date: task.due_date ? task.due_date.slice(0, 10) : '',
      status: task.status || 'todo',
    });
    setIsModalOpen(true);
  };

  const handleSaveTask = async () => {
    if (!form.title.trim()) { toast.error('Task title is required'); return; }
    const parsedStoryPoints = form.story_points === '' ? null : Number(form.story_points);
    if (parsedStoryPoints !== null && (Number.isNaN(parsedStoryPoints) || parsedStoryPoints < 0 || parsedStoryPoints > 100)) {
      toast.error('Story points must be between 0 and 100');
      return;
    }
    setSaving(true);
    try {
      if (editingTask) {
        await apiClient.put(`/api/tasks/${editingTask.id}`, {
          title: form.title, description: form.description || null,
          priority: form.priority, story_points: parsedStoryPoints, assignee_id: form.assignee_id || null,
          due_date: form.due_date || null, status: form.status,
        });
      } else {
        await apiClient.post('/api/tasks', {
          project_id: projectId, title: form.title, description: form.description || null,
          priority: form.priority, story_points: parsedStoryPoints, assignee_id: form.assignee_id || null,
          due_date: form.due_date || null, status: form.status,
        });
      }
      const res = await apiClient.get(`/api/tasks?project_id=${projectId}`);
      setProjectTasks(projectId, res);
      setIsModalOpen(false);
      toast.success(editingTask ? 'Task updated' : 'Task created');
    } catch (err: any) {
      handleApiError(err, 'Failed to save task');
    } finally { setSaving(false); }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Delete this task?')) return;
    try {
      await apiClient.delete(`/api/tasks/${taskId}`);
      setProjectTasks(projectId, tasks.filter((t) => t.id !== taskId));
      toast.success('Task deleted');
    } catch (err: any) {
      handleApiError(err, 'Failed to delete task');
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveTask(tasks.find((t) => t.id === event.active.id) || null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);
    if (!over) return;
    const isOverColumn = over.data.current?.type === 'Column';
    if (active.data.current?.type === 'Task' && isOverColumn) {
      const newStatus = over.id as string;
      const task = tasks.find((t) => t.id === active.id);
      if (!task || task.status === newStatus) return;

      const previousSnapshot = moveTaskOptimistic(projectId, active.id as string, newStatus);

      try {
        await apiClient.patch(`/api/tasks/${active.id}/status`, { status: newStatus });
      } catch (err: any) {
        revertProjectTasks(projectId, previousSnapshot);
        toast.error(err?.message || 'Failed to move task — reverted');
      }
    }
  };

  const handleCommentCountChange = useCallback(
    (count: number) => {
      if (editingTask?.id) updateTaskCommentCount(projectId, editingTask.id, count);
    },
    [editingTask?.id, projectId, updateTaskCommentCount],
  );

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin" style={{ color: 'var(--bloom-coral)' }} />
      </div>
    );
  }

  return (
    <div className="p-6 h-full flex flex-col">
      <PresenceBar projectId={projectId} />

      <div className="flex items-center justify-between mb-5 shrink-0">
        <div>
          <h2 className="font-serif text-xl font-bold" style={{ color: 'var(--bloom-text)' }}>Kanban Board</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--bloom-muted)' }}>Drag and drop to update status</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="bloom-btn-secondary flex items-center gap-1.5"
            onClick={() => assigneeFilter && router.push(`/projects/${projectId}/tasks`)}
            disabled={!assigneeFilter}
            title={assigneeFilter ? 'Clear assignee filter' : 'No active assignee filter'}
          >
            <Filter size={13} /> {assigneeFilter ? `Filtered: ${assigneeName}` : 'Filter'}
          </button>
          {canCreate && (
            <div className="relative">
              <button
                onClick={() => setCreateMenuOpen(!createMenuOpen)}
                className="bloom-btn-primary flex items-center gap-1"
              >
                + Add task
                <ChevronDown size={14} />
              </button>
              {createMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setCreateMenuOpen(false)} />
                  <div
                    className="absolute right-0 mt-1 z-20 min-w-[200px] rounded-lg shadow-lg py-1"
                    style={{ background: 'var(--bloom-surface)', border: '1px solid var(--bloom-border)' }}
                  >
                    <button
                      className="w-full text-left px-4 py-2 text-sm hover:bg-black/5 transition-colors"
                      style={{ color: 'var(--bloom-text)' }}
                      onClick={() => { setCreateMenuOpen(false); openCreateModal(); }}
                    >
                      New task
                    </button>
                    <button
                      className="w-full text-left px-4 py-2 text-sm hover:bg-black/5 transition-colors flex items-center gap-2"
                      style={{ color: 'var(--bloom-text)' }}
                      onClick={() => { setCreateMenuOpen(false); setTranscriptOpen(true); }}
                    >
                      <FileText size={14} /> Paste meeting transcript
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        {assigneeFilter && (
          <div
            className="mb-3 px-3 py-2 rounded-lg text-sm flex items-center justify-between"
            style={{ background: 'var(--bloom-yellow-bg)', color: 'var(--bloom-text)' }}
          >
            <span>Showing tasks assigned to {assigneeName}</span>
            <button
              className="text-xs font-medium underline"
              onClick={() => router.push(`/projects/${projectId}/tasks`)}
            >
              Clear filter
            </button>
          </div>
        )}
        <ErrorBoundary>
          <KanbanBoard
            tasks={filteredTasks}
            activeTask={activeTask}
            canDelete={canDelete}
            canEditTask={canEditTask}
            canCreate={canCreate}
            onEditTask={openEditModal}
            onDeleteTask={(task: any) => handleDeleteTask(task.id)}
            onAddTask={openCreateModal}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          />
        </ErrorBoundary>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
          <div
            className={`bloom-card shadow-2xl flex overflow-hidden ${editingTask ? 'max-w-3xl w-full' : 'max-w-md w-full'}`}
            style={{ maxHeight: '90vh' }}
          >
            <div className={`p-6 space-y-4 overflow-y-auto ${editingTask ? 'flex-1' : 'w-full'}`}>
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-lg font-bold" style={{ color: 'var(--bloom-text)' }}>
                  {editingTask ? 'Edit Task' : 'Create Task'}
                </h2>
                <button onClick={() => setIsModalOpen(false)} style={{ color: 'var(--bloom-muted)' }}>
                  <X size={18} />
                </button>
              </div>

              <input className={INPUT_CLASS} placeholder="Task title" value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })} />

              <textarea className={INPUT_CLASS} placeholder="Description (optional)" rows={3} value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })} />

              <ImproveTextButton
                text={form.description}
                onAccept={(improved) => setForm({ ...form, description: improved })}
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--bloom-muted)' }}>Priority</label>
                  <select className={INPUT_CLASS} value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--bloom-muted)' }}>Story points</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className={INPUT_CLASS}
                    value={form.story_points}
                    onChange={(e) => setForm({ ...form, story_points: e.target.value })}
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--bloom-muted)' }}>Status</label>
                  <select className={INPUT_CLASS} value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="done">Done</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--bloom-muted)' }}>Due date</label>
                  <input type="date" className={INPUT_CLASS} value={form.due_date}
                    onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--bloom-muted)' }}>Assignee</label>
                  <select className={INPUT_CLASS} value={form.assignee_id}
                    onChange={(e) => setForm({ ...form, assignee_id: e.target.value })}>
                    <option value="">Unassigned</option>
                    {members.map((m: any) => (
                      <option key={m.user_id} value={m.user_id}>{m.user?.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setIsModalOpen(false)} className="bloom-btn-secondary">Cancel</button>
                <button disabled={saving} onClick={handleSaveTask} className="bloom-btn-primary">
                  {saving ? 'Saving…' : editingTask ? 'Update' : 'Create'}
                </button>
              </div>
            </div>

            {editingTask && (
              <div className="w-80 shrink-0 p-4 overflow-hidden flex flex-col" style={{ background: 'var(--bloom-bg)' }}>
                <TaskCommentsPanel
                  taskId={editingTask.id}
                  projectId={projectId}
                  onCommentCountChange={handleCommentCountChange}
                />
              </div>
            )}
          </div>
        </div>
      )}

      <TranscriptModal
        projectId={projectId}
        members={members}
        isOpen={transcriptOpen}
        onClose={() => setTranscriptOpen(false)}
        onSaved={async () => {
          const res = await apiClient.get(`/api/tasks?project_id=${projectId}`);
          setProjectTasks(projectId, res);
        }}
      />
    </div>
  );
}
