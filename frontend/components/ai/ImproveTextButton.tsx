'use client';

import { useState } from 'react';
import { Sparkles, Check, X } from 'lucide-react';
import { useSSE, StreamingCursor } from '@/src/hooks/useSSE';
import { toast } from 'sonner';

interface ImproveTextButtonProps {
  text: string;
  onAccept: (improved: string) => void;
  context?: 'task_description' | 'pr_summary';
}

export function ImproveTextButton({ text, onAccept, context = 'task_description' }: ImproveTextButtonProps) {
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const { stream, isStreaming } = useSSE();

  const handleImprove = async () => {
    if (!text.trim()) {
      toast.error('Add some text first');
      return;
    }
    setSuggestion('');

    try {
      for await (const msg of stream('/api/ai/improve-text', {
        body: { text, context },
      })) {
        if (msg.chunk) {
          setSuggestion((prev) => (prev ?? '') + msg.chunk);
        }
        if (msg.error) throw new Error(msg.error);
        if (msg.done && msg.full_response) {
          setSuggestion(msg.full_response);
        }
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to improve text');
      setSuggestion(null);
    }
  };

  const handleAccept = () => {
    if (suggestion) {
      onAccept(suggestion);
      setSuggestion(null);
      toast.success('Description updated');
    }
  };

  const handleReject = () => setSuggestion(null);

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleImprove}
        disabled={isStreaming || !text.trim()}
        className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md transition-colors hover:bg-black/5 disabled:opacity-50"
        style={{ color: 'var(--bloom-coral)' }}
      >
        <Sparkles size={12} />
        {isStreaming ? 'Improving…' : '✨ Improve'}
      </button>

      {suggestion !== null && (
        <div
          className="p-3 rounded-lg text-sm space-y-2"
          style={{ background: 'var(--bloom-coral-bg)', border: '1px solid var(--bloom-border)' }}
        >
          <p className="text-xs font-medium" style={{ color: 'var(--bloom-muted)' }}>AI suggestion:</p>
          <p style={{ color: 'var(--bloom-text)' }}>
            {suggestion}
            {isStreaming && <StreamingCursor />}
          </p>
          {!isStreaming && suggestion && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleAccept}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-md text-white"
                style={{ background: 'var(--bloom-coral)' }}
              >
                <Check size={12} /> Accept
              </button>
              <button
                type="button"
                onClick={handleReject}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bloom-btn-secondary"
              >
                <X size={12} /> Reject
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
