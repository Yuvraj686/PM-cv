import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: any | null;
  setTokens: (access: string, refresh: string) => void;
  setUser: (user: any) => void;
  logout: () => void;
}

const AUTH_COOKIE_NAME = 'access_token';

const setAuthCookie = (token: string) => {
  if (typeof document === 'undefined') return;
  const maxAge = 60 * 60 * 24 * 7;
  document.cookie = `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; path=/; max-age=${maxAge}; samesite=lax`;
};

const clearAuthCookie = () => {
  if (typeof document === 'undefined') return;
  document.cookie = `${AUTH_COOKIE_NAME}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; samesite=lax`;
};

/** Read tokens from localStorage directly (set by the login page). */
const getStoredAccessToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('access_token');
};

const getStoredRefreshToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('refresh_token');
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      // Self-hydrate from localStorage so the login page's direct writes are picked up
      accessToken: getStoredAccessToken(),
      refreshToken: getStoredRefreshToken(),
      user: null,
      setTokens: (accessToken, refreshToken) => {
        // Keep both the Zustand state and the direct localStorage keys in sync
        if (typeof window !== 'undefined') {
          localStorage.setItem('access_token', accessToken);
          localStorage.setItem('refresh_token', refreshToken);
        }
        setAuthCookie(accessToken);
        set({ accessToken, refreshToken });
      },
      setUser: (user) => set({ user }),
      logout: () => {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
        }
        clearAuthCookie();
        set({ accessToken: null, refreshToken: null, user: null });
      },
    }),
    {
      name: 'auth-storage',
      // Merge persisted state but also always pick up the direct localStorage keys
      merge: (persistedState: any, currentState) => ({
        ...currentState,
        ...persistedState,
        // Always prefer the direct localStorage key (written by login page)
        accessToken: getStoredAccessToken() || persistedState?.accessToken || null,
        refreshToken: getStoredRefreshToken() || persistedState?.refreshToken || null,
      }),
    }
  )
);

interface NotificationState {
  unreadCount: number;
  increment: () => void;
  clear: () => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  unreadCount: 0,
  increment: () => set((state) => ({ unreadCount: state.unreadCount + 1 })),
  clear: () => set({ unreadCount: 0 }),
}));

interface KanbanState {
  tasksByProject: Record<string, any[]>;
  setProjectTasks: (projectId: string, tasks: any[]) => void;
  getProjectTasks: (projectId: string) => any[];
  moveTaskOptimistic: (projectId: string, taskId: string, newStatus: string) => any[];
  revertProjectTasks: (projectId: string, tasks: any[]) => void;
  updateTaskCommentCount: (projectId: string, taskId: string, count: number) => void;
}

export const useKanbanStore = create<KanbanState>((set, get) => ({
  tasksByProject: {},
  setProjectTasks: (projectId, tasks) =>
    set((state) => ({
      tasksByProject: { ...state.tasksByProject, [projectId]: tasks },
    })),
  getProjectTasks: (projectId) => get().tasksByProject[projectId] || [],
  moveTaskOptimistic: (projectId, taskId, newStatus) => {
    const previous = [...(get().tasksByProject[projectId] || [])];
    set((state) => ({
      tasksByProject: {
        ...state.tasksByProject,
        [projectId]: (state.tasksByProject[projectId] || []).map((t) =>
          t.id === taskId ? { ...t, status: newStatus } : t,
        ),
      },
    }));
    return previous;
  },
  revertProjectTasks: (projectId, tasks) =>
    set((state) => ({
      tasksByProject: { ...state.tasksByProject, [projectId]: tasks },
    })),
  updateTaskCommentCount: (projectId, taskId, count) =>
    set((state) => ({
      tasksByProject: {
        ...state.tasksByProject,
        [projectId]: (state.tasksByProject[projectId] || []).map((t) =>
          t.id === taskId ? { ...t, comment_count: count } : t,
        ),
      },
    })),
}));
