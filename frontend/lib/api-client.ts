import { useAuthStore } from './store';

export class ApiError extends Error {
  status: number;
  code: string;
  detail: any;

  constructor(status: number, code: string, message: string, detail?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.detail = detail || {};
  }
}

interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
  rawResponse?: boolean;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retriesRemaining = 3,
  delay = 1000
): Promise<Response> {
  try {
    const res = await fetch(url, options);
    
    // Retry on 5xx server errors
    if (res.status >= 500 && retriesRemaining > 0) {
      console.warn(`Server error ${res.status}. Retrying in ${delay}ms... (${retriesRemaining} retries left)`);
      await sleep(delay);
      return fetchWithRetry(url, options, retriesRemaining - 1, delay * 2);
    }
    
    return res;
  } catch (error) {
    // Retry on network errors
    if (retriesRemaining > 0) {
      console.warn(`Network error. Retrying in ${delay}ms... (${retriesRemaining} retries left)`);
      await sleep(delay);
      return fetchWithRetry(url, options, retriesRemaining - 1, delay * 2);
    }
    throw error;
  }
}

let refreshPromise: Promise<string> | null = null;

function redirectToLogin() {
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.assign('/login');
  }
}

function expireSession() {
  useAuthStore.getState().logout();
  redirectToLogin();
}

async function handleTokenRefresh(): Promise<string> {
  const store = useAuthStore.getState();
  const refreshToken = store.refreshToken;

  if (!refreshToken) {
    throw new Error('No refresh token available');
  }

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  
  // Call the refresh endpoint
  // Using direct fetch to avoid recursion
  const res = await fetch(`${API_URL}/api/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!res.ok) {
    throw new Error('Failed to refresh token');
  }

  const data = await res.json();
  const newAccessToken = data.access_token;
  const newRefreshToken = data.refresh_token || refreshToken; // fallback if not rotated

  store.setTokens(newAccessToken, newRefreshToken);
  return newAccessToken;
}

function getFreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = handleTokenRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function apiClient(
  path: string,
  options: RequestOptions = {}
): Promise<any> {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  const url = path.startsWith('http') ? path : `${API_URL}${path}`;

  const headers = new Headers(options.headers || {});
  
  if (!options.skipAuth) {
    const accessToken = useAuthStore.getState().accessToken;
    if (accessToken) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }
  }

  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
    options.body = JSON.stringify(options.body);
  }

  const finalOptions: RequestInit = {
    ...options,
    headers,
  };

  try {
    let res = await fetchWithRetry(url, finalOptions);

    // Handle 401 Unauthorized
    if (res.status === 401 && !options.skipAuth) {
      try {
        const newAccessToken = await getFreshAccessToken();
        const newHeaders = new Headers(finalOptions.headers);
        newHeaders.set('Authorization', `Bearer ${newAccessToken}`);
        res = await fetchWithRetry(url, { ...finalOptions, headers: newHeaders });

        if (res.status === 401) {
          expireSession();
          throw new ApiError(401, 'UNAUTHORIZED', 'Session expired. Please log in again.');
        }
      } catch (refreshErr) {
        if (refreshErr instanceof ApiError) {
          throw refreshErr;
        }
        expireSession();
        throw new ApiError(401, 'UNAUTHORIZED', 'Session expired. Please log in again.');
      }
    }

    if (!res.ok) {
      let errorData: any = {};
      try {
        errorData = await res.json();
      } catch {
        // Response wasn't JSON
      }

      const status = res.status;
      const code = errorData.code || 'API_ERROR';
      const message = errorData.message || res.statusText || 'An error occurred';
      const detail = errorData.detail || {};

      throw new ApiError(status, code, message, detail);
    }

    if (options.rawResponse) {
      return res;
    }

    // For 204 No Content
    if (res.status === 204) {
      return null;
    }

    // Check content type before parsing JSON
    const contentType = res.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await res.json();
    }

    return await res.text();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    // Network or other error
    throw new ApiError(500, 'NETWORK_ERROR', error instanceof Error ? error.message : 'Network request failed');
  }
}

apiClient.get = (path: string, options?: RequestOptions) =>
  apiClient(path, { ...options, method: 'GET' });

apiClient.post = (path: string, body?: any, options?: RequestOptions) =>
  apiClient(path, { ...options, method: 'POST', body });

apiClient.put = (path: string, body?: any, options?: RequestOptions) =>
  apiClient(path, { ...options, method: 'PUT', body });

apiClient.patch = (path: string, body?: any, options?: RequestOptions) =>
  apiClient(path, { ...options, method: 'PATCH', body });

apiClient.delete = (path: string, options?: RequestOptions) =>
  apiClient(path, { ...options, method: 'DELETE' });
