'use client';

import { useCallback, useRef, useState } from 'react';
import { useAuthStore } from '@/lib/store';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface SSEMessage {
  chunk?: string;
  done?: boolean;
  error?: string;
  full_response?: string;
  status?: string;
  tasks?: unknown[];
  project_id?: string;
  [key: string]: unknown;
}

export interface UseSSEOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  onMessage?: (data: SSEMessage) => void;
  onDone?: (data: SSEMessage) => void;
  onError?: (error: string) => void;
}

/**
 * Hook for consuming Server-Sent Events from authenticated API endpoints.
 * Uses fetch + ReadableStream (EventSource does not support POST/auth headers).
 */
export function useSSE() {
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  const stream = useCallback(async function* (
    path: string,
    options: UseSSEOptions = {},
  ): AsyncGenerator<SSEMessage, void, unknown> {
    const { method = 'POST', body, onMessage, onDone, onError } = options;
    const token = useAuthStore.getState().accessToken;
    const url = path.startsWith('http') ? path : `${API_URL}${path}`;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsStreaming(true);

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!res.ok) {
        let message = res.statusText;
        try {
          const err = await res.json();
          message = err.message || message;
        } catch {
          /* ignore */
        }
        onError?.(message);
        yield { error: message };
        return;
      }

      if (!res.body) {
        onError?.('No response stream');
        yield { error: 'No response stream' };
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6)) as SSEMessage;
            onMessage?.(data);
            yield data;
            if (data.done) {
              onDone?.(data);
              return;
            }
            if (data.error && !data.chunk) {
              onError?.(data.error);
              return;
            }
          } catch {
            /* skip malformed chunks */
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      const message = err instanceof Error ? err.message : 'Stream failed';
      onError?.(message);
      yield { error: message };
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, []);

  return { stream, isStreaming, stop };
}

/** Blinking cursor shown while SSE content is streaming in */
export function StreamingCursor() {
  return (
    <span
      className="inline-block w-0.5 h-4 ml-0.5 align-middle animate-pulse"
      style={{ background: 'var(--bloom-coral)' }}
      aria-hidden
    />
  );
}
