'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { GitCommit, Github, Calendar, Bot, Loader2 } from 'lucide-react';
import api from '@/lib/api';

export default function CommitsPage() {
  const { id } = useParams();
  const [commits, setCommits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCommits = async () => {
      try {
        const res = await api.get(`/api/github/commits/${id}`);
        setCommits(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchCommits();
  }, [id]);

  if (loading) return <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-indigo-500 w-8 h-8" /></div>;

  return (
    <div className="p-6 h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center justify-between pb-6 border-b border-white/10">
          <div>
            <h1 className="text-2xl font-bold font-geist tracking-tight flex items-center gap-3">
              <Github className="w-6 h-6 text-gray-400" />
              Commit Feed
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">Recent repository activity with AI-generated deployment summaries.</p>
          </div>
          
          <div className="flex items-center space-x-2 text-xs font-medium px-3 py-1.5 bg-indigo-500/10 text-indigo-400 rounded-full border border-indigo-500/20">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Webhook Active
          </div>
        </div>

        {commits.length === 0 ? (
          <div className="glass-panel p-12 rounded-2xl flex flex-col items-center text-center border-dashed border-2 border-white/10">
            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
              <GitCommit className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-xl font-bold mb-2">No commits yet</h3>
            <p className="text-muted-foreground max-w-md">Once you link a GitHub repository and push code, AI-summarized commits will appear here automatically.</p>
          </div>
        ) : (
          <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-white/10 before:to-transparent">
            {commits.map((commit, i) => (
              <div key={commit.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-background bg-indigo-600 text-white shadow shadow-indigo-600/50 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                  <GitCommit size={16} />
                </div>
                
                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] glass-panel p-5 rounded-2xl border border-white/10 hover:border-indigo-500/30 transition-colors shadow-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-[10px] font-bold">
                        {commit.author_name?.charAt(0) || 'U'}
                      </div>
                      <span className="text-sm font-medium">{commit.author_name || 'Unknown'}</span>
                    </div>
                    <div className="text-xs text-gray-500 flex items-center">
                      <Calendar size={12} className="mr-1" />
                      {new Date(commit.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  
                  <div className="bg-black/30 rounded-xl p-4 border border-white/5 mb-3 relative overflow-hidden group-hover:border-indigo-500/20 transition-colors">
                    <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500" />
                    <div className="flex items-center text-indigo-400 mb-2">
                      <Bot size={14} className="mr-1.5" />
                      <span className="text-xs font-bold uppercase tracking-wider">AI Summary</span>
                    </div>
                    <p className="text-sm text-gray-300 leading-relaxed">
                      {commit.ai_summary || 'No AI summary available for this commit payload.'}
                    </p>
                  </div>
                  
                  <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                    <span className="font-mono text-xs text-gray-500 bg-black/40 px-2 py-1 rounded">
                      {commit.sha.substring(0, 7)}
                    </span>
                    <span className="text-xs text-gray-400">
                      {commit.file_changes?.length || 0} files changed
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
