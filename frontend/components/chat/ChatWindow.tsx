'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Send, Hash, Loader2, MessageSquare, Lock, WifiOff } from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { getAccessToken } from '@/lib/auth';

const AVATAR_COLORS = ['#E07A5F','#8DB88A','#C9A84C','#9B8EC4','#7A8FA6'];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h += name.charCodeAt(i);
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function ChatWindow() {
  const { id } = useParams();
  const projectId = id as string;
  const user = useAuthStore((s) => s.user);
  // Read token directly from localStorage to avoid Zustand hydration race conditions
  const storeToken = useAuthStore((s) => s.accessToken);

  const [channels, setChannels] = useState<any[]>([]);
  const [dmChannels, setDmChannels] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [activeChannel, setActiveChannel] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'open' | 'closed'>('closed');
  const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});
  const typingTimeoutRef = useRef<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const getUserNameFromMessages = (userId: string) =>
    messages.find((m) => m.sender_id === userId)?.sender?.name || 'Someone';

  // ── Fetch channels & members ──────────────────────────────────────────────
  useEffect(() => {
    if (!projectId) return;
    const fetchChannels = async () => {
      try {
        const [memRes, chanRes] = await Promise.all([
          api.get(`/api/projects/${projectId}/members`),
          api.get(`/api/chat/channels?project_id=${projectId}`),
        ]);
        setMembers(memRes.data);

        let chans = chanRes.data as any[];
        if (chans.length === 0) {
          // Auto-create general channel if none exist
          try {
            const createRes = await api.post(`/api/chat/channels`, {
              project_id: projectId,
              name: 'general',
              type: 'group',
            });
            chans = [createRes.data];
          } catch (e) {
            console.error('Failed to create default channel', e);
          }
        }
        setChannels(chans);
        if (chans.length > 0) setActiveChannelId(chans[0].id);
      } catch (err) {
        console.error('Chat init error', err);
      } finally {
        setLoading(false);
      }
    };
    fetchChannels();
  }, [projectId]);

  // ── Keep activeChannel object in sync ─────────────────────────────────────
  useEffect(() => {
    const found =
      channels.find((c) => c.id === activeChannelId) ||
      dmChannels.find((c) => c.id === activeChannelId) ||
      null;
    setActiveChannel(found);
  }, [activeChannelId, channels, dmChannels]);

  // ── Fetch history ─────────────────────────────────────────────────────────
  const fetchHistory = useCallback(async () => {
    if (!activeChannelId) return;
    try {
      const res = await api.get(`/api/chat/channels/${activeChannelId}/messages`);
      setMessages(res.data);
    } catch (err) {
      console.error('Failed to fetch message history', err);
    }
  }, [activeChannelId]);

  useEffect(() => {
    if (activeChannelId) fetchHistory();
  }, [activeChannelId, fetchHistory]);

  // ── WebSocket connection ──────────────────────────────────────────────────
  useEffect(() => {
    if (!activeChannel || !projectId) return;

    // Prefer Zustand token, fall back to localStorage directly
    const token = storeToken || getAccessToken();
    if (!token) {
      console.warn('ChatWindow: no auth token available for WebSocket');
      return;
    }

    // We need user.id for the WS URL — decode from JWT if not in store
    let userId: string | null = user?.id ?? null;
    if (!userId) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        userId = payload.sub ?? null;
      } catch {
        console.error('ChatWindow: could not decode user id from token');
        return;
      }
    }

    if (!userId) return;

    let destroyed = false;

    const connect = () => {
      if (destroyed) return;

      const wsBase = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000';
      const wsUrl = `${wsBase}/api/chat/ws/${activeChannel.room_id}/${userId}?token=${token}`;
      console.log('ChatWindow: connecting WS →', wsUrl);

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      setWsStatus('connecting');

      ws.onopen = () => {
        if (destroyed) { ws.close(); return; }
        setWsStatus('open');
        console.log('ChatWindow: WS connected');
      };

      ws.onmessage = (event) => {
        if (destroyed) return;
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'chat_message') {
            const msg = data.message;
            // Accept message for this channel
            if (msg.channel_id === activeChannelId || msg.channel_id === activeChannel.id) {
              setMessages((prev) => {
                // Deduplicate by id
                if (prev.some((m) => m.id === msg.id)) return prev;
                return [...prev, msg];
              });
            }
          } else if (data.type === 'typing') {
            setTypingUsers((prev) => ({ ...prev, [data.user_id]: Boolean(data.is_typing) }));
            if (data.is_typing !== false) {
              window.setTimeout(
                () => setTypingUsers((prev) => ({ ...prev, [data.user_id]: false })),
                2500
              );
            }
          } else if (data.type === 'commit_summary' || data.type === 'pong') {
            if (data.type === 'commit_summary') fetchHistory();
          }
        } catch (e) {
          console.error('ChatWindow: ws message parse error', e);
        }
      };

      ws.onerror = (err) => {
        console.error('ChatWindow: WS error', err);
        setWsStatus('closed');
      };

      ws.onclose = (ev) => {
        setWsStatus('closed');
        console.log('ChatWindow: WS closed', ev.code, ev.reason);
        // Auto-reconnect after 3 s unless component is unmounted or auth failed
        if (!destroyed && ev.code !== 4001 && ev.code !== 4003) {
          reconnectTimeoutRef.current = window.setTimeout(connect, 3000);
        }
      };
    };

    connect();

    return () => {
      destroyed = true;
      if (reconnectTimeoutRef.current) window.clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect on teardown
        wsRef.current.close();
        wsRef.current = null;
      }
      setWsStatus('closed');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChannel, projectId, storeToken]);

  // ── Open DM ───────────────────────────────────────────────────────────────
  const openDm = async (otherUserId: string) => {
    try {
      const res = await api.post(`/api/chat/dm/${otherUserId}`);
      setDmChannels((prev) =>
        prev.some((c) => c.id === res.data.id) ? prev : [res.data, ...prev]
      );
      setActiveChannelId(res.data.id);
    } catch (err) {
      console.error('openDm error', err);
    }
  };

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !activeChannelId) return;

    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn('ChatWindow: WebSocket not open, cannot send message (state:', ws?.readyState, ')');
      return;
    }

    ws.send(
      JSON.stringify({ type: 'chat_message', channel_id: activeChannelId, content: input.trim() })
    );
    setInput('');
  };

  const handleTyping = (value: string) => {
    setInput(value);
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    ws.send(JSON.stringify({ type: 'typing', is_typing: true }));
    typingTimeoutRef.current = window.setTimeout(() => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      wsRef.current.send(JSON.stringify({ type: 'typing', is_typing: false }));
    }, 2000);
  };

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin" style={{ color: 'var(--bloom-coral)' }} />
      </div>
    );
  }

  const activeChannelName =
    channels.find((c) => c.id === activeChannelId)?.name ||
    dmChannels.find((c) => c.id === activeChannelId)?.name ||
    'general';

  return (
    <div className="flex h-full" style={{ background: 'var(--bloom-bg)' }}>
      {/* ── Left: Channel list ── */}
      <div
        className="w-64 flex-shrink-0 hidden md:flex flex-col"
        style={{ background: 'var(--bloom-surface)', borderRight: '1px solid var(--bloom-border)' }}
      >
        {/* Search */}
        <div className="p-3" style={{ borderBottom: '1px solid var(--bloom-border)' }}>
          <input
            type="text"
            placeholder="Search messages"
            className="bloom-input w-full text-sm"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {/* Channels */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-1.5 px-2" style={{ color: 'var(--bloom-muted)' }}>
              Channels
            </p>
            {channels.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveChannelId(c.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-xl text-sm transition-all text-left"
                style={{
                  background: activeChannelId === c.id ? 'var(--bloom-coral-bg)' : 'transparent',
                  color: activeChannelId === c.id ? 'var(--bloom-coral)' : 'var(--bloom-muted)',
                  fontWeight: activeChannelId === c.id ? 600 : 400,
                }}
              >
                {c.type === 'dm' ? <Lock size={13} /> : <Hash size={13} />}
                <span className="truncate">{c.name || 'general'}</span>
              </button>
            ))}
          </div>

          {/* DMs */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-1.5 px-2" style={{ color: 'var(--bloom-muted)' }}>
              Direct Messages
            </p>
            {members
              .filter((m: any) => m.user_id !== user?.id)
              .map((m: any) => (
                <button
                  key={m.user_id}
                  onClick={() => openDm(m.user_id)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-xl text-sm transition-all text-left hover:bg-black/5"
                  style={{ color: 'var(--bloom-muted)' }}
                >
                  <span
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                    style={{ background: avatarColor(m.user?.name || 'U') }}
                  >
                    {m.user?.name?.charAt(0) || 'U'}
                  </span>
                  <span className="truncate">{m.user?.name}</span>
                </button>
              ))}
            {dmChannels.map((c: any) => (
              <button
                key={c.id}
                onClick={() => setActiveChannelId(c.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-xl text-sm transition-all text-left"
                style={{
                  background: activeChannelId === c.id ? 'var(--bloom-coral-bg)' : 'transparent',
                  color: activeChannelId === c.id ? 'var(--bloom-coral)' : 'var(--bloom-muted)',
                }}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--bloom-green)' }} />
                <span className="truncate">DM</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Center: Messages ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Channel header */}
        <div
          className="h-14 flex items-center justify-between px-5 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--bloom-border)', background: 'var(--bloom-surface)' }}
        >
          <div className="flex items-center gap-2">
            <Hash size={18} style={{ color: 'var(--bloom-muted)' }} />
            <span className="font-semibold text-sm" style={{ color: 'var(--bloom-text)' }}>
              {activeChannelName}
            </span>
            <span className="text-xs" style={{ color: 'var(--bloom-muted)' }}>
              · {members.length} members · Project channel
            </span>
          </div>
          {/* WS status indicator */}
          <div className="flex items-center gap-1.5">
            {wsStatus === 'open' ? (
              <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--bloom-green)' }}>
                <span className="w-2 h-2 rounded-full bg-current inline-block" />
                Live
              </span>
            ) : wsStatus === 'connecting' ? (
              <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--bloom-yellow)' }}>
                <Loader2 size={10} className="animate-spin" />
                Connecting…
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--bloom-muted)' }}>
                <WifiOff size={12} />
                Offline
              </span>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4" style={{ background: 'var(--bloom-bg)' }}>
          {/* Typing indicator */}
          {Object.entries(typingUsers).some(([uid, typing]) => typing && uid !== user?.id) && (
            <p className="text-xs" style={{ color: 'var(--bloom-muted)' }}>
              {Object.entries(typingUsers)
                .filter(([uid, typing]) => typing && uid !== user?.id)
                .map(([uid]) => getUserNameFromMessages(uid))
                .slice(0, 1)
                .join(', ')}{' '}
              is typing…
            </p>
          )}

          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center" style={{ color: 'var(--bloom-muted)' }}>
              <MessageSquare size={40} className="mb-3 opacity-40" />
              <p className="text-sm">No messages yet. Say hello!</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isMine = msg.sender_id === user?.id;
              const isAI   = msg.message_type === 'ai_summary';
              const senderName = msg.sender?.name || 'Unknown';
              const bg = avatarColor(senderName);

              if (isAI) {
                return (
                  <div key={msg.id} className="flex justify-center my-2">
                    <div
                      className="rounded-2xl p-4 max-w-2xl w-full text-sm"
                      style={{ background: 'var(--bloom-green-bg)', border: '1px solid #b5d5b3', color: '#2a5c28' }}
                    >
                      <p className="font-semibold mb-1">🤖 GitHub AI Summary</p>
                      <p className="whitespace-pre-wrap">{msg.content.replace('🤖 **GitHub Push Summary**\\n\\n', '')}</p>
                    </div>
                  </div>
                );
              }

              return (
                <div key={msg.id} className={`flex items-end gap-3 ${isMine ? 'flex-row-reverse' : ''}`}>
                  {!isMine && (
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                      style={{ background: bg }}
                    >
                      {senderName.charAt(0)}
                    </div>
                  )}
                  <div className={`max-w-[65%] ${isMine ? 'items-end' : 'items-start'} flex flex-col`}>
                    {!isMine && (
                      <p className="text-xs font-semibold mb-1" style={{ color: 'var(--bloom-muted)' }}>
                        {senderName}
                        <span className="ml-2 font-normal text-[10px]">
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </p>
                    )}
                    <div className={`px-4 py-2.5 text-sm rounded-2xl ${isMine ? 'chat-bubble-mine' : 'chat-bubble-other'}`}>
                      <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                    </div>
                    {isMine && (
                      <p className="text-[10px] mt-1" style={{ color: 'var(--bloom-muted)' }}>
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 flex-shrink-0" style={{ borderTop: '1px solid var(--bloom-border)', background: 'var(--bloom-surface)' }}>
          <form onSubmit={sendMessage} className="relative flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => handleTyping(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(e as any); } }}
              placeholder={wsStatus === 'open' ? `Message #${activeChannelName}` : 'Connecting to chat…'}
              disabled={wsStatus !== 'open'}
              className="bloom-input flex-1 pr-12 py-2.5"
            />
            <button
              type="submit"
              disabled={!input.trim() || wsStatus !== 'open'}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-white transition-all disabled:opacity-40"
              style={{ background: 'var(--bloom-coral)' }}
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      </div>

      {/* ── Right: Members panel ── */}
      <div
        className="w-56 flex-shrink-0 hidden lg:flex flex-col p-4"
        style={{ borderLeft: '1px solid var(--bloom-border)', background: 'var(--bloom-surface)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="font-semibold text-sm" style={{ color: 'var(--bloom-text)' }}>Members</p>
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{ background: 'var(--bloom-border)', color: 'var(--bloom-muted)' }}
          >
            {members.length}
          </span>
        </div>
        <div className="space-y-3">
          {members.map((m: any) => (
            <div key={m.user_id} className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                style={{ background: avatarColor(m.user?.name || 'U') }}
              >
                {m.user?.name?.charAt(0) || 'U'}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--bloom-text)' }}>{m.user?.name}</p>
                <p className="text-xs capitalize truncate" style={{ color: 'var(--bloom-muted)' }}>
                  {m.role?.replace('_', ' ')}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
