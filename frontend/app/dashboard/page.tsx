'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Plus, ArrowRight, Loader2, Calendar, FolderKanban } from 'lucide-react';
import { api } from '@/lib/api';
import { NewProjectModal } from '@/components/dashboard/NewProjectModal';

export default function DashboardPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/projects');
      const projectedWithProgress = await Promise.all(
        res.data.map(async (p: any) => {
          try {
            const progRes = await api.get(`/api/projects/${p.id}/progress`);
            const deadlineDate = p.deadline ? new Date(p.deadline) : null;
            let daysLeft: number | null = null;
            if (deadlineDate) {
              const diffMs = deadlineDate.getTime() - Date.now();
              daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
            }

            const tasksRemaining = (progRes.data.total || 0) - (progRes.data.done || 0);
            let status: 'On Track' | 'At Risk' | 'Overdue' | 'Done' = 'On Track';
            if (progRes.data.total > 0 && progRes.data.done === progRes.data.total) {
              status = 'Done';
            } else if (daysLeft !== null && daysLeft < 0) {
              status = 'Overdue';
            } else if (daysLeft !== null && daysLeft < 5 && tasksRemaining > 0) {
              status = 'At Risk';
            }

            return { ...p, progress: progRes.data.percent, status, daysLeft };
          } catch {
            return { ...p, progress: 0, status: 'On Track', daysLeft: null };
          }
        })
      );
      setProjects(projectedWithProgress);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  if (loading && projects.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-geist tracking-tight">Projects</h1>
          <p className="text-muted-foreground mt-1">Manage and track your active workspaces</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 px-5 rounded-lg transition-all shadow-[0_0_15px_rgba(99,102,241,0.3)] hover:shadow-[0_0_25px_rgba(99,102,241,0.5)] flex items-center space-x-2"
        >
          <Plus size={18} />
          <span>New Project</span>
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="glass-panel rounded-2xl p-12 text-center border-dashed border-2 border-white/10 flex flex-col items-center">
          <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
            <FolderKanban className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-xl font-bold mb-2">No projects yet</h3>
          <p className="text-muted-foreground mb-6 max-w-md">It looks like you aren't part of any projects. Create a new one to start collaborating with your team.</p>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-white/10 hover:bg-white/15 text-white font-medium py-2.5 px-6 rounded-lg transition-all border border-white/10 flex items-center space-x-2"
          >
            <Plus size={18} />
            <span>Create Project</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project, i) => (
            <motion.div
              key={project.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
            >
              <Link href={`/projects/${project.id}/tasks`}>
                <div className="glass-panel group rounded-xl p-6 h-full border border-white/5 hover:border-indigo-500/50 hover:bg-white/10 transition-all duration-300">
                  <div className="flex justify-between items-start mb-6">
                    <div className="p-3 bg-gradient-to-tr from-indigo-500/20 to-purple-500/20 rounded-lg border border-indigo-500/20 text-indigo-400 group-hover:text-indigo-300 transition-colors">
                      {project.name.charAt(0).toUpperCase()}
                    </div>
                    {project.status === 'Done' ? (
                      <span className="px-2.5 py-1 text-xs font-semibold bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20 flex items-center space-x-1">
                        Done
                      </span>
                    ) : project.status === 'Overdue' ? (
                      <span className="px-2.5 py-1 text-xs font-semibold bg-red-500/10 text-red-400 rounded-full border border-red-500/20 flex items-center space-x-1">
                        Overdue
                      </span>
                    ) : project.status === 'At Risk' ? (
                      <span className="px-2.5 py-1 text-xs font-semibold bg-red-500/10 text-red-400 rounded-full border border-red-500/20 flex items-center space-x-1">
                        At Risk
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 text-xs font-semibold bg-blue-500/10 text-blue-400 rounded-full border border-blue-500/20 flex items-center space-x-1">
                        On Track
                      </span>
                    )}
                  </div>
                  
                  <h3 className="text-xl font-bold mb-2 group-hover:text-indigo-200 transition-colors">{project.name}</h3>
                  <p className="text-sm text-gray-400 line-clamp-2 mb-6 h-10">
                    {project.description || 'No description provided.'}
                  </p>
                  
                  <div className="flex items-center justify-between pt-4 border-t border-white/10">
                    <div className="flex items-center text-xs text-gray-400">
                      <Calendar className="w-3.5 h-3.5 mr-1.5" />
                      {project.daysLeft === null
                        ? 'No deadline'
                        : project.daysLeft < 0
                        ? `${Math.abs(project.daysLeft)} days overdue`
                        : `${project.daysLeft} days left`}
                    </div>
                    
                    <div className="flex items-center space-x-2 relative">
                      <svg className="w-10 h-10 transform -rotate-90">
                        <circle cx="20" cy="20" r="16" stroke="CurrentColor" strokeWidth="3" fill="transparent" className="text-white/10" />
                        <circle 
                          cx="20" cy="20" r="16" 
                          stroke="CurrentColor" 
                          strokeWidth="3" 
                          fill="transparent" 
                          strokeDasharray={100} 
                          strokeDashoffset={100 - (project.progress || 0)} 
                          className="text-indigo-500 transition-all duration-1000 ease-in-out" 
                        />
                      </svg>
                      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] font-bold">
                        {project.progress || 0}%
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}

      <NewProjectModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSuccess={fetchProjects}
      />
    </div>
  );
}
