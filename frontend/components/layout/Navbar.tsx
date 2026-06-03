'use client';

import { Bell, Search, Plus, X, Inbox, Clock, Sparkles } from 'lucide-react';
import { useAuthStore } from '@/lib/store';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import api from '@/lib/api';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface NavbarProps {
  pageTitle?: string;
  onNewTask?: () => void;
}

export function Navbar({ pageTitle, onNewTask }: NavbarProps) {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.accessToken);
  
  // Notifications State
  const [unreadCounts, setUnreadCounts] = useState(0);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const notifRef = useRef<HTMLDivElement>(null);

  // Search State
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ projects: any[]; tasks: any[] }>({ projects: [], tasks: [] });
  const [isSearching, setIsSearching] = useState(false);

  // New Task State
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const [newTaskForm, setNewTaskForm] = useState({
    project_id: '',
    title: '',
    description: '',
    priority: 'medium',
    story_points: '',
    status: 'todo',
  });
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  // AI usage
  const [aiUsage, setAiUsage] = useState<{ remaining: number; limit: number } | null>(null);

  useEffect(() => {
    const fetchNotifs = async () => {
      try {
        const res = await api.get('/api/notifications');
        setNotifications(res.data);
        const unread = res.data.filter((n: any) => !n.read).length;
        setUnreadCounts(unread);
      } catch {}
    };
    if (user) fetchNotifs();
  }, [user]);

  useEffect(() => {
    const fetchAiUsage = async () => {
      try {
        const res = await api.get('/api/ai/usage');
        setAiUsage(res.data);
      } catch {
        /* ignore */
      }
    };
    if (user) fetchAiUsage();
  }, [user]);

  useEffect(() => {
    if (!user || !token) return;
    const wsUrl = `${process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000'}/api/chat/ws/user_${user.id}/${user.id}?token=${token}`;
    const ws = new WebSocket(wsUrl);
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'notification') {
          setNotifications((prev) => [data.notification, ...prev]);
          setUnreadCounts((c) => c + 1);
          if (data.notification?.type === 'deadline_alert') {
            toast.warning(data.notification?.content || 'Deadline approaching');
          }
        }
      } catch {}
    };
    return () => ws.close();
  }, [user, token]);

  // Global Keyboard shortcut for Search
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsSearchOpen((open) => !open);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  // Close Notif Popover on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setIsNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch projects when New Task Modal opens
  useEffect(() => {
    if (isNewTaskOpen && projects.length === 0) {
      api.get('/api/projects').then((res) => {
        setProjects(res.data);
        if (res.data.length > 0) {
          setNewTaskForm((prev) => ({ ...prev, project_id: res.data[0].id }));
        }
      }).catch(() => {});
    }
  }, [isNewTaskOpen, projects.length]);

  // Search Logic
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults({ projects: [], tasks: [] });
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const [projRes, taskRes] = await Promise.all([
          api.get('/api/projects'),
          api.get('/api/tasks').catch(() => ({ data: [] }))
        ]);
        const allProj = projRes.data || [];
        const allTasks = taskRes.data || [];
        const q = searchQuery.toLowerCase();
        
        setSearchResults({
          projects: allProj.filter((p: any) => p.name?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q)),
          tasks: allTasks.filter((t: any) => t.title?.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q))
        });
      } catch (err) {
         console.error(err);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleCreateTask = async () => {
    if (!newTaskForm.project_id) { toast.error('Please select a project'); return; }
    if (!newTaskForm.title.trim()) { toast.error('Task title is required'); return; }
    const parsedStoryPoints = newTaskForm.story_points === '' ? null : Number(newTaskForm.story_points);
    if (parsedStoryPoints !== null && (Number.isNaN(parsedStoryPoints) || parsedStoryPoints < 0 || parsedStoryPoints > 100)) {
      toast.error('Story points must be between 0 and 100');
      return;
    }
    setIsCreatingTask(true);
    try {
      await api.post('/api/tasks', {
        project_id: newTaskForm.project_id,
        title: newTaskForm.title,
        description: newTaskForm.description || null,
        priority: newTaskForm.priority,
        story_points: parsedStoryPoints,
        status: newTaskForm.status
      });
      toast.success('Task created successfully');
      setIsNewTaskOpen(false);
      setNewTaskForm({ ...newTaskForm, title: '', description: '', story_points: '' });
      if (onNewTask) onNewTask();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to create task');
    } finally {
      setIsCreatingTask(false);
    }
  };

  const markNotifsRead = async () => {
    if (unreadCounts === 0) return;
    try {
      await api.patch('/api/notifications/read-all');
      setUnreadCounts(0);
      setNotifications(notifications.map(n => ({ ...n, read: true })));
    } catch {}
  };

  return (
    <>
      <header
        className="h-16 flex items-center justify-between px-6 shrink-0 relative z-40"
        style={{
          background: 'var(--bloom-bg)',
          borderBottom: '1px solid var(--bloom-border)',
        }}
      >
        {/* Page title */}
        <h1 className="font-serif text-2xl font-bold" style={{ color: 'var(--bloom-text)' }}>
          {pageTitle || 'Dashboard'}
        </h1>

        {/* Centre search */}
        <div 
          className="flex-1 max-w-sm mx-8 relative cursor-pointer group"
          onClick={() => setIsSearchOpen(true)}
        >
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 transition-colors group-hover:text-black"
            style={{ color: 'var(--bloom-muted)' }}
          />
          <div
            className="bloom-input w-full pl-9 pr-4 py-2 text-sm flex items-center justify-between transition-colors hover:border-black/20"
            style={{ background: 'var(--bloom-surface)' }}
          >
            <span style={{ color: 'var(--bloom-muted)' }}>Search projects, tasks, people...</span>
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded-md"
              style={{ background: 'var(--bloom-border)', color: 'var(--bloom-muted)' }}
            >
              ⌘K
            </span>
          </div>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-3 relative">
          {aiUsage !== null && (
            <div
              className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg"
              style={{ background: 'var(--bloom-purple-bg)', color: 'var(--bloom-purple)' }}
              title="Daily AI requests remaining (resets midnight UTC)"
            >
              <Sparkles size={12} />
              {aiUsage.remaining}/{aiUsage.limit} AI
            </div>
          )}
          <div ref={notifRef} className="relative">
            <button
              className="relative p-2 rounded-xl transition-colors hover:bg-black/5"
              style={{ color: 'var(--bloom-muted)' }}
              onClick={() => {
                setIsNotifOpen(!isNotifOpen);
                if (!isNotifOpen) markNotifsRead();
              }}
            >
              <Bell size={18} />
              {unreadCounts > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center text-white"
                  style={{ background: 'var(--bloom-coral)' }}
                >
                  {unreadCounts}
                </span>
              )}
            </button>

            {/* Notifications Popover */}
            {isNotifOpen && (
              <div className="absolute right-0 mt-2 w-80 bloom-card shadow-xl flex flex-col max-h-[400px] overflow-hidden border">
                <div className="p-3 border-b flex items-center justify-between shrink-0" style={{ borderColor: 'var(--bloom-border)' }}>
                  <h3 className="font-semibold text-sm" style={{ color: 'var(--bloom-text)' }}>Notifications</h3>
                  <button onClick={() => setIsNotifOpen(false)} className="p-1 rounded-md hover:bg-black/5">
                    <X size={14} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-8 text-center flex flex-col items-center justify-center gap-2" style={{ color: 'var(--bloom-muted)' }}>
                      <Inbox size={24} />
                      <p className="text-sm">No new notifications</p>
                    </div>
                  ) : (
                    <div className="flex flex-col divide-y divide-[var(--bloom-border)]">
                      {notifications.map((n) => (
                        <div key={n.id} className={`p-3 text-sm transition-colors hover:bg-black/5 ${!n.read ? 'bg-[var(--bloom-coral-bg)]/50' : ''}`}>
                          <p style={{ color: 'var(--bloom-text)' }}>{n.content}</p>
                          <div className="flex items-center gap-1 mt-1 text-xs" style={{ color: 'var(--bloom-muted)' }}>
                            <Clock size={10} />
                            <span>{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            data-testid="new-task-btn"
            onClick={() => setIsNewTaskOpen(true)}
            className="bloom-btn-primary text-sm"
          >
            <Plus size={14} />
            New task
          </button>
        </div>
      </header>

      {/* Search Modal */}
      {isSearchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-black/30 backdrop-blur-sm p-4">
          <div className="w-full max-w-xl bloom-card shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: '80vh' }}>
            <div className="flex items-center p-3 border-b" style={{ borderColor: 'var(--bloom-border)' }}>
              <Search size={18} style={{ color: 'var(--bloom-muted)' }} className="mr-3" />
              <input
                type="text"
                autoFocus
                placeholder="Type to search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent border-none outline-none text-base placeholder:text-black/40"
              />
              <button onClick={() => setIsSearchOpen(false)} className="p-1 rounded-md hover:bg-black/5 ml-2 text-xs font-medium" style={{ color: 'var(--bloom-muted)' }}>
                ESC
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2">
              {isSearching ? (
                <div className="p-4 text-center text-sm" style={{ color: 'var(--bloom-muted)' }}>Searching...</div>
              ) : searchQuery && searchResults.projects.length === 0 && searchResults.tasks.length === 0 ? (
                <div className="p-8 text-center text-sm" style={{ color: 'var(--bloom-muted)' }}>No results found for &quot;{searchQuery}&quot;</div>
              ) : !searchQuery ? (
                <div className="p-8 text-center text-sm flex flex-col items-center gap-2" style={{ color: 'var(--bloom-muted)' }}>
                  <Search size={24} className="opacity-50" />
                  Search for projects or tasks across your workspace
                </div>
              ) : (
                <div className="space-y-4">
                  {searchResults.projects.length > 0 && (
                    <div>
                      <h4 className="px-3 py-1 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--bloom-muted)' }}>Projects</h4>
                      {searchResults.projects.map(p => (
                        <div 
                          key={p.id} 
                          className="px-3 py-2 hover:bg-black/5 rounded-lg cursor-pointer flex items-center justify-between"
                          onClick={() => { setIsSearchOpen(false); router.push(`/projects/${p.id}/tasks`); }}
                        >
                          <span className="text-sm font-medium">{p.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {searchResults.tasks.length > 0 && (
                    <div>
                      <h4 className="px-3 py-1 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--bloom-muted)' }}>Tasks</h4>
                      {searchResults.tasks.map(t => (
                        <div 
                          key={t.id} 
                          className="px-3 py-2 hover:bg-black/5 rounded-lg cursor-pointer flex items-center justify-between"
                          onClick={() => { setIsSearchOpen(false); router.push(`/projects/${t.project_id}/tasks`); }}
                        >
                          <span className="text-sm">{t.title}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--bloom-border)' }}>{t.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* New Task Modal */}
      {isNewTaskOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
          <div className="w-full max-w-md bloom-card p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-lg font-bold" style={{ color: 'var(--bloom-text)' }}>Create Global Task</h2>
              <button onClick={() => setIsNewTaskOpen(false)} style={{ color: 'var(--bloom-muted)' }}><X size={18} /></button>
            </div>

            {projects.length === 0 ? (
              <div className="p-4 text-center text-sm rounded-lg" style={{ background: 'var(--bloom-coral-bg)', color: 'var(--bloom-coral)' }}>
                You must be part of a project to create tasks.
              </div>
            ) : (
              <>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--bloom-muted)' }}>Project</label>
                  <select 
                    className="bloom-input w-full text-sm" 
                    value={newTaskForm.project_id}
                    onChange={(e) => setNewTaskForm({ ...newTaskForm, project_id: e.target.value })}
                  >
                    <option value="" disabled>Select a project</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <input 
                  className="bloom-input w-full text-sm" 
                  placeholder="Task title" 
                  value={newTaskForm.title}
                  onChange={(e) => setNewTaskForm({ ...newTaskForm, title: e.target.value })} 
                />

                <textarea 
                  className="bloom-input w-full text-sm" 
                  placeholder="Description (optional)" 
                  rows={3} 
                  value={newTaskForm.description}
                  onChange={(e) => setNewTaskForm({ ...newTaskForm, description: e.target.value })} 
                />

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--bloom-muted)' }}>Priority</label>
                    <select className="bloom-input w-full text-sm" value={newTaskForm.priority} onChange={(e) => setNewTaskForm({ ...newTaskForm, priority: e.target.value })}>
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
                      className="bloom-input w-full text-sm"
                      placeholder="Optional"
                      value={newTaskForm.story_points}
                      onChange={(e) => setNewTaskForm({ ...newTaskForm, story_points: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--bloom-muted)' }}>Status</label>
                    <select className="bloom-input w-full text-sm" value={newTaskForm.status} onChange={(e) => setNewTaskForm({ ...newTaskForm, status: e.target.value })}>
                      <option value="todo">To Do</option>
                      <option value="in_progress">In Progress</option>
                      <option value="done">Done</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={() => setIsNewTaskOpen(false)} className="bloom-btn-secondary">Cancel</button>
                  <button disabled={isCreatingTask || !newTaskForm.project_id} onClick={handleCreateTask} className="bloom-btn-primary">
                    {isCreatingTask ? 'Creating…' : 'Create Task'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
