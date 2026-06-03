'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Loader2, Calendar, FolderKanban, ArrowUpRight, X, CheckCircle2, Clock, BarChart3, Layers } from 'lucide-react';
import api from '@/lib/api';
import { NewProjectModal } from '@/components/dashboard/NewProjectModal';
import { useAuthStore } from '@/lib/store';

const PROJECT_COLORS = ['#E07A5F','#8DB88A','#C9A84C','#9B8EC4','#7A8FA6','#D4845A'];

const GREETINGS = ['Good morning', 'Good afternoon', 'Good evening'];
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return GREETINGS[0];
  if (h < 17) return GREETINGS[1];
  return GREETINGS[2];
}
function getDayLabel() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

/* ─── Slide-over panel ─────────────────────────────────────────────────────── */
function SlidePanel({
  open, onClose, title, icon, children,
}: {
  open: boolean; onClose: () => void; title: string; icon: React.ReactNode; children: React.ReactNode;
}) {
  // close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* backdrop */}
          <motion.div
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.18)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />
          {/* panel */}
          <motion.div
            className="fixed right-0 top-0 h-full z-50 flex flex-col shadow-2xl"
            style={{ width: 420, background: 'var(--bloom-surface)', borderLeft: '1px solid var(--bloom-border)' }}
            initial={{ x: 420 }} animate={{ x: 0 }} exit={{ x: 420 }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
          >
            {/* header */}
            <div className="flex items-center gap-3 px-6 py-4 shrink-0" style={{ borderBottom: '1px solid var(--bloom-border)' }}>
              <span className="text-2xl">{icon}</span>
              <h2 className="font-serif font-bold text-lg flex-1" style={{ color: 'var(--bloom-text)' }}>{title}</h2>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-black/5 transition-colors"
                style={{ color: 'var(--bloom-muted)' }}
              >
                <X size={16} />
              </button>
            </div>
            {/* body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ─── Main page ────────────────────────────────────────────────────────────── */
export default function DashboardPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [allTasks, setAllTasks] = useState<any[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [panel, setPanel] = useState<'active' | 'done' | 'ontime' | 'total' | null>(null);
  const projectsRef = useRef<HTMLDivElement>(null);
  const user = useAuthStore((s) => s.user);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/projects');
      const withProgress = await Promise.all(
        res.data.map(async (p: any, i: number) => {
          try {
            const progRes = await api.get(`/api/projects/${p.id}/progress`);
            const deadlineDate = p.deadline ? new Date(p.deadline) : null;
            let daysLeft: number | null = null;
            if (deadlineDate) {
              daysLeft = Math.ceil((deadlineDate.getTime() - Date.now()) / 86400000);
            }
            const tasksRemaining = (progRes.data.total || 0) - (progRes.data.done || 0);
            let status: 'On Track' | 'At Risk' | 'Overdue' | 'Done' = 'On Track';
            if (progRes.data.total > 0 && progRes.data.done === progRes.data.total) status = 'Done';
            else if (daysLeft !== null && daysLeft < 0) status = 'Overdue';
            else if (daysLeft !== null && daysLeft < 5 && tasksRemaining > 0) status = 'At Risk';
            return { ...p, progress: progRes.data.percent, status, daysLeft, color: PROJECT_COLORS[i % PROJECT_COLORS.length], ...progRes.data };
          } catch {
            return { ...p, progress: 0, status: 'On Track', daysLeft: null, color: PROJECT_COLORS[i % PROJECT_COLORS.length] };
          }
        })
      );
      setProjects(withProgress);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  /* fetch all tasks across projects for panels */
  const fetchAllTasks = useCallback(async () => {
    if (allTasks.length > 0 || projects.length === 0) return;
    setTasksLoading(true);
    try {
      const nested = await Promise.all(
        projects.map((p) =>
          api.get(`/api/tasks?project_id=${p.id}`)
            .then((r) => r.data.map((t: any) => ({ ...t, projectName: p.name, projectColor: p.color })))
            .catch(() => [])
        )
      );
      setAllTasks(nested.flat());
    } catch {}
    finally { setTasksLoading(false); }
  }, [projects, allTasks.length]);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const openPanel = (type: typeof panel) => {
    setPanel(type);
    if (type !== 'active') fetchAllTasks();
  };

  const totalTasks = projects.reduce((sum, p) => sum + (p.total || 0), 0);
  const doneTasks  = projects.reduce((sum, p) => sum + (p.done || 0), 0);
  const onTime     = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const statusStyle: Record<string, { bg: string; color: string }> = {
    'Done':     { bg: 'var(--bloom-green-bg)',  color: '#4a8a46' },
    'On Track': { bg: 'var(--bloom-purple-bg)', color: 'var(--bloom-purple)' },
    'At Risk':  { bg: 'var(--bloom-yellow-bg)', color: 'var(--bloom-yellow)' },
    'Overdue':  { bg: 'var(--bloom-coral-bg)',  color: 'var(--bloom-coral)' },
  };

  const kpis = [
    {
      id: 'active' as const,
      icon: '📁',
      label: 'Active projects',
      value: projects.length,
      bgIcon: 'var(--bloom-coral-bg)',
      color: 'var(--bloom-coral)',
      lucideIcon: <FolderKanban size={14} />,
      hint: 'View projects',
    },
    {
      id: 'done' as const,
      icon: '✅',
      label: 'Tasks completed',
      value: doneTasks,
      bgIcon: 'var(--bloom-green-bg)',
      color: 'var(--bloom-green)',
      lucideIcon: <CheckCircle2 size={14} />,
      hint: 'View completed tasks',
    },
    {
      id: 'ontime' as const,
      icon: '📈',
      label: 'On-time delivery',
      value: `${onTime}%`,
      bgIcon: 'var(--bloom-yellow-bg)',
      color: 'var(--bloom-yellow)',
      lucideIcon: <BarChart3 size={14} />,
      hint: 'View breakdown',
    },
    {
      id: 'total' as const,
      icon: '⏱',
      label: 'Total tasks',
      value: totalTasks,
      bgIcon: 'var(--bloom-purple-bg)',
      color: 'var(--bloom-purple)',
      lucideIcon: <Layers size={14} />,
      hint: 'View all tasks',
    },
  ];

  if (loading && projects.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin" style={{ color: 'var(--bloom-coral)' }} />
      </div>
    );
  }

  /* ── panel content helpers ── */
  const donePanelTasks = allTasks.filter((t) => t.status === 'done' || t.status === 'completed');
  const tasksByStatus  = allTasks.reduce<Record<string, any[]>>((acc, t) => {
    const s = t.status || 'unknown';
    acc[s] = acc[s] ? [...acc[s], t] : [t];
    return acc;
  }, {});

  const statusLabel: Record<string, string> = {
    todo: 'To Do', in_progress: 'In Progress', done: 'Done', completed: 'Completed',
    review: 'In Review', blocked: 'Blocked',
  };

  const EmptyState = ({ text }: { text: string }) => (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <p className="text-sm" style={{ color: 'var(--bloom-muted)' }}>{text}</p>
    </div>
  );

  const TaskRow = ({ task }: { task: any }) => (
    <div
      className="p-3 rounded-xl flex items-start gap-3 transition-colors hover:bg-black/5"
      style={{ border: '1px solid var(--bloom-border)' }}
    >
      <span className="mt-0.5 w-2 h-2 rounded-full shrink-0" style={{ background: task.projectColor || 'var(--bloom-coral)', marginTop: 6 }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: 'var(--bloom-text)' }}>{task.title}</p>
        {task.projectName && (
          <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--bloom-muted)' }}>{task.projectName}</p>
        )}
      </div>
      {task.due_date && (
        <span className="text-[11px] shrink-0 flex items-center gap-1" style={{ color: 'var(--bloom-muted)' }}>
          <Clock size={10} />{new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
      )}
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* ── Greeting banner ── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl p-7 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #FDEEE9 0%, #EDF4EC 100%)' }}
      >
        <p className="text-sm font-medium mb-1" style={{ color: 'var(--bloom-muted)' }}>{getDayLabel()}</p>
        <h2 className="font-serif text-3xl font-bold mb-4" style={{ color: 'var(--bloom-text)' }}>
          {getGreeting()}, {user?.name?.split(' ')[0] || 'there'} — your projects at a glance.
        </h2>
        <div className="flex flex-wrap gap-2">
          {projects.slice(0, 3).map((p) => (
            <Link key={p.id} href={`/projects/${p.id}/tasks`}>
              <span
                className="px-3 py-1.5 rounded-full text-sm font-medium cursor-pointer transition-all hover:opacity-80"
                style={{ background: 'rgba(255,255,255,0.7)', color: 'var(--bloom-text)', border: '1px solid rgba(0,0,0,0.06)' }}
              >
                {p.name}
              </span>
            </Link>
          ))}
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-3 py-1.5 rounded-full text-sm font-medium transition-all hover:opacity-80"
            style={{ background: 'rgba(255,255,255,0.7)', color: 'var(--bloom-text)', border: '1px solid rgba(0,0,0,0.06)' }}
          >
            + New project
          </button>
        </div>
      </motion.div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => (
          <motion.button
            key={kpi.label}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
            onClick={() => openPanel(kpi.id)}
            className="bloom-card p-5 flex flex-col gap-3 text-left group cursor-pointer w-full"
            style={{ transition: 'box-shadow 0.2s, transform 0.2s' }}
            whileHover={{ y: -3, boxShadow: '0 8px 30px rgba(0,0,0,0.10)' }}
            whileTap={{ scale: 0.97 }}
          >
            <div className="flex items-start justify-between">
              <div className="stat-icon" style={{ background: kpi.bgIcon }}>
                <span style={{ fontSize: 20 }}>{kpi.icon}</span>
              </div>
              <span
                className="flex items-center gap-1 text-[11px] font-medium opacity-0 group-hover:opacity-100 transition-opacity px-2 py-0.5 rounded-full"
                style={{ background: kpi.bgIcon, color: kpi.color }}
              >
                {kpi.lucideIcon}
                {kpi.hint}
              </span>
            </div>
            <div>
              <div className="text-3xl font-bold font-serif" style={{ color: 'var(--bloom-text)' }}>{kpi.value}</div>
              <div className="text-sm mt-0.5" style={{ color: 'var(--bloom-muted)' }}>{kpi.label}</div>
            </div>
          </motion.button>
        ))}
      </div>

      {/* ── Projects grid ── */}
      <div ref={projectsRef}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-xl font-bold" style={{ color: 'var(--bloom-text)' }}>Projects</h2>
          <button onClick={() => setIsModalOpen(true)} className="bloom-btn-primary text-sm">
            <Plus size={14} />
            New project
          </button>
        </div>

        {projects.length === 0 ? (
          <div
            className="bloom-card rounded-2xl p-12 text-center flex flex-col items-center"
            style={{ borderStyle: 'dashed', borderColor: 'var(--bloom-border)' }}
          >
            <FolderKanban className="w-10 h-10 mb-3" style={{ color: 'var(--bloom-muted)' }} />
            <h3 className="font-serif text-lg font-bold mb-1" style={{ color: 'var(--bloom-text)' }}>No projects yet</h3>
            <p className="text-sm mb-5" style={{ color: 'var(--bloom-muted)' }}>
              Create a project to start collaborating with your team.
            </p>
            <button onClick={() => setIsModalOpen(true)} className="bloom-btn-primary">
              <Plus size={14} /> Create Project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project, i) => {
              const ss = statusStyle[project.status] || statusStyle['On Track'];
              return (
                <motion.div
                  key={project.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                >
                  <Link href={`/projects/${project.id}/tasks`}>
                    <div className="bloom-card p-5 hover:shadow-md transition-shadow cursor-pointer group h-full">
                      <div className="flex items-start justify-between mb-4">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white text-sm"
                          style={{ background: project.color }}
                        >
                          {project.name.charAt(0).toUpperCase()}
                        </div>
                        <span
                          className="text-xs font-semibold px-2.5 py-1 rounded-full"
                          style={{ background: ss.bg, color: ss.color }}
                        >
                          {project.status}
                        </span>
                      </div>

                      <h3 className="font-semibold text-base mb-1 group-hover:opacity-80 transition-opacity" style={{ color: 'var(--bloom-text)' }}>
                        {project.name}
                      </h3>
                      <p className="text-sm line-clamp-2 mb-4 h-9" style={{ color: 'var(--bloom-muted)' }}>
                        {project.description || 'No description provided.'}
                      </p>

                      {/* Progress bar */}
                      <div className="mb-3">
                        <div className="flex justify-between text-xs mb-1.5" style={{ color: 'var(--bloom-muted)' }}>
                          <span>Progress</span>
                          <span className="font-semibold">{project.progress || 0}%</span>
                        </div>
                        <div className="h-1.5 rounded-full" style={{ background: 'var(--bloom-border)' }}>
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${project.progress || 0}%`, background: project.color }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid var(--bloom-border)' }}>
                        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--bloom-muted)' }}>
                          <Calendar size={12} />
                          {project.daysLeft === null ? 'No deadline'
                            : project.daysLeft < 0 ? `${Math.abs(project.daysLeft)}d overdue`
                            : `${project.daysLeft}d left`}
                        </div>
                        <ArrowUpRight size={14} style={{ color: 'var(--bloom-muted)' }} className="group-hover:opacity-100 opacity-0 transition-opacity" />
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      <NewProjectModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSuccess={fetchProjects} />

      {/* ═══ SLIDE PANELS ═══════════════════════════════════════════════════ */}

      {/* Active Projects */}
      <SlidePanel open={panel === 'active'} onClose={() => setPanel(null)} title="Active Projects" icon="📁">
        {projects.length === 0 ? (
          <EmptyState text="No projects yet. Create one to get started!" />
        ) : (
          projects.map((p) => {
            const ss = statusStyle[p.status] || statusStyle['On Track'];
            return (
              <Link key={p.id} href={`/projects/${p.id}/tasks`} onClick={() => setPanel(null)}>
                <div
                  className="p-4 rounded-xl transition-colors hover:bg-black/5 cursor-pointer"
                  style={{ border: '1px solid var(--bloom-border)' }}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white text-sm shrink-0"
                      style={{ background: p.color }}
                    >
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate" style={{ color: 'var(--bloom-text)' }}>{p.name}</p>
                      <span
                        className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: ss.bg, color: ss.color }}
                      >
                        {p.status}
                      </span>
                    </div>
                    <ArrowUpRight size={14} style={{ color: 'var(--bloom-muted)' }} />
                  </div>
                  <div className="h-1.5 rounded-full" style={{ background: 'var(--bloom-border)' }}>
                    <div className="h-full rounded-full" style={{ width: `${p.progress || 0}%`, background: p.color }} />
                  </div>
                  <p className="text-[11px] mt-1.5" style={{ color: 'var(--bloom-muted)' }}>
                    {p.done || 0} / {p.total || 0} tasks done · {p.progress || 0}%
                  </p>
                </div>
              </Link>
            );
          })
        )}
      </SlidePanel>

      {/* Tasks Completed */}
      <SlidePanel open={panel === 'done'} onClose={() => setPanel(null)} title="Completed Tasks" icon="✅">
        {tasksLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin" style={{ color: 'var(--bloom-coral)' }} /></div>
        ) : donePanelTasks.length === 0 ? (
          <EmptyState text="No completed tasks yet. Keep going! 💪" />
        ) : (
          <>
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--bloom-muted)' }}>
              {donePanelTasks.length} task{donePanelTasks.length !== 1 ? 's' : ''} completed
            </p>
            {donePanelTasks.map((t) => <TaskRow key={t.id} task={t} />)}
          </>
        )}
      </SlidePanel>

      {/* On-time Delivery */}
      <SlidePanel open={panel === 'ontime'} onClose={() => setPanel(null)} title="On-time Delivery" icon="📈">
        {projects.length === 0 ? (
          <EmptyState text="No projects to analyse yet." />
        ) : (
          <>
            {/* Overall */}
            <div
              className="p-4 rounded-xl mb-2"
              style={{ background: 'var(--bloom-yellow-bg)', border: '1px solid var(--bloom-border)' }}
            >
              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--bloom-yellow)' }}>Overall on-time rate</p>
              <p className="text-4xl font-bold font-serif" style={{ color: 'var(--bloom-text)' }}>{onTime}%</p>
              <p className="text-xs mt-1" style={{ color: 'var(--bloom-muted)' }}>
                {doneTasks} of {totalTasks} tasks completed
              </p>
            </div>

            <p className="text-[10px] font-semibold uppercase tracking-widest mt-4 mb-2" style={{ color: 'var(--bloom-muted)' }}>
              Per project
            </p>
            {projects.map((p) => {
              const rate = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
              return (
                <div
                  key={p.id}
                  className="p-3 rounded-xl"
                  style={{ border: '1px solid var(--bloom-border)' }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                      <p className="text-sm font-medium" style={{ color: 'var(--bloom-text)' }}>{p.name}</p>
                    </div>
                    <span className="text-sm font-bold" style={{ color: 'var(--bloom-text)' }}>{rate}%</span>
                  </div>
                  <div className="h-1.5 rounded-full" style={{ background: 'var(--bloom-border)' }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${rate}%`, background: p.color }} />
                  </div>
                  <p className="text-[11px] mt-1" style={{ color: 'var(--bloom-muted)' }}>
                    {p.done || 0} / {p.total || 0} tasks ·{' '}
                    {p.daysLeft === null ? 'No deadline' : p.daysLeft < 0 ? `${Math.abs(p.daysLeft)}d overdue` : `${p.daysLeft}d left`}
                  </p>
                </div>
              );
            })}
          </>
        )}
      </SlidePanel>

      {/* Total Tasks */}
      <SlidePanel open={panel === 'total'} onClose={() => setPanel(null)} title="All Tasks" icon="⏱">
        {tasksLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin" style={{ color: 'var(--bloom-coral)' }} /></div>
        ) : allTasks.length === 0 ? (
          <EmptyState text="No tasks found across your projects." />
        ) : (
          <>
            {/* Summary bar */}
            <div
              className="p-4 rounded-xl mb-3"
              style={{ background: 'var(--bloom-purple-bg)', border: '1px solid var(--bloom-border)' }}
            >
              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--bloom-purple)' }}>Total tasks</p>
              <p className="text-4xl font-bold font-serif" style={{ color: 'var(--bloom-text)' }}>{allTasks.length}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--bloom-muted)' }}>
                across {projects.length} project{projects.length !== 1 ? 's' : ''}
              </p>
            </div>

            {/* By status */}
            {Object.entries(tasksByStatus).map(([status, tasks]) => (
              <div key={status}>
                <p className="text-[10px] font-semibold uppercase tracking-widest mt-4 mb-2" style={{ color: 'var(--bloom-muted)' }}>
                  {statusLabel[status] || status} ({tasks.length})
                </p>
                {tasks.map((t) => <TaskRow key={t.id} task={t} />)}
              </div>
            ))}
          </>
        )}
      </SlidePanel>
    </div>
  );
}
