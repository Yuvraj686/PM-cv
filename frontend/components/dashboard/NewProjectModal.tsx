'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Sparkles, FolderPlus, Link2, CalendarDays, FileText } from 'lucide-react';
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
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="absolute inset-0 bg-[#1C1C1C]/30 backdrop-blur-[2px]"
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 16 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="relative w-full max-w-lg bg-white border border-[#E8E4DD] rounded-2xl shadow-[0_8px_40px_rgba(28,28,28,0.12)] overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-[#E8E4DD]">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#FDEEE9] flex items-center justify-center">
                    <FolderPlus className="w-4.5 h-4.5 text-[#E07A5F]" size={18} />
                  </div>
                  <h2
                    className="text-lg font-bold text-[#1C1C1C]"
                    style={{ fontFamily: "'Lora', Georgia, serif" }}
                  >
                    Create New Project
                  </h2>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-[#8A8178] hover:bg-[#F7F4EF] hover:text-[#1C1C1C] transition-all"
                >
                  <X size={17} />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
                {error && (
                  <div className="px-4 py-3 bg-[#FDEEE9] border border-[#E07A5F]/30 text-[#c45f46] rounded-xl text-sm text-center">
                    {error}
                  </div>
                )}

                {/* Project Name */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[#1C1C1C]">Project Name</label>
                  <input
                    required
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Q3 Mobile App Revamp"
                    className="w-full bg-[#F7F4EF] border border-[#E8E4DD] rounded-xl px-4 py-2.5 text-sm text-[#1C1C1C] placeholder-[#8A8178] outline-none focus:border-[#E07A5F] focus:ring-2 focus:ring-[#E07A5F]/15 transition-all"
                    style={{ fontFamily: "'Inter', sans-serif" }}
                  />
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[#1C1C1C]">
                    <span className="flex items-center gap-1.5">
                      <FileText size={13} className="text-[#8A8178]" />
                      Description
                    </span>
                  </label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What is this project about?"
                    className="w-full bg-[#F7F4EF] border border-[#E8E4DD] rounded-xl px-4 py-2.5 text-sm text-[#1C1C1C] placeholder-[#8A8178] outline-none focus:border-[#E07A5F] focus:ring-2 focus:ring-[#E07A5F]/15 transition-all resize-none"
                    style={{ fontFamily: "'Inter', sans-serif" }}
                  />
                </div>

                {/* Repo URL */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[#1C1C1C]">
                    <span className="flex items-center gap-1.5">
                      <Link2 size={13} className="text-[#8A8178]" />
                      Repository URL
                      <span className="text-xs font-normal text-[#8A8178]">(Optional)</span>
                    </span>
                  </label>
                  <input
                    type="url"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    placeholder="https://github.com/org/repo"
                    className="w-full bg-[#F7F4EF] border border-[#E8E4DD] rounded-xl px-4 py-2.5 text-sm text-[#1C1C1C] placeholder-[#8A8178] outline-none focus:border-[#E07A5F] focus:ring-2 focus:ring-[#E07A5F]/15 transition-all"
                    style={{ fontFamily: "'Inter', sans-serif" }}
                  />
                </div>

                {/* Deadline */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[#1C1C1C]">
                    <span className="flex items-center gap-1.5">
                      <CalendarDays size={13} className="text-[#8A8178]" />
                      Deadline
                      <span className="text-xs font-normal text-[#8A8178]">(Optional)</span>
                    </span>
                  </label>
                  <input
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-full bg-[#F7F4EF] border border-[#E8E4DD] rounded-xl px-4 py-2.5 text-sm text-[#1C1C1C] outline-none focus:border-[#E07A5F] focus:ring-2 focus:ring-[#E07A5F]/15 transition-all [color-scheme:light]"
                    style={{ fontFamily: "'Inter', sans-serif" }}
                  />
                </div>

                {/* Actions */}
                <div className="pt-2 flex flex-col gap-2.5">
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={onClose}
                      className="flex-1 px-4 py-2.5 border border-[#E8E4DD] rounded-xl text-sm font-medium text-[#8A8178] hover:bg-[#F7F4EF] hover:text-[#1C1C1C] hover:border-[#d0cbc4] transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-1 bg-[#1C1C1C] hover:bg-[#333] text-white font-semibold py-2.5 rounded-xl text-sm transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Project'}
                    </button>
                  </div>

                  {/* AI Generate button */}
                  <button
                    type="button"
                    disabled={loading || !name.trim()}
                    onClick={handleGenerateWithAI}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#FDEEE9] border border-[#E07A5F]/30 rounded-xl text-sm font-medium text-[#E07A5F] hover:bg-[#fbe4da] hover:border-[#E07A5F]/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Sparkles size={15} />
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
