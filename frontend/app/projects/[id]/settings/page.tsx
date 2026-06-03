'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Calendar,
  Copy,
  Github,
  Loader2,
  Save,
  Slack,
  Trash2,
  Webhook as WebhookIcon,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

type Project = {
  id: string;
  name: string;
  description: string | null;
  repo_url: string | null;
  deadline: string | null;
};

type Member = {
  user_id: string;
  role: string;
};

type SlackStatus = {
  connected: boolean;
  workspace_id?: string | null;
  workspace_name?: string | null;
  channel_id?: string | null;
};

type SlackChannel = {
  id: string;
  name: string;
};

type WebhookItem = {
  id: string;
  project_id: string;
  url: string;
  events: string[];
  active: boolean;
  created_at: string;
  updated_at: string;
  last_delivery_status: string | null;
  last_delivery_at: string | null;
};

const WEBHOOK_EVENT_OPTIONS = [
  'task_created',
  'task_updated',
  'task_moved',
  'member_invited',
  'comment_added',
  'github_push',
];

const INPUT_CLASS =
  'w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all';

function generateWebhookSecret(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export default function SettingsPage() {
  const { id } = useParams();
  const router = useRouter();
  const projectId = id as string;
  const currentUser = useAuthStore((state) => state.user);

  const [activeTab, setActiveTab] = useState('general');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    repo_url: '',
    deadline: '',
  });

  const [slackStatus, setSlackStatus] = useState<SlackStatus>({ connected: false });
  const [slackChannels, setSlackChannels] = useState<SlackChannel[]>([]);
  const [channelSelection, setChannelSelection] = useState('');
  const [loadingChannels, setLoadingChannels] = useState(false);

  const [webhooks, setWebhooks] = useState<WebhookItem[]>([]);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookSecret, setWebhookSecret] = useState(generateWebhookSecret());
  const [webhookEvents, setWebhookEvents] = useState<string[]>(['task_created']);
  const [webhookActive, setWebhookActive] = useState(true);
  const [savingWebhook, setSavingWebhook] = useState(false);

  const [calendarUrl, setCalendarUrl] = useState('');

  const apiBaseUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
    []
  );

  useEffect(() => {
    const fetchProject = async () => {
      try {
        const [projectRes, membersRes] = await Promise.all([
          api.get(`/api/projects/${projectId}`),
          api.get(`/api/projects/${projectId}/members`),
        ]);
        const loadedProject = projectRes.data as Project;
        const members = membersRes.data as Member[];
        const myRole = members.find((member) => member.user_id === currentUser?.id)?.role;
        setIsAdmin(myRole === 'admin' || myRole === 'project_lead' || myRole === 'owner');
        setFormData({
          name: loadedProject.name,
          description: loadedProject.description || '',
          repo_url: loadedProject.repo_url || '',
          deadline: loadedProject.deadline || '',
        });
      } catch (error) {
        console.error(error);
        toast.error('Failed to load project settings');
      } finally {
        setLoading(false);
      }
    };
    fetchProject();
  }, [projectId, currentUser?.id]);

  useEffect(() => {
    if (activeTab !== 'integrations') return;
    const fetchIntegrations = async () => {
      try {
        const [slackRes, webhooksRes, calendarRes] = await Promise.all([
          api.get(`/api/integrations/slack/status?project_id=${projectId}`),
          api.get(`/api/projects/${projectId}/webhooks`),
          api.get(`/api/projects/${projectId}/calendar-link`),
        ]);
        const statusData = slackRes.data as SlackStatus;
        setSlackStatus(statusData);
        setChannelSelection(statusData.channel_id || '');
        setWebhooks(webhooksRes.data as WebhookItem[]);
        const relativeUrl = (calendarRes.data?.url as string) || '';
        setCalendarUrl(`${apiBaseUrl}${relativeUrl}`);
      } catch (error) {
        console.error(error);
        toast.error('Failed to load integration settings');
      }
    };
    fetchIntegrations();
  }, [activeTab, apiBaseUrl, projectId]);

  const handleSaveProject = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isAdmin) return;
    setSaving(true);
    try {
      const payload = {
        ...formData,
        deadline: formData.deadline || null,
      };
      await api.put(`/api/projects/${projectId}`, payload);
      toast.success('Settings saved');
    } catch (error) {
      console.error(error);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!isAdmin) return;
    if (!confirm('Type "DELETE" to confirm project deletion. This cannot be undone.')) return;
    try {
      await api.delete(`/api/projects/${projectId}`);
      toast.success('Project deleted');
      router.push('/dashboard');
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete project');
    }
  };

  const handleConnectSlack = () => {
    window.location.href = `${apiBaseUrl}/api/integrations/slack/connect?project_id=${projectId}`;
  };

  const fetchSlackChannels = async () => {
    if (!slackStatus.connected) return;
    setLoadingChannels(true);
    try {
      const res = await api.get(`/api/integrations/slack/channels?project_id=${projectId}`);
      setSlackChannels(res.data as SlackChannel[]);
    } catch (error) {
      console.error(error);
      toast.error('Failed to load Slack channels');
    } finally {
      setLoadingChannels(false);
    }
  };

  const handleSaveSlackChannel = async () => {
    try {
      const res = await api.patch('/api/integrations/slack/channel', {
        project_id: projectId,
        channel_id: channelSelection || null,
      });
      setSlackStatus(res.data as SlackStatus);
      toast.success('Slack channel updated');
    } catch (error) {
      console.error(error);
      toast.error('Failed to save Slack channel');
    }
  };

  const handleToggleEvent = (eventName: string) => {
    setWebhookEvents((prev) =>
      prev.includes(eventName)
        ? prev.filter((item) => item !== eventName)
        : [...prev, eventName]
    );
  };

  const handleCreateWebhook = async () => {
    if (!webhookUrl.trim()) {
      toast.error('Webhook URL is required');
      return;
    }
    if (!webhookSecret.trim()) {
      toast.error('Webhook secret is required');
      return;
    }
    if (!webhookEvents.length) {
      toast.error('Select at least one event');
      return;
    }
    setSavingWebhook(true);
    try {
      const res = await api.post(`/api/projects/${projectId}/webhooks`, {
        url: webhookUrl.trim(),
        secret: webhookSecret.trim(),
        events: webhookEvents,
        active: webhookActive,
      });
      const created = res.data as WebhookItem;
      setWebhooks((prev) => [created, ...prev]);
      setWebhookUrl('');
      setWebhookSecret(generateWebhookSecret());
      setWebhookEvents(['task_created']);
      setWebhookActive(true);
      toast.success('Webhook created');
    } catch (error) {
      console.error(error);
      toast.error('Failed to create webhook');
    } finally {
      setSavingWebhook(false);
    }
  };

  const handleDeleteWebhook = async (webhookId: string) => {
    if (!confirm('Delete this webhook?')) return;
    try {
      await api.delete(`/api/projects/${projectId}/webhooks/${webhookId}`);
      setWebhooks((prev) => prev.filter((hook) => hook.id !== webhookId));
      toast.success('Webhook deleted');
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete webhook');
    }
  };

  const handleToggleWebhookActive = async (webhook: WebhookItem) => {
    try {
      const res = await api.put(`/api/projects/${projectId}/webhooks/${webhook.id}`, {
        active: !webhook.active,
      });
      const updated = res.data as WebhookItem;
      setWebhooks((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      toast.success('Webhook updated');
    } catch (error) {
      console.error(error);
      toast.error('Failed to update webhook');
    }
  };

  const handleTestWebhook = async (webhookId: string) => {
    try {
      await api.post(`/api/projects/${projectId}/webhooks/${webhookId}/test`);
      toast.success('Test event queued');
    } catch (error) {
      console.error(error);
      toast.error('Failed to send test event');
    }
  };

  const handleCopyCalendar = async () => {
    try {
      await navigator.clipboard.writeText(calendarUrl);
      toast.success('Calendar link copied');
    } catch (error) {
      console.error(error);
      toast.error('Failed to copy link');
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="p-6 h-full overflow-y-auto w-full">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold font-geist tracking-tight">Project Settings</h1>
          <p className="text-muted-foreground mt-1">Manage project details, integrations, and delivery hooks.</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList variant="line">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-6 space-y-6">
            <form onSubmit={handleSaveProject} className="space-y-6">
              <div className="glass-panel p-6 rounded-2xl border border-white/10 space-y-5">
                <h3 className="font-semibold text-lg border-b border-white/10 pb-4">General Details</h3>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300">Project Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    disabled={!isAdmin}
                    className={`${INPUT_CLASS} disabled:opacity-50`}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    disabled={!isAdmin}
                    rows={3}
                    className={`${INPUT_CLASS} disabled:opacity-50`}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                    <Calendar size={14} className="text-indigo-400" /> Target Deadline
                  </label>
                  <input
                    type="date"
                    value={formData.deadline}
                    onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                    disabled={!isAdmin}
                    className={`md:w-1/2 ${INPUT_CLASS} disabled:opacity-50 [color-scheme:dark]`}
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
                    onChange={(e) => setFormData({ ...formData, repo_url: e.target.value })}
                    disabled={!isAdmin}
                    className={`${INPUT_CLASS} disabled:opacity-50`}
                    placeholder="https://github.com/username/repo"
                  />
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
              <div className="pt-8 border-t border-red-500/20">
                <div className="glass-panel border-red-500/30 bg-red-500/5 p-6 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-6">
                  <div>
                    <h3 className="text-lg font-bold text-red-400 flex items-center gap-2">
                      <AlertTriangle size={20} /> Danger Zone
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">Delete this project and all associated records.</p>
                  </div>
                  <button
                    onClick={handleDeleteProject}
                    className="w-full md:w-auto bg-red-500/20 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/50 font-medium py-2.5 px-6 rounded-lg transition-all flex items-center justify-center space-x-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete Project</span>
                  </button>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="integrations" className="mt-6 space-y-6">
            <div className="glass-panel p-6 rounded-2xl border border-white/10 space-y-5">
              <h3 className="font-semibold text-lg border-b border-white/10 pb-4 flex items-center gap-2">
                <Slack size={18} /> Slack
              </h3>
              {!slackStatus.connected ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">Slack is not connected to this project.</p>
                  <button
                    onClick={handleConnectSlack}
                    disabled={!isAdmin}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 px-5 rounded-lg transition-all disabled:opacity-50"
                  >
                    Connect Slack
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-emerald-400">
                    Connected to workspace: <strong>{slackStatus.workspace_name || slackStatus.workspace_id}</strong>
                  </p>
                  <div className="flex items-end gap-3 flex-wrap">
                    <div className="min-w-[260px]">
                      <label className="text-sm font-medium text-gray-300 block mb-2">Notification channel</label>
                      <select
                        value={channelSelection}
                        onChange={(e) => setChannelSelection(e.target.value)}
                        className={INPUT_CLASS}
                        disabled={!isAdmin}
                      >
                        <option value="">Select a channel</option>
                        {slackChannels.map((channel) => (
                          <option key={channel.id} value={channel.id}>
                            #{channel.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      onClick={fetchSlackChannels}
                      disabled={loadingChannels}
                      className="bg-zinc-700 hover:bg-zinc-600 text-white px-4 py-2 rounded-lg text-sm"
                    >
                      {loadingChannels ? 'Loading…' : 'Load channels'}
                    </button>
                    <button
                      onClick={handleSaveSlackChannel}
                      disabled={!isAdmin}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50"
                    >
                      Save channel
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="glass-panel p-6 rounded-2xl border border-white/10 space-y-5">
              <h3 className="font-semibold text-lg border-b border-white/10 pb-4 flex items-center gap-2">
                <WebhookIcon size={18} /> Webhooks
              </h3>

              <div className="space-y-3">
                <label className="text-sm text-gray-300 font-medium">Webhook URL</label>
                <input
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://example.com/projecthub-webhook"
                  className={INPUT_CLASS}
                />
                <label className="text-sm text-gray-300 font-medium">Secret</label>
                <div className="flex gap-2">
                  <input
                    value={webhookSecret}
                    onChange={(e) => setWebhookSecret(e.target.value)}
                    className={INPUT_CLASS}
                  />
                  <button
                    onClick={() => setWebhookSecret(generateWebhookSecret())}
                    className="bg-zinc-700 hover:bg-zinc-600 text-white px-3 py-2 rounded-lg text-sm"
                  >
                    Regenerate
                  </button>
                </div>

                <div className="space-y-2">
                  <span className="text-sm text-gray-300 font-medium block">Events</span>
                  <div className="grid grid-cols-2 gap-2">
                    {WEBHOOK_EVENT_OPTIONS.map((eventName) => (
                      <label key={eventName} className="text-xs text-gray-300 flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={webhookEvents.includes(eventName)}
                          onChange={() => handleToggleEvent(eventName)}
                        />
                        {eventName}
                      </label>
                    ))}
                  </div>
                </div>
                <label className="text-xs text-gray-300 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={webhookActive}
                    onChange={(e) => setWebhookActive(e.target.checked)}
                  />
                  Active
                </label>
                <button
                  onClick={handleCreateWebhook}
                  disabled={!isAdmin || savingWebhook}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50"
                >
                  {savingWebhook ? 'Saving…' : 'Add webhook'}
                </button>
              </div>

              <div className="space-y-3 pt-2">
                {webhooks.map((webhook) => (
                  <div
                    key={webhook.id}
                    className="border border-white/10 rounded-lg p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <p className="text-sm text-white break-all">{webhook.url}</p>
                      <p className="text-xs text-muted-foreground">
                        {webhook.active ? 'Active' : 'Inactive'} · Events: {webhook.events.join(', ')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Last delivery: {webhook.last_delivery_status || 'Never'}
                      </p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => handleTestWebhook(webhook.id)}
                        className="bg-zinc-700 hover:bg-zinc-600 text-white px-3 py-2 rounded-lg text-xs"
                      >
                        Send test event
                      </button>
                      <button
                        onClick={() => handleToggleWebhookActive(webhook)}
                        className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-2 rounded-lg text-xs"
                      >
                        {webhook.active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => handleDeleteWebhook(webhook.id)}
                        className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg text-xs"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
                {!webhooks.length && (
                  <p className="text-sm text-muted-foreground">No webhooks configured.</p>
                )}
              </div>
            </div>

            <div className="glass-panel p-6 rounded-2xl border border-white/10 space-y-4">
              <h3 className="font-semibold text-lg border-b border-white/10 pb-4 flex items-center gap-2">
                <Calendar size={18} /> Calendar Sync
              </h3>
              <p className="text-sm text-muted-foreground">
                Paste this URL into Google Calendar → Other calendars → From URL.
              </p>
              <div className="flex gap-2 flex-wrap">
                <input value={calendarUrl} readOnly className={INPUT_CLASS} />
                <button
                  onClick={handleCopyCalendar}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2"
                >
                  <Copy size={14} /> Copy link
                </button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
