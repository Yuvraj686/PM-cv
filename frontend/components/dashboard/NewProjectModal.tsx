'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Sparkles } from 'lucide-react';
import api from '@/lib/api';
import { toast } from 'sonner';
import { GenerateTasksModal } from '@/components/ai/GenerateTasksModal';

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function NewProjectModal({ isOpen, onClose, onSuccess }: NewProjectModalProps) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [deadline, setDeadline] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [createdProject, setCreatedProject] = useState<{ id: string; name: string } | null>(null);

  const resetForm = () => {
    setName('');
    setDescription('');
    setRepoUrl('');
    setDeadline('');
    setError('');
    setCreatedProject(null);
  };

  const createProject = async () => {
    const res = await api.post('/api/projects', {
      name,
      description,
      repo_url: repoUrl || null,
      deadline: deadline || null,
    });
    return res.data as { id: string; name: string };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await createProject();
      toast.success('Project created successfully!');
      onSuccess();
      onClose();
      resetForm();
    } catch (err: any) {
      setError(err.response?.data?.detail || err.response?.data?.message || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateWithAI = async () => {
    if (!name.trim()) {
      setError('Project name is required');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const project = await createProject();
      setCreatedProject(project);
      setAiModalOpen(true);
      toast.success('Project created! Now generate your tasks.');
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.detail || err.response?.data?.message || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  const handleAiComplete = (projectId: string) => {
    setAiModalOpen(false);
    onClose();
    resetForm();
    router.push(`/projects/${projectId}/tasks`);
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && !aiModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-[#1A1D24] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between p-6 border-b border-white/5">
                <h2 className="text-xl font-bold font-geist tracking-tight">Create New Project</h2>
                <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {error && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-sm text-center">
                    {error}
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300">Project Name</label>
                  <input
                    required
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Q3 Mobile App Revamp"
                    className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-white"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300">Description</label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What is this project about?"
                    className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-white resize-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300">Repository URL (Optional)</label>
                  <input
                    type="url"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    placeholder="https://github.com/org/repo"
                    className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-white"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300">Deadline (Optional)</label>
                  <input
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-white [color-scheme:dark]"
                  />
                </div>

                <div className="pt-4 flex flex-col gap-2">
                  <div className="flex items-center space-x-3">
                    <button
                      type="button"
                      onClick={onClose}
                      className="flex-1 px-4 py-2.5 border border-white/10 rounded-lg text-sm font-medium text-gray-400 hover:bg-white/5 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 rounded-lg transition-all shadow-[0_0_15px_rgba(99,102,241,0.3)] flex items-center justify-center disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Create Project'}
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={loading || !name.trim()}
                    onClick={handleGenerateWithAI}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-indigo-500/40 rounded-lg text-sm font-medium text-indigo-300 hover:bg-indigo-500/10 transition-all disabled:opacity-50"
                  >
                    <Sparkles size={16} />
                    ✨ Generate tasks with AI
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {createdProject && (
        <GenerateTasksModal
          projectId={createdProject.id}
          projectName={createdProject.name}
          isOpen={aiModalOpen}
          onClose={() => {
            setAiModalOpen(false);
            onClose();
            resetForm();
          }}
          onComplete={handleAiComplete}
        />
      )}
    </>
  );
}
