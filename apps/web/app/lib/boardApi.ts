'use client';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export type BoardAuthBundle = {
  accessToken: string;
  accessTokenExpiresAt: string;
  user: { id: string; name: string; email: string; role: string };
};

export class BoardApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function readMessage(raw: unknown): string {
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'object' && raw !== null) {
    const v = raw as { message?: unknown };
    if (Array.isArray(v.message)) return v.message.filter((x) => typeof x === 'string').join(', ');
    if (typeof v.message === 'string') return v.message;
  }
  return '';
}

export async function boardFetch<T = unknown>(
  bundle: BoardAuthBundle,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${bundle.accessToken}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`${API_URL}${path}`, { ...init, headers, credentials: 'include' });
  if (!res.ok) {
    let message = `Istek basarisiz (${res.status})`;
    const ctype = res.headers.get('content-type') ?? '';
    if (ctype.includes('application/json')) {
      try {
        const data = await res.json();
        message = readMessage(data) || message;
      } catch {
        // ignore
      }
    }
    throw new BoardApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  const ctype = res.headers.get('content-type') ?? '';
  if (!ctype.includes('application/json')) return undefined as T;
  return (await res.json()) as T;
}

export type BoardCardStatus = 'TODO' | 'IN_PROGRESS' | 'DONE';

export type BoardLabel = {
  id: string;
  name: string;
  color: string;
  createdAt: string;
};

export type BoardChecklistItem = {
  id: string;
  text: string;
  done: boolean;
  position: number;
  createdAt: string;
};

export type BoardCard = {
  id: string;
  title: string;
  description: string | null;
  status: BoardCardStatus;
  startAt: string | null;
  dueAt: string | null;
  position: number;
  hideCompletedChecklist: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; name: string };
  labels: Array<{ label: BoardLabel }>;
  checklist: BoardChecklistItem[];
};
