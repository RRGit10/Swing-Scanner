import { useCallback, useEffect, useRef, useState } from 'react';
import type { StatusPayload } from './types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`HTTP ${status}`);
  }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? 'GET',
    headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

export interface Resource<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/** Fetch `path`; refetch whenever `refreshKey` changes (e.g. a new scan landed). */
export function useResource<T>(path: string | null, refreshKey: unknown = null): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    setLoading(true);
    api<T>(path)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
      })
      .catch((e: Error) => !cancelled && setError(e instanceof ApiError ? describe(e) : `Can't reach the scanner API (${e.message}). Is \`npm run dev\` running?`))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [path, refreshKey, tick]);

  return { data, error, loading, reload };
}

function describe(e: ApiError): string {
  const b = e.body as { error?: string } | null;
  return b?.error ?? `The scanner API answered ${e.status}.`;
}

const STATUS_POLL_MS = 30_000;

/** Market/scan status, polled every 30 s. */
export function useStatus(): Resource<StatusPayload> {
  const res = useResource<StatusPayload>('/api/status');
  const reload = useRef(res.reload);
  reload.current = res.reload;
  useEffect(() => {
    const id = setInterval(() => reload.current(), STATUS_POLL_MS);
    return () => clearInterval(id);
  }, []);
  return res;
}
