'use client';

import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/lib/store';
import { getAccessToken } from '@/lib/auth';

export type ProjectWSEvent =
  | { type: 'presence:joined'; user: { id: string; name: string; avatar?: string | null } }
  | { type: 'presence:left'; user_id: string }
  | { type: 'presence:snapshot'; users: { id: string; name: string; avatar?: string | null }[] }
  | { type: 'task:comment_added'; task_id: string; comment: unknown }
  | { type: 'activity:new'; activity: unknown }
  | { type: 'pong' }
  | Record<string, unknown>;

type EventHandler = (event: ProjectWSEvent) => void;

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000';

interface ConnectionState {
  ws: WebSocket;
  projectId: string;
  refCount: number;
  handlers: Set<EventHandler>;
  heartbeat: ReturnType<typeof setInterval> | null;
}

let connection: ConnectionState | null = null;

function send(payload: Record<string, unknown>) {
  if (connection?.ws.readyState === WebSocket.OPEN) {
    connection.ws.send(JSON.stringify(payload));
  }
}

function connect(projectId: string) {
  const user = useAuthStore.getState().user;
  const token = useAuthStore.getState().accessToken || getAccessToken();
  if (!token || !user?.id) return;

  const roomId = `project_${projectId}`;
  const url = `${WS_BASE}/api/chat/ws/${roomId}/${user.id}?token=${token}`;
  const ws = new WebSocket(url);

  connection = {
    ws,
    projectId,
    refCount: 0,
    handlers: new Set(),
    heartbeat: null,
  };

  ws.onopen = () => {
    send({ type: 'presence:join' });
    connection!.heartbeat = setInterval(() => send({ type: 'ping' }), 15000);
  };

  ws.onmessage = (evt) => {
    try {
      const data = JSON.parse(evt.data) as ProjectWSEvent;
      connection?.handlers.forEach((h) => h(data));
    } catch {
      /* ignore */
    }
  };

  ws.onclose = () => {
    if (connection?.heartbeat) clearInterval(connection.heartbeat);
    connection = null;
  };
}

function disconnect() {
  if (!connection) return;
  if (connection.heartbeat) clearInterval(connection.heartbeat);
  if (connection.ws.readyState === WebSocket.OPEN) {
    connection.ws.send(JSON.stringify({ type: 'presence:leave' }));
    connection.ws.close();
  }
  connection = null;
}

/**
 * Shared ref-counted WebSocket for a project room (presence, comments, activity).
 * Uses the existing native WebSocket endpoint — not Socket.IO.
 */
export function useProjectWebSocket(
  projectId: string | undefined,
  onEvent: EventHandler,
) {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!projectId) return;

    const stableHandler: EventHandler = (evt) => handlerRef.current(evt);

    if (!connection || connection.projectId !== projectId) {
      if (connection) disconnect();
      connect(projectId);
    }

    connection!.refCount += 1;
    connection!.handlers.add(stableHandler);

    return () => {
      if (!connection) return;
      connection.handlers.delete(stableHandler);
      connection.refCount -= 1;
      if (connection.refCount <= 0) {
        disconnect();
      }
    };
  }, [projectId]);
}
