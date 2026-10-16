const TOKEN_KEY = 'ecs_token';

/**
 * Base URL of the API. Same-origin (relative paths) by default so the local
 * single-server build works unchanged. When deployed to Vercel/Netlify, set
 * VITE_API_URL (e.g. https://autosafe-api.onrender.com) so the static site
 * calls the hosted backend.
 */
const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${p}` : p;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const { method = 'GET', body } = options;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(apiUrl(path), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (data as { error?: string }).error ||
      `Request failed (${res.status})`;
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

export interface SseHandlers {
  onEvent?: (event: string, data: unknown) => void;
  onError?: (err: unknown) => void;
}

/**
 * Subscribes to the server's Server-Sent Events stream for real-time updates
 * and returns a cleanup function. Reconnects automatically.
 */
export function subscribeToEvents(handlers: SseHandlers): () => void {
  let source: EventSource | null = null;
  let stopped = false;
  let retry: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    if (stopped) return;
    source = new EventSource(apiUrl('/api/events'));
    source.onmessage = () => {
      // default message handler (ignore pings)
    };
    source.addEventListener('incident.possible', (e) =>
      handlers.onEvent?.('incident.possible', safeParse(e))
    );
    source.addEventListener('incident.countdown', (e) =>
      handlers.onEvent?.('incident.countdown', safeParse(e))
    );
    source.addEventListener('incident.confirmed', (e) =>
      handlers.onEvent?.('incident.confirmed', safeParse(e))
    );
    source.addEventListener('incident.cancelled', (e) =>
      handlers.onEvent?.('incident.cancelled', safeParse(e))
    );
    source.addEventListener('incident.updated', (e) =>
      handlers.onEvent?.('incident.updated', safeParse(e))
    );
    source.addEventListener('notification.updated', (e) =>
      handlers.onEvent?.('notification.updated', safeParse(e))
    );
    source.addEventListener('notification.workflow.start', (e) =>
      handlers.onEvent?.('notification.workflow.start', safeParse(e))
    );
    source.addEventListener('vehicle.location', (e) =>
      handlers.onEvent?.('vehicle.location', safeParse(e))
    );
    source.onerror = (err) => {
      source?.close();
      handlers.onError?.(err);
      if (!stopped) {
        retry = setTimeout(connect, 3000);
      }
    };
  };

  connect();
  return () => {
    stopped = true;
    if (retry) clearTimeout(retry);
    source?.close();
  };
}

function safeParse(e: MessageEvent): unknown {
  try {
    return JSON.parse(e.data);
  } catch {
    return e.data;
  }
}
