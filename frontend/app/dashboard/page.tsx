'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Plus, Loader2, Calendar, FolderKanban, ArrowUpRight } from 'lucide-react';
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

export default function DashboardPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
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

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const totalTasks = projects.reduce((sum, p) => sum + (p.total || 0), 0);
  const doneTasks  = projects.reduce((sum, p) => sum + (p.done || 0), 0);
  const onTime     = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const statusStyle: Record<string, { bg: string; color: string }> = {
    'Done':     { bg: 'var(--bloom-green-bg)',  color: '#4a8a46' },
    'On Track': { bg: 'var(--bloom-purple-bg)', color: 'var(--bloom-purple)' },
    'At Risk':  { bg: 'var(--bloom-yellow-bg)', color: 'var(--bloom-yellow)' },
    'Overdue':  { bg: 'var(--bloom-coral-bg)',  color: 'var(--bloom-coral)' },
  };

  if (loading && projects.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin" style={{ color: 'var(--bloom-coral)' }} />
      </div>
    );
  }

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
        {[
          { icon: '📁', label: 'Active projects',   value: projects.length,  delta: '', bgIcon: 'var(--bloom-coral-bg)',  color: 'var(--bloom-coral)' },
          { icon: '✅', label: 'Tasks completed',   value: doneTasks,         delta: '', bgIcon: 'var(--bloom-green-bg)',  color: 'var(--bloom-green)' },
          { icon: '📈', label: 'On-time delivery',  value: `${onTime}%`,      delta: '', bgIcon: 'var(--bloom-yellow-bg)', color: 'var(--bloom-yellow)' },
          { icon: '⏱', label: 'Total tasks',        value: totalTasks,        delta: '', bgIcon: 'var(--bloom-purple-bg)', color: 'var(--bloom-purple)' },
        ].map((kpi, i) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
            className="bloom-card p-5 flex flex-col gap-3"
          >
            <div className="flex items-start justify-between">
              <div className="stat-icon" style={{ background: kpi.bgIcon }}>
                <span style={{ fontSize: 20 }}>{kpi.icon}</span>
              </div>
            </div>
            <div>
              <div className="text-3xl font-bold font-serif" style={{ color: 'var(--bloom-text)' }}>{kpi.value}</div>
              <div className="text-sm mt-0.5" style={{ color: 'var(--bloom-muted)' }}>{kpi.label}</div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* ── Projects grid ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-xl font-bold" style={{ color: 'var(--bloom-text)' }}>Projects</h2>
          <button
            onClick={() => setIsModalOpen(true)}
            className="bloom-btn-primary text-sm"
          >
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
    </div>
  );
}
