'use client';

/**
 * API client.
 *
 * All requests go to the same origin (`/api/...`), which Next rewrites to the
 * backend. That is what allows authentication to use httpOnly cookies: the
 * browser never holds a token in JavaScript, so an XSS cannot steal a session.
 *
 * A 401 triggers exactly one refresh attempt, and concurrent 401s share it so a
 * page with six parallel requests does not fire six refreshes.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let refreshPromise: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        // Release the shared promise on the next tick so a later 401 can retry.
        setTimeout(() => {
          refreshPromise = null;
        }, 0);
      });
  }
  return refreshPromise;
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Set false for auth endpoints so a failed login does not trigger a refresh. */
  retryOnUnauthorized?: boolean;
  query?: Record<string, string | number | boolean | undefined | null>;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = path.startsWith('/api') ? path : `/api${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const queryString = params.toString();
  return queryString ? `${url}?${queryString}` : url;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, retryOnUnauthorized = true, query, headers, ...rest } = options;

  const execute = async (): Promise<Response> =>
    fetch(buildUrl(path, query), {
      ...rest,
      credentials: 'include',
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(headers as Record<string, string> | undefined),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

  let response = await execute();

  if (response.status === 401 && retryOnUnauthorized) {
    const refreshed = await refreshSession();
    if (refreshed) response = await execute();
  }

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    if (!response.ok) {
      throw new ApiError(response.status, 'REQUEST_FAILED', await response.text());
    }
    return (await response.blob()) as T;
  }

  const payload = (await response.json().catch(() => null)) as
    | { error?: { code?: string; message?: string; details?: unknown } }
    | null;

  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload?.error?.code ?? 'REQUEST_FAILED',
      payload?.error?.message ?? `Request failed with status ${response.status}`,
      payload?.error?.details,
    );
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'DELETE' }),
};

/** Downloads a binary response (used for PDF export). */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const response = await fetch(buildUrl(path), { method: 'POST', credentials: 'include' });
  if (!response.ok) throw new ApiError(response.status, 'DOWNLOAD_FAILED', 'Could not generate file');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
