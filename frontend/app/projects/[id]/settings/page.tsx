'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Save, Trash2, Github, AlertTriangle, Loader2, Calendar } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/store';

export default function SettingsPage() {
  const { id } = useParams();
  const router = useRouter();
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    repo_url: '',
    deadline: ''
  });

  const currentUser = useAuthStore(s => s.user);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const fetchProject = async () => {
      try {
        const [projRes, memRes] = await Promise.all([
          api.get(`/api/projects/${id}`),
          api.get(`/api/projects/${id}/members`)
        ]);
        const p = projRes.data;
        setProject(p);
        setFormData({
          name: p.name,
          description: p.description || '',
          repo_url: p.repo_url || '',
          deadline: p.deadline || ''
        });

        const myRole = memRes.data.find((m: any) => m.user_id === currentUser?.id)?.role;
        setIsAdmin(myRole === 'admin' || myRole === 'project_lead');
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchProject();
  }, [id, currentUser]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setSaving(true);
    
    try {
      const payload: any = { ...formData };
      if (!payload.deadline) delete payload.deadline;
      
      await api.put(`/api/projects/${id}`, payload);
      alert('Settings saved successfully');
    } catch (err) {
      console.error(err);
      alert('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Type "DELETE" to confirm project deletion. This action cannot be undone.')) return;
    try {
      await api.delete(`/api/projects/${id}`);
      router.push('/dashboard');
    } catch (err) {
      console.error(err);
      alert('Failed to delete project. Ensure you are an Admin.');
    }
  };

  if (loading) return <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-indigo-500 w-8 h-8" /></div>;

  return (
    <div className="p-6 h-full overflow-y-auto w-full">
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold font-geist tracking-tight">Project Settings</h1>
          <p className="text-muted-foreground mt-1">Manage your project configuration and integrations.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="glass-panel p-6 rounded-2xl border border-white/10 space-y-5">
            <h3 className="font-semibold text-lg border-b border-white/10 pb-4">General Details</h3>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Project Name</label>
              <input 
                type="text" 
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                disabled={!isAdmin}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all disabled:opacity-50"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Description</label>
              <textarea 
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                disabled={!isAdmin}
                rows={3}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all disabled:opacity-50 custom-scrollbar"
              />
            </div>

            <div className="space-y-2 relative">
              <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                <Calendar size={14} className="text-indigo-400" /> Target Deadline
              </label>
              <input 
                type="date" 
                value={formData.deadline}
                onChange={(e) => setFormData({...formData, deadline: e.target.value})}
                disabled={!isAdmin}
                className="w-full md:w-1/2 bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all disabled:opacity-50 [color-scheme:dark]"
              />
            </div>
          </div>

          <div className="glass-panel p-6 rounded-2xl border border-white/10 space-y-5">
            <h3 className="font-semibold text-lg border-b border-white/10 pb-4 flex items-center gap-2">
              <Github size={18} /> GitHub Integration
            </h3>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Repository URL</label>
              <input 
                type="url" 
                value={formData.repo_url}
                onChange={(e) => setFormData({...formData, repo_url: e.target.value})}
                disabled={!isAdmin}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all disabled:opacity-50"
                placeholder="https://github.com/username/repo"
              />
              <p className="text-xs text-muted-foreground mt-2">
                Configure a webhook pointing to <code className="text-indigo-300 bg-indigo-500/10 px-1 py-0.5 rounded">/api/github/webhook/{id}</code> to enable automatic AI commit summaries.
              </p>
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button 
              type="submit" 
              disabled={!isAdmin || saving}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 px-6 rounded-lg transition-all shadow-lg shadow-indigo-600/30 flex items-center space-x-2 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Save Changes</span>
            </button>
          </div>
        </form>

        {isAdmin && (
          <div className="mt-12 pt-8 border-t border-red-500/20">
            <div className="glass-panel border-red-500/30 bg-red-500/5 p-6 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-6">
              <div>
                <h3 className="text-lg font-bold text-red-400 flex items-center gap-2">
                  <AlertTriangle size={20} /> Danger Zone
                </h3>
                <p className="text-sm text-muted-foreground mt-1">Permanently delete this project and all of its tasks, messages, and commits.</p>
              </div>
              <button 
                onClick={handleDelete}
                className="w-full md:w-auto bg-red-500/20 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/50 font-medium py-2.5 px-6 rounded-lg transition-all flex items-center justify-center space-x-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Project</span>
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
