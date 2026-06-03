'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Send, Bot, User, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { motion, AnimatePresence } from 'framer-motion';

export function AIChatPanel() {
  const { id } = useParams();
  const projectId = id as string;
  
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await api.get(`/api/ai/history/${projectId}`);
        setMessages(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [projectId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    const userMessage = { role: 'user', content: input, created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsStreaming(true);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/ai/chat/${projectId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${useAuthStore.getState().accessToken}`
        },
        body: JSON.stringify({
          message: userMessage.content,
          history: messages.map(m => ({ role: m.role, content: m.content })),
        })
      });

      if (!response.body) throw new Error("No readable stream");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantMsg = '';

      setMessages((prev) => [...prev, { role: 'assistant', content: '', created_at: new Date().toISOString(), _isStreaming: true }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunkStrings = decoder.decode(value).split('\n\n');
        for (const chunkStr of chunkStrings) {
          if (chunkStr.startsWith('data: ')) {
            const data = JSON.parse(chunkStr.slice(6));
            if (data.chunk) {
              assistantMsg += data.chunk;
              setMessages((prev) => {
                const newMsgs = [...prev];
                newMsgs[newMsgs.length - 1].content = assistantMsg;
                return newMsgs;
              });
            } else if (data.done) {
              setMessages((prev) => {
                const newMsgs = [...prev];
                delete newMsgs[newMsgs.length - 1]._isStreaming;
                return newMsgs;
              });
              setIsStreaming(false);
            } else if (data.error) {
              setIsStreaming(false);
              console.error(data.error);
            }
          }
        }
      }
    } catch (err) {
      console.error(err);
      setIsStreaming(false);
    }
  };

  if (loading) return <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-indigo-500 w-8 h-8" /></div>;

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] bg-background border border-white/5 rounded-2xl overflow-hidden glass-panel">
      {/* Header */}
      <div className="h-16 border-b border-white/10 flex items-center justify-between px-6 bg-black/20 shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center border border-white/20 shadow-lg shadow-indigo-500/20">
            <Bot className="text-white" size={24} />
          </div>
          <div>
            <h2 className="font-bold text-white tracking-tight">Project AI Assistant</h2>
            <p className="text-xs text-indigo-300 flex items-center">
              <span className="w-2 h-2 rounded-full bg-indigo-400 mr-1.5 animate-pulse" />
              Claude 3.5 Sonnet Engine
            </p>
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-black/10">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
            <Bot size={56} className="text-indigo-500/50 mb-4" />
            <h3 className="text-xl font-bold mb-2">How can I help you today?</h3>
            <p className="text-muted-foreground text-sm">I have full access to this project&apos;s tasks, deadlines, members, and recent GitHub commits. Try asking me for a status update.</p>
            
            <div className="mt-8 space-y-2 w-full">
              {['What tasks are at risk of missing their deadline?', 'Summarize the recent engineering progress.', 'Who has the most tasks assigned?'].map((q, i) => (
                <button 
                  key={i} 
                  onClick={() => setInput(q)}
                  className="w-full p-3 text-sm text-left bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg transition-colors text-gray-300 hover:text-white"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <AnimatePresence>
            {messages.map((msg, i) => {
              const isUser = msg.role === 'user';
              
              return (
                <motion.div 
                  key={i} 
                  initial={{ opacity: 0, y: 10 }} 
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`flex items-start max-w-[80%] space-x-3 ${isUser ? 'flex-row-reverse space-x-reverse' : ''}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-md border border-white/10 ${
                      isUser ? 'bg-gradient-to-tr from-purple-500 to-pink-500' : 'bg-gradient-to-tr from-indigo-500 to-purple-600'
                    }`}>
                      {isUser ? <User size={14} className="text-white" /> : <Bot size={16} className="text-white" />}
                    </div>
                    
                    <div className={`p-4 rounded-2xl shadow-lg border ${
                      isUser 
                        ? 'bg-indigo-600 border-indigo-500 text-white rounded-tr-sm' 
                        : 'bg-[#1A1D24] border-white/10 text-gray-100 rounded-tl-sm'
                    }`}>
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                      
                      {msg._isStreaming && (
                        <div className="flex space-x-1 mt-3">
                          <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.2 }} className="w-1.5 h-1.5 bg-indigo-400 rounded-full" />
                          <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.2, delay: 0.2 }} className="w-1.5 h-1.5 bg-indigo-400 rounded-full" />
                          <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.2, delay: 0.4 }} className="w-1.5 h-1.5 bg-indigo-400 rounded-full" />
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 bg-black/20 border-t border-white/10 shrink-0">
        <form onSubmit={handleSubmit} className="relative flex items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isStreaming}
            placeholder="Ask about project status, tasks, or commits..."
            className="w-full bg-black/40 border border-white/10 rounded-full pl-6 pr-14 py-3.5 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all shadow-inner disabled:opacity-50"
          />
          <button 
            type="submit"
            disabled={!input.trim() || isStreaming}
            className="absolute right-2.5 w-9 h-9 bg-indigo-600 hover:bg-indigo-500 rounded-full flex items-center justify-center text-white disabled:opacity-50 transition-all shadow-lg"
          >
            <Send size={16} className="ml-0.5" />
          </button>
        </form>
      </div>
    </div>
  );
}
