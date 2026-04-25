'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { DndContext, DragOverlay, closestCorners, KeyboardSensor, PointerSensor, useSensor, useSensors, DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { KanbanColumn } from '@/components/tasks/KanbanColumn';
import { TaskCard } from '@/components/tasks/TaskCard';
import api from '@/lib/api';
import { Loader2, X, Filter } from 'lucide-react';
import { useAuthStore } from '@/lib/store';
import { toast } from 'sonner';

const INPUT_CLASS = 'bloom-input w-full text-sm';

export default function KanbanPage() {
  const { id } = useParams();
  const [tasks, setTasks] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTask, setActiveTask] = useState<any | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<any | null>(null);
  const [defaultStatus, setDefaultStatus] = useState('todo');
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', assignee_id: '', due_date: '', status: 'todo' });
  const [saving, setSaving] = useState(false);
  const currentUser = useAuthStore((s) => s.user);

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const [taskRes, memberRes] = await Promise.all([
          api.get(`/api/tasks?project_id=${id}`),
          api.get(`/api/projects/${id}/members`),
        ]);
        setTasks(taskRes.data);
        setMembers(memberRes.data);
        const mine = memberRes.data.find((m: any) => m.user_id === currentUser?.id);
        setMyRole(mine?.role || null);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    fetchTasks();
  }, [id]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const columns = [
    { id: 'todo',        title: 'To Do' },
    { id: 'in_progress', title: 'In Progress' },
    { id: 'done',        title: 'Done' },
  ];

  const canCreate  = myRole === 'admin' || myRole === 'project_lead';
  const canDelete  = canCreate;
  const canEditTask = (task: any) =>
    myRole === 'admin' || myRole === 'project_lead' ||
    (myRole === 'developer' && task.assignee_id === currentUser?.id);

  const openCreateModal = (status = 'todo') => {
    setEditingTask(null);
    setDefaultStatus(status);
    setForm({ title: '', description: '', priority: 'medium', assignee_id: '', due_date: '', status });
    setIsModalOpen(true);
  };

  const openEditModal = (task: any) => {
    setEditingTask(task);
    setForm({
      title: task.title || '',
      description: task.description || '',
      priority: task.priority || 'medium',
      assignee_id: task.assignee_id || '',
      due_date: task.due_date ? task.due_date.slice(0, 10) : '',
      status: task.status || 'todo',
    });
    setIsModalOpen(true);
  };

  const handleSaveTask = async () => {
    if (!form.title.trim()) { toast.error('Task title is required'); return; }
    setSaving(true);
    try {
      if (editingTask) {
        await api.put(`/api/tasks/${editingTask.id}`, {
          title: form.title, description: form.description || null,
          priority: form.priority, assignee_id: form.assignee_id || null,
          due_date: form.due_date || null, status: form.status,
        });
      } else {
        await api.post('/api/tasks', {
          project_id: id, title: form.title, description: form.description || null,
          priority: form.priority, assignee_id: form.assignee_id || null,
          due_date: form.due_date || null, status: form.status,
        });
      }
      const res = await api.get(`/api/tasks?project_id=${id}`);
      setTasks(res.data);
      setIsModalOpen(false);
      toast.success(editingTask ? 'Task updated' : 'Task created');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to save task');
    } finally { setSaving(false); }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Delete this task?')) return;
    try {
      await api.delete(`/api/tasks/${taskId}`);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      toast.success('Task deleted');
    } catch (err: any) { toast.error(err.response?.data?.detail || 'Failed to delete task'); }
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
      setTasks((prev) => prev.map((t) => (t.id === active.id ? { ...t, status: newStatus } : t)));
      try { await api.patch(`/api/tasks/${active.id}/status`, { status: newStatus }); }
      catch { const res = await api.get(`/api/tasks?project_id=${id}`); setTasks(res.data); }
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin" style={{ color: 'var(--bloom-coral)' }} />
      </div>
    );
  }

  return (
    <div className="p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 shrink-0">
        <div>
          <h2 className="font-serif text-xl font-bold" style={{ color: 'var(--bloom-text)' }}>Kanban Board</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--bloom-muted)' }}>Drag and drop to update status</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="bloom-btn-secondary flex items-center gap-1.5">
            <Filter size={13} /> Filter
          </button>
          {canCreate && (
            <button onClick={() => openCreateModal()} className="bloom-btn-primary">
              + Add task
            </button>
          )}
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex gap-4 h-full items-start pb-4">
            {columns.map((col) => (
              <KanbanColumn
                key={col.id}
                column={col}
                tasks={tasks.filter((t) => t.status === col.id)}
                onEditTask={(task: any) => canEditTask(task) && openEditModal(task)}
                onDeleteTask={(task: any) => canDelete && handleDeleteTask(task.id)}
                canDelete={canDelete}
                canEditTask={canEditTask}
                onAddTask={canCreate ? () => openCreateModal(col.id) : undefined}
              />
            ))}
          </div>
          <DragOverlay>
            {activeTask ? <TaskCard task={activeTask} /> : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Task Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
          <div className="w-full max-w-md bloom-card p-6 space-y-4 shadow-2xl">
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
        </div>
      )}
    </div>
  );
}
