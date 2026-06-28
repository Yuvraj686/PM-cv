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
  CheckCircle,
  XCircle,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/lib/store';
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

function generateWebhookSecret(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// ── Bloom-styled input class
const INPUT_CLASS =
  'w-full bg-[#F7F4EF] border border-[#E8E4DD] rounded-xl px-4 py-2.5 text-sm text-[#1C1C1C] placeholder-[#8A8178] outline-none focus:border-[#E07A5F] focus:ring-2 focus:ring-[#E07A5F]/15 transition-all';

// ── Helper text component
function HelperText({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-xs text-[#8A8178]">{children}</p>;
}

// ── Field label component
function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-sm font-medium text-[#1C1C1C] mb-1.5">{children}</label>;
}

// ── Card component
function Card({ children, danger = false }: { children: React.ReactNode; danger?: boolean }) {
  return (
    <div
      className="rounded-2xl border"
      style={{
        background: danger ? '#FEF2F2' : '#ffffff',
        borderColor: danger ? 'rgba(239,68,68,0.25)' : '#E8E4DD',
        boxShadow: '0 1px 8px rgba(28,28,28,0.05)',
      }}
    >
      {children}
    </div>
  );
}

// ── Card header with optional badge
function CardHeader({
  title,
  icon,
  badge,
}: {
  title: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <div className="px-6 pt-6 pb-4">
      <div className="flex items-center gap-2.5 mb-4">
        {icon && <span className="text-[#8A8178]">{icon}</span>}
        <h3
          className="text-base font-bold text-[#1C1C1C]"
          style={{ fontFamily: "'Lora', Georgia, serif" }}
        >
          {title}
        </h3>
        {badge}
      </div>
      <div className="h-px bg-[#E8E4DD]" />
    </div>
  );
}

export default function SettingsPage() {
  const { id } = useParams();
  const router = useRouter();
  const projectId = id as string;
  const currentUser = useAuthStore((state) => state.user);

  const [activeTab, setActiveTab] = useState<'general' | 'integrations'>('general');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [projectName, setProjectName] = useState('');
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

  // Delete project modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

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
        setProjectName(loadedProject.name);
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
    if (deleteConfirmText !== 'DELETE') {
      toast.error('Please type DELETE to confirm');
      return;
    }
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
    if (!webhookUrl.trim()) { toast.error('Webhook URL is required'); return; }
    if (!webhookSecret.trim()) { toast.error('Webhook secret is required'); return; }
    if (!webhookEvents.length) { toast.error('Select at least one event'); return; }
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
        <Loader2 className="w-7 h-7 animate-spin text-[#E07A5F]" />
      </div>
    );
  }

  const githubConnected = !!formData.repo_url;

  return (
    <div
      className="p-6 h-full overflow-y-auto w-full"
      style={{ backgroundColor: 'var(--bloom-bg)', fontFamily: "'Inter', sans-serif" }}
    >
      <div className="max-w-3xl mx-auto space-y-7">

        {/* ── Page Header ── */}
        <div>
          <h1
            className="text-2xl font-bold text-[#1C1C1C]"
            style={{ fontFamily: "'Lora', Georgia, serif" }}
          >
            {projectName || 'Project Settings'}
          </h1>
          <p className="text-sm text-[#8A8178] mt-1">Manage your project settings</p>
        </div>

        {/* ── Pill Tabs ── */}
        <div className="flex gap-1 p-1 bg-[#EDEAE4] rounded-xl w-fit">
          {(['general', 'integrations'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="px-5 py-2 rounded-lg text-sm font-medium transition-all capitalize"
              style={{
                background: activeTab === tab ? '#E07A5F' : 'transparent',
                color: activeTab === tab ? '#fff' : '#8A8178',
                boxShadow: activeTab === tab ? '0 1px 6px rgba(224,122,95,0.35)' : 'none',
              }}
            >
              {tab === 'general' ? 'General' : 'Integrations'}
            </button>
          ))}
        </div>

        {/* ══════════════════ GENERAL TAB ══════════════════ */}
        {activeTab === 'general' && (
          <form onSubmit={handleSaveProject} className="space-y-5">

            {/* ── General Details Card ── */}
            <Card>
              <CardHeader title="General Details" />
              <div className="px-6 pb-0 space-y-5">

                {/* Project Name */}
                <div>
                  <FieldLabel>Project Name</FieldLabel>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    disabled={!isAdmin}
                    className={`${INPUT_CLASS} disabled:opacity-50`}
                    required
                    placeholder="e.g. Q3 Mobile App Revamp"
                  />
                  <HelperText>The display name for your project across ProjectHub.</HelperText>
                </div>

                {/* Description */}
                <div>
                  <FieldLabel>Description</FieldLabel>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    disabled={!isAdmin}
                    rows={3}
                    placeholder="A short summary of what this project is about"
                    className={`${INPUT_CLASS} resize-none disabled:opacity-50`}
                  />
                  <HelperText>A short summary shown on your project card.</HelperText>
                </div>

                {/* Deadline */}
                <div>
                  <FieldLabel>
                    <span className="flex items-center gap-1.5">
                      <Calendar size={13} className="text-[#8A8178]" />
                      Target Deadline
                      <span className="text-xs font-normal text-[#8A8178]">(Optional)</span>
                    </span>
                  </FieldLabel>
                  <input
                    type="date"
                    value={formData.deadline}
                    onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                    disabled={!isAdmin}
                    className={`md:w-1/2 ${INPUT_CLASS} disabled:opacity-50 [color-scheme:light]`}
                  />
                  <HelperText>Set a target completion date to track progress.</HelperText>
                </div>
              </div>

              {/* Card footer — full-width Save button */}
              <div className="px-6 py-5 mt-4 border-t border-[#E8E4DD]">
                <button
                  type="submit"
                  disabled={!isAdmin || saving}
                  className="w-full flex items-center justify-center gap-2 bg-[#1C1C1C] hover:bg-[#333] text-white font-semibold py-2.5 rounded-xl text-sm transition-all shadow-sm disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Changes
                </button>
              </div>
            </Card>

            {/* ── GitHub Integration Card ── */}
            <Card>
              <CardHeader
                title="GitHub Integration"
                icon={<Github size={16} />}
                badge={
                  githubConnected ? (
                    <span className="flex items-center gap-1 text-xs font-medium text-[#4a8a46] bg-[#EDF4EC] px-2.5 py-0.5 rounded-full">
                      <CheckCircle size={11} /> Connected
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs font-medium text-[#8A8178] bg-[#F0EDE8] px-2.5 py-0.5 rounded-full">
                      <XCircle size={11} /> Not connected
                    </span>
                  )
                }
              />
              <div className="px-6 pb-6">
                <FieldLabel>
                  <span className="flex items-center gap-1.5">
                    <Github size={13} className="text-[#8A8178]" />
                    Repository URL
                    <span className="text-xs font-normal text-[#8A8178]">(Optional)</span>
                  </span>
                </FieldLabel>
                <input
                  type="url"
                  value={formData.repo_url}
                  onChange={(e) => setFormData({ ...formData, repo_url: e.target.value })}
                  disabled={!isAdmin}
                  className={`${INPUT_CLASS} disabled:opacity-50`}
                  placeholder="https://github.com/username/repo"
                />
                <HelperText>
                  Link a GitHub repo to track commits, pull requests, and issues directly inside ProjectHub.
                </HelperText>
              </div>
            </Card>

            {/* ── Danger Zone Card ── */}
            {isAdmin && (
              <Card danger>
                <div className="px-6 pt-6 pb-4">
                  <div className="flex items-center gap-2.5 mb-4">
                    <AlertTriangle size={16} className="text-red-500" />
                    <h3
                      className="text-base font-bold text-red-600"
                      style={{ fontFamily: "'Lora', Georgia, serif" }}
                    >
                      Danger Zone
                    </h3>
                  </div>
                  <div className="h-px bg-red-200/60" />
                </div>
                <div className="px-6 pb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <p className="text-sm text-[#6b6460] max-w-sm">
                    Deleting this project is <strong className="text-red-600">permanent and cannot be undone</strong>. All tasks, members, and activity will be lost.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowDeleteModal(true)}
                    className="shrink-0 flex items-center gap-2 border border-red-400/60 text-red-500 hover:bg-red-500 hover:text-white font-medium py-2.5 px-5 rounded-xl text-sm transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Project
                  </button>
                </div>
              </Card>
            )}
          </form>
        )}

        {/* ══════════════════ INTEGRATIONS TAB ══════════════════ */}
        {activeTab === 'integrations' && (
          <div className="space-y-5">

            {/* ── Slack Card ── */}
            <Card>
              <CardHeader title="Slack" icon={<Slack size={16} />} />
              <div className="px-6 pb-6 space-y-4">
                {!slackStatus.connected ? (
                  <div className="space-y-3">
                    <p className="text-sm text-[#8A8178]">Slack is not connected to this project.</p>
                    <button
                      onClick={handleConnectSlack}
                      disabled={!isAdmin}
                      className="bg-[#1C1C1C] hover:bg-[#333] text-white font-medium py-2.5 px-5 rounded-xl text-sm transition-all disabled:opacity-50"
                    >
                      Connect Slack
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-sm text-[#4a8a46]">
                      Connected to workspace: <strong>{slackStatus.workspace_name || slackStatus.workspace_id}</strong>
                    </p>
                    <div className="flex items-end gap-3 flex-wrap">
                      <div className="min-w-[260px]">
                        <FieldLabel>Notification channel</FieldLabel>
                        <select
                          value={channelSelection}
                          onChange={(e) => setChannelSelection(e.target.value)}
                          className={INPUT_CLASS}
                          disabled={!isAdmin}
                        >
                          <option value="">Select a channel</option>
                          {slackChannels.map((channel) => (
                            <option key={channel.id} value={channel.id}>#{channel.name}</option>
                          ))}
                        </select>
                      </div>
                      <button
                        onClick={fetchSlackChannels}
                        disabled={loadingChannels}
                        className="bg-[#F0EDE8] hover:bg-[#E8E4DD] text-[#1C1C1C] px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
                      >
                        {loadingChannels ? 'Loading…' : 'Load channels'}
                      </button>
                      <button
                        onClick={handleSaveSlackChannel}
                        disabled={!isAdmin}
                        className="bg-[#1C1C1C] hover:bg-[#333] text-white px-4 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50"
                      >
                        Save channel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </Card>

            {/* ── Webhooks Card ── */}
            <Card>
              <CardHeader title="Webhooks" icon={<WebhookIcon size={16} />} />
              <div className="px-6 pb-6 space-y-4">
                <div className="space-y-3">
                  <div>
                    <FieldLabel>Webhook URL</FieldLabel>
                    <input
                      value={webhookUrl}
                      onChange={(e) => setWebhookUrl(e.target.value)}
                      placeholder="https://example.com/projecthub-webhook"
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div>
                    <FieldLabel>Secret</FieldLabel>
                    <div className="flex gap-2">
                      <input
                        value={webhookSecret}
                        onChange={(e) => setWebhookSecret(e.target.value)}
                        className={INPUT_CLASS}
                      />
                      <button
                        type="button"
                        onClick={() => setWebhookSecret(generateWebhookSecret())}
                        className="shrink-0 bg-[#F0EDE8] hover:bg-[#E8E4DD] text-[#1C1C1C] px-3 py-2.5 rounded-xl text-sm font-medium transition-all"
                      >
                        Regenerate
                      </button>
                    </div>
                  </div>

                  <div>
                    <span className="text-sm font-medium text-[#1C1C1C] block mb-2">Events</span>
                    <div className="grid grid-cols-2 gap-2">
                      {WEBHOOK_EVENT_OPTIONS.map((eventName) => (
                        <label key={eventName} className="text-xs text-[#1C1C1C] flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={webhookEvents.includes(eventName)}
                            onChange={() => handleToggleEvent(eventName)}
                            className="accent-[#E07A5F]"
                          />
                          {eventName}
                        </label>
                      ))}
                    </div>
                  </div>

                  <label className="text-xs text-[#1C1C1C] flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={webhookActive}
                      onChange={(e) => setWebhookActive(e.target.checked)}
                      className="accent-[#E07A5F]"
                    />
                    Active
                  </label>

                  <button
                    type="button"
                    onClick={handleCreateWebhook}
                    disabled={!isAdmin || savingWebhook}
                    className="bg-[#1C1C1C] hover:bg-[#333] text-white px-4 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50 transition-all"
                  >
                    {savingWebhook ? 'Saving…' : 'Add webhook'}
                  </button>
                </div>

                <div className="space-y-3 pt-2">
                  {webhooks.map((webhook) => (
                    <div
                      key={webhook.id}
                      className="border border-[#E8E4DD] rounded-xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-[#F7F4EF]"
                    >
                      <div className="space-y-1">
                        <p className="text-sm text-[#1C1C1C] break-all font-medium">{webhook.url}</p>
                        <p className="text-xs text-[#8A8178]">
                          {webhook.active ? '● Active' : '○ Inactive'} · {webhook.events.join(', ')}
                        </p>
                        <p className="text-xs text-[#8A8178]">
                          Last delivery: {webhook.last_delivery_status || 'Never'}
                        </p>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => handleTestWebhook(webhook.id)} className="bg-[#F0EDE8] hover:bg-[#E8E4DD] text-[#1C1C1C] px-3 py-1.5 rounded-lg text-xs font-medium transition-all">
                          Send test
                        </button>
                        <button onClick={() => handleToggleWebhookActive(webhook)} className="bg-[#FDF6E3] hover:bg-[#f5e8b4] text-[#9b7a28] px-3 py-1.5 rounded-lg text-xs font-medium transition-all">
                          {webhook.active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button onClick={() => handleDeleteWebhook(webhook.id)} className="bg-[#FDEEE9] hover:bg-[#fbe4da] text-[#c45f46] px-3 py-1.5 rounded-lg text-xs font-medium transition-all">
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                  {!webhooks.length && (
                    <p className="text-sm text-[#8A8178]">No webhooks configured yet.</p>
                  )}
                </div>
              </div>
            </Card>

            {/* ── Calendar Sync Card ── */}
            <Card>
              <CardHeader title="Calendar Sync" icon={<Calendar size={16} />} />
              <div className="px-6 pb-6 space-y-3">
                <p className="text-sm text-[#8A8178]">
                  Paste this URL into Google Calendar → Other calendars → From URL.
                </p>
                <div className="flex gap-2 flex-wrap">
                  <input value={calendarUrl} readOnly className={`${INPUT_CLASS} flex-1`} />
                  <button
                    type="button"
                    onClick={handleCopyCalendar}
                    className="shrink-0 flex items-center gap-2 bg-[#1C1C1C] hover:bg-[#333] text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
                  >
                    <Copy size={14} /> Copy link
                  </button>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* ── Delete Project Modal ── */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-[#1C1C1C]/30 backdrop-blur-[2px]"
            onClick={() => { setShowDeleteModal(false); setDeleteConfirmText(''); }}
          />
          <div className="relative bg-white border border-[#E8E4DD] rounded-2xl shadow-xl p-6 w-full max-w-md">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center">
                <AlertTriangle size={18} className="text-red-500" />
              </div>
              <h3 className="font-bold text-[#1C1C1C]" style={{ fontFamily: "'Lora', Georgia, serif" }}>
                Delete Project
              </h3>
            </div>
            <p className="text-sm text-[#6b6460] mb-5">
              This will permanently delete <strong className="text-[#1C1C1C]">{projectName}</strong> and all associated tasks, members, and activity. <strong className="text-red-600">This cannot be undone.</strong>
            </p>
            <div className="mb-5">
              <label className="text-xs font-medium text-[#1C1C1C] mb-1.5 block">
                Type <strong>DELETE</strong> to confirm
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className={INPUT_CLASS}
                placeholder="DELETE"
              />
            </div>
            <div className="flex gap-2.5">
              <button
                onClick={() => { setShowDeleteModal(false); setDeleteConfirmText(''); }}
                className="flex-1 px-4 py-2.5 border border-[#E8E4DD] rounded-xl text-sm font-medium text-[#8A8178] hover:bg-[#F7F4EF] transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteProject}
                disabled={deleteConfirmText !== 'DELETE'}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-2.5 rounded-xl text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" /> Delete Project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
