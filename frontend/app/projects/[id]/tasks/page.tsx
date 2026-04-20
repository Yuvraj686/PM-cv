'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { DndContext, DragOverlay, closestCorners, KeyboardSensor, PointerSensor, useSensor, useSensors, DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { KanbanColumn } from '@/components/tasks/KanbanColumn';
import { TaskCard } from '@/components/tasks/TaskCard';
import { api } from '@/lib/api';
import { Loader2, Trash2, X } from 'lucide-react';
import { useAuthStore } from '@/lib/store';
import { toast } from 'sonner';

export default function KanbanPage() {
  const { id } = useParams();
  const [tasks, setTasks] = useState<any[]>([]);
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
    assignee_id: '',
    due_date: '',
    status: 'todo',
  });
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
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchTasks();
  }, [id]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const columns = [
    { id: 'todo', title: 'To Do' },
    { id: 'in_progress', title: 'In Progress' },
    { id: 'done', title: 'Done' }
  ];

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    setActiveTask(tasks.find(t => t.id === active.id) || null);
  };

  const canCreate = myRole === 'admin' || myRole === 'project_lead';
  const canDelete = canCreate;
  const canEditTask = (task: any) =>
    myRole === 'admin' || myRole === 'project_lead' || (myRole === 'developer' && task.assignee_id === currentUser?.id);

  const openCreateModal = () => {
    setEditingTask(null);
    setForm({
      title: '',
      description: '',
      priority: 'medium',
      assignee_id: '',
      due_date: '',
      status: 'todo',
    });
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
    if (!form.title.trim()) {
      toast.error('Task title is required');
      return;
    }
    setSaving(true);
    try {
      if (editingTask) {
        await api.put(`/api/tasks/${editingTask.id}`, {
          title: form.title,
          description: form.description || null,
          priority: form.priority,
          assignee_id: form.assignee_id || null,
          due_date: form.due_date || null,
          status: form.status,
        });
      } else {
        await api.post('/api/tasks', {
          project_id: id,
          title: form.title,
          description: form.description || null,
          priority: form.priority,
          assignee_id: form.assignee_id || null,
          due_date: form.due_date || null,
          status: form.status,
        });
      }
      const res = await api.get(`/api/tasks?project_id=${id}`);
      setTasks(res.data);
      setIsModalOpen(false);
      toast.success(editingTask ? 'Task updated' : 'Task created');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to save task');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Delete this task?')) return;
    try {
      await api.delete(`/api/tasks/${taskId}`);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      toast.success('Task deleted');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to delete task');
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    const isActiveTask = active.data.current?.type === 'Task';
    const isOverColumn = over.data.current?.type === 'Column';

    if (isActiveTask && isOverColumn) {
      const newStatus = overId as string;
      const updatedTasks = tasks.map(t => {
        if (t.id === activeId) {
          return { ...t, status: newStatus };
        }
        return t;
      });
      setTasks(updatedTasks);
      
      try {
        await api.patch(`/api/tasks/${activeId}/status`, { status: newStatus });
      } catch (err) {
        // Revert on error
        const res = await api.get(`/api/tasks?project_id=${id}`);
        setTasks(res.data);
      }
    }
  };

  if (loading) return <div className="h-full flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>;

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="mb-6 flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-2xl font-bold font-geist tracking-tight">Kanban Board</h1>
          <p className="text-sm text-muted-foreground mt-1">Drag and drop tasks. Developers can edit their own assigned tasks.</p>
        </div>
        <button
          onClick={openCreateModal}
          disabled={!canCreate}
          title={!canCreate ? "You don't have permission" : 'Add Task'}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-all text-sm shadow-[0_0_10px_rgba(99,102,241,0.3)]"
        >
          Add Task
        </button>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-6 h-full items-start">
            {columns.map((col) => (
                <KanbanColumn
                key={col.id}
                column={col}
                tasks={tasks.filter((t) => t.status === col.id)}
                  onEditTask={(task: any) => canEditTask(task) && openEditModal(task)}
                  onDeleteTask={(task: any) => canDelete && handleDeleteTask(task.id)}
                  canDelete={canDelete}
                  canEditTask={canEditTask}
              />
            ))}
          </div>

          <DragOverlay>
            {activeTask ? <TaskCard task={activeTask} /> : null}
          </DragOverlay>
        </DndContext>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="w-full max-w-lg bg-[#1A1D24] border border-white/10 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{editingTask ? 'Edit Task' : 'Create Task'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <input className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-sm" placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <textarea className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-sm" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <select className="bg-black/30 border border-white/10 rounded px-3 py-2 text-sm" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
              <select className="bg-black/30 border border-white/10 rounded px-3 py-2 text-sm" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="done">Done</option>
              </select>
              <input type="date" className="bg-black/30 border border-white/10 rounded px-3 py-2 text-sm" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
              <select className="bg-black/30 border border-white/10 rounded px-3 py-2 text-sm" value={form.assignee_id} onChange={(e) => setForm({ ...form, assignee_id: e.target.value })}>
                <option value="">Unassigned</option>
                {members.map((m: any) => (
                  <option key={m.user_id} value={m.user_id}>{m.user?.name}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setIsModalOpen(false)} className="px-3 py-2 text-sm border border-white/10 rounded">Cancel</button>
              <button disabled={saving} onClick={handleSaveTask} className="px-3 py-2 text-sm bg-indigo-600 rounded disabled:opacity-50">
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
