import { useEffect, useState } from 'react';
import type { Issue } from './validateEntry.ts';
import { STATIC_SITE } from '../utils/endpoints.ts';

export interface ServerStatus {
  authRequired: boolean;
  editingEnabled: boolean;
  github: { configured: boolean; canWrite: boolean; repo?: string; branch?: string; dataPath?: string };
  entries: number;
}

export type GithubResult =
  | { status: 'disabled' }
  | { status: 'committed'; commit: string }
  | { status: 'failed'; error: string };

export class ApiError extends Error {
  status: number;
  issues?: Issue[];
  constructor(status: number, message: string, issues?: Issue[]) {
    super(message);
    this.status = status;
    this.issues = issues;
  }
}

const TOKEN_KEY = 'lares_editor_token';

export function getToken(): string {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function setToken(token: string) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable: token lives only until reload */
  }
}

export async function apiFetch<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method || 'GET',
      headers: {
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Server non raggiungibile.');
  }

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : null;
  if (!res.ok) {
    throw new ApiError(res.status, data?.error || `Errore ${res.status}`, data?.issues);
  }
  return data as T;
}

export const fetchStatus = (): Promise<ServerStatus> =>
  STATIC_SITE ? Promise.reject(new ApiError(0, 'Static site: no server.')) : apiFetch<ServerStatus>('/api/status');

export const verifyToken = () =>
  apiFetch<{ ok: boolean; githubAccess: { ok: boolean; detail: string } | null }>('/api/auth');

export const saveEntry = (fileName: string, xml: string, isNew: boolean) =>
  apiFetch<{ ok: boolean; fileName: string; issues: Issue[]; github: GithubResult }>(
    `/api/entries/${encodeURIComponent(fileName)}`,
    { method: 'PUT', body: { xml, isNew } }
  );

export const deleteEntry = (fileName: string) =>
  apiFetch<{ ok: boolean; github: GithubResult }>(`/api/entries/${encodeURIComponent(fileName)}`, { method: 'DELETE' });

export const pushAll = () => apiFetch<{ ok: boolean; github: GithubResult }>('/api/github/push-all', { method: 'POST' });

export const pullFromGithub = () => apiFetch<{ ok: boolean; pulled: number; changed: string[]; removed: string[] }>('/api/github/pull', { method: 'POST' });

let statusOnce: Promise<ServerStatus | null> | null = null;

/**
 * Whether to show editing shortcuts (the "Edit" button on an entry).
 * The editor is not advertised to the public: shortcuts appear only to someone who is
 * already signed in, or in development when the editor is open.
 */
export function useCanEdit(): boolean {
  const [can, setCan] = useState(false);
  useEffect(() => {
    let alive = true;
    statusOnce ||= fetchStatus().catch(() => null);
    statusOnce.then((s) => alive && setCan(Boolean(s && s.editingEnabled && (!s.authRequired || getToken()))));
    return () => {
      alive = false;
    };
  }, []);
  return can;
}
