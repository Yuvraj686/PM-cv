'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Send, Hash, MoreVertical, Loader2, MessageSquare } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { motion } from 'framer-motion';

export function ChatWindow() {
  const { id } = useParams();
  const projectId = id as string;
  const user = useAuthStore(s => s.user);
  const token = useAuthStore(s => s.accessToken);
  
  const [channels, setChannels] = useState<any[]>([]);
  const [dmChannels, setDmChannels] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});
  const typingTimeoutRef = useRef<number | null>(null);
  const getUserNameFromMessages = (userId: string) =>
    messages.find((m) => m.sender_id === userId)?.sender?.name || 'Someone';

  
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize channels
  useEffect(() => {
    const fetchChannels = async () => {
      try {
        const memRes = await api.get(`/api/projects/${projectId}/members`);
        setMembers(memRes.data);
        const res = await api.get(`/api/chat/channels?project_id=${projectId}`);
        setChannels(res.data);
        if (res.data.length > 0) {
          setActiveChannelId(res.data[0].id);
        } else {
          // Auto create general channel if it doesn't exist
          const createRes = await api.post(`/api/chat/channels`, {
            project_id: projectId,
            name: 'general',
            type: 'group'
          });
          setChannels([createRes.data]);
          setActiveChannelId(createRes.data.id);
        }
      } catch (err) {
        console.error("Chat init error", err);
      } finally {
        setLoading(false);
      }
    };
    fetchChannels();
  }, [projectId]);

  // Handle active channel change & WebSocket connection
  useEffect(() => {
    if (!activeChannelId || !user || !token) return;

    const activeChannel =
      channels.find((c) => c.id === activeChannelId) || dmChannels.find((c) => c.id === activeChannelId);
    if (!activeChannel) return;

    // Fetch history
    const fetchHistory = async () => {
      try {
        const res = await api.get(`/api/chat/channels/${activeChannelId}/messages`);
        setMessages(res.data);
      } catch (err) {
        console.error(err);
      }
    };
    fetchHistory();

    // Connect WebSocket
    const wsUrl = `${process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000'}/api/chat/ws/${activeChannel.room_id}/${user.id}?token=${token}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'chat_message') {
        const msg = data.message;
        if (msg.channel_id === activeChannelId) {
          setMessages(prev => [...prev, msg]);
        }
      } else if (data.type === 'typing') {
        setTypingUsers((prev) => ({ ...prev, [data.user_id]: Boolean(data.is_typing) }));
        if (data.is_typing === false) return;
        // Auto-clear after 2s of inactivity
        window.setTimeout(() => {
          setTypingUsers((prev) => ({ ...prev, [data.user_id]: false }));
        }, 2000);
      } else if (data.type === 'commit_summary') {
        if (activeChannelId) {
          // Optimistically show it or refetch
          fetchHistory();
        }
      }
    };

    return () => {
      ws.close();
    };
  }, [activeChannelId, projectId, user, token, channels, dmChannels]);

  const openDm = async (otherUserId: string) => {
    try {
      const res = await api.post(`/api/chat/dm/${otherUserId}`);
      setDmChannels((prev) => (prev.some((c) => c.id === res.data.id) ? prev : [res.data, ...prev]));
      setActiveChannelId(res.data.id);
    } catch (err) {
      console.error(err);
    }
  };

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !wsRef.current || !activeChannelId) return;

    wsRef.current.send(JSON.stringify({
      type: 'chat_message',
      channel_id: activeChannelId,
      content: input,
    }));
    setInput('');
  };

  const handleTyping = (value: string) => {
    setInput(value);
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    wsRef.current.send(
      JSON.stringify({
        type: 'typing',
        is_typing: true,
      })
    );
    typingTimeoutRef.current = window.setTimeout(() => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      wsRef.current.send(JSON.stringify({ type: 'typing', is_typing: false }));
    }, 2000);
  };

  if (loading) return <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-indigo-500 w-8 h-8" /></div>;

  return (
    <div className="flex h-full bg-background border border-white/5 rounded-2xl overflow-hidden glass-panel">
      {/* Sidebar Channels */}
      <div className="w-64 border-r border-white/10 bg-black/20 hidden md:flex md:flex-col">
        <div className="p-4 border-b border-white/10 shrink-0">
          <h2 className="font-bold text-sm uppercase tracking-wider text-gray-400">Channels</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {channels.map(c => (
            <button
              key={c.id}
              onClick={() => setActiveChannelId(c.id)}
              className={`w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-sm transition-all text-left ${activeChannelId === c.id ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}
            >
              <Hash size={16} />
              <span className="truncate">{c.name || 'general'}</span>
            </button>
          ))}

          <div className="mt-4 pt-4 border-t border-white/10">
            <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Direct Messages
            </h3>
            {members
              .filter((m: any) => m.user_id !== user?.id)
              .map((m: any) => (
                <button
                  key={m.user_id}
                  onClick={() => openDm(m.user_id)}
                  className="w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-sm transition-all text-left text-gray-400 hover:bg-white/5 hover:text-gray-200"
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400/70" />
                  <span className="truncate">{m.user?.name}</span>
                </button>
              ))}
            {dmChannels.map((c: any) => (
              <button
                key={c.id}
                onClick={() => setActiveChannelId(c.id)}
                className={`w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-sm transition-all text-left ${
                  activeChannelId === c.id ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-indigo-400/70" />
                <span className="truncate">DM</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-black/10">
        <div className="h-14 border-b border-white/10 flex items-center justify-between px-6 shrink-0 bg-black/20 backdrop-blur-sm relative z-10">
          <div className="flex items-center space-x-2">
            <Hash className="text-gray-400" size={20} />
            <h2 className="font-bold">{channels.find(c => c.id === activeChannelId)?.name || 'general'}</h2>
          </div>
          <button className="text-gray-400 hover:text-white">
            <MoreVertical size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar relative z-0">
          {Object.entries(typingUsers).some(([uid, typing]) => typing && uid !== user?.id) && (
            <p className="text-xs text-gray-400">
              {Object.entries(typingUsers)
                .filter(([uid, typing]) => typing && uid !== user?.id)
                .map(([uid]) => getUserNameFromMessages(uid))
                .slice(0, 1)
                .join(', ')} is typing...
            </p>
          )}
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
              <MessageSquare size={48} className="mb-4 opacity-50" />
              <p>No messages yet. Send a message to start the conversation!</p>
            </div>
          ) : (
            messages.map((msg, i) => {
              const isMine = msg.sender_id === user?.id;
              const isAI = msg.message_type === 'ai_summary';
              
              if (isAI) {
                return (
                  <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex justify-center my-4">
                    <div className="bg-emerald-900/40 border border-emerald-500/30 rounded-xl p-4 max-w-2xl w-full">
                      <div className="flex items-center space-x-2 mb-2 text-emerald-400 font-medium text-sm">
                        <span>🤖 GitHub AI Summary</span>
                      </div>
                      <p className="text-sm text-gray-200 whitespace-pre-wrap">{msg.content.replace('🤖 **GitHub Push Summary**\\n\\n', '')}</p>
                    </div>
                  </motion.div>
                );
              }

              return (
                <motion.div 
                  key={msg.id} 
                  initial={{ opacity: 0, y: 10 }} 
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex items-end space-x-2 ${isMine ? 'justify-end' : 'justify-start'}`}
                >
                  {!isMine && (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-pink-500 flex items-center justify-center text-xs font-bold shrink-0 shadow-md">
                      {msg.sender?.name?.charAt(0) || '?'}
                    </div>
                  )}
                  <div className={`max-w-[70%] ${isMine ? 'order-1' : 'order-2'}`}>
                    {!isMine && <p className="text-xs text-gray-400 mb-1 ml-1">{msg.sender?.name}</p>}
                    <div className={`px-4 py-2.5 rounded-2xl ${
                      isMine 
                        ? 'bg-indigo-600 text-white rounded-br-sm shadow-lg shadow-indigo-600/20' 
                        : 'bg-white/10 text-gray-100 rounded-bl-sm border border-white/5'
                    }`}>
                      <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                    </div>
                    <p className={`text-[10px] text-gray-500 mt-1 ${isMine ? 'text-right mr-1' : 'ml-1'}`}>
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </motion.div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 bg-black/20 border-t border-white/10 shrink-0">
          <form onSubmit={sendMessage} className="relative flex items-center">
            <input
              type="text"
              value={input}
              onChange={(e) => handleTyping(e.target.value)}
              placeholder="Message #general"
              className="w-full bg-black/40 border border-white/10 rounded-full pl-6 pr-14 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all shadow-inner"
            />
            <button 
              type="submit"
              disabled={!input.trim()}
              className="absolute right-2 w-8 h-8 bg-indigo-600 hover:bg-indigo-500 rounded-full flex items-center justify-center text-white disabled:opacity-50 transition-colors"
            >
              <Send size={14} className="ml-0.5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
