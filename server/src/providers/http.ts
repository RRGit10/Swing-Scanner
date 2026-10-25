/** API failure. The message carries provider, status and URL path only — never headers, query or keys. */
export class ApiError extends Error {
  constructor(
    readonly provider: string,
    readonly status: number,
    readonly path: string,
    detail: string,
  ) {
    super(`${provider} ${status || 'network error'} on ${path}: ${detail}`);
    this.name = 'ApiError';
  }
}

export async function fetchJson(
  provider: string,
  url: URL,
  headers: Record<string, string>,
  timeoutMs = 10_000,
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    throw new ApiError(provider, 0, url.pathname, (err as Error).message);
  }

  const text = await res.text();
  if (!res.ok) {
    throw new ApiError(provider, res.status, url.pathname, text.slice(0, 200) || res.statusText);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(provider, res.status, url.pathname, `non-JSON response: ${text.slice(0, 200)}`);
  }
}
