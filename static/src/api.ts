// ─── API client — resilient fetch wrapper with retry ───────────────────────

export class ApiError extends Error {
  status: number;
  body: Record<string, unknown>;

  constructor(status: number, message: string, body: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

type RequestOptions = Record<string, unknown>;

/**
 * API fetch wrapper with retry on network errors (not on 4xx/5xx).
 * Returns parsed JSON response on success.
 */
export async function api<T = Record<string, unknown>>(url: string, opts: RequestOptions = {}): Promise<T> {
  const MAX_RETRIES = 2;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        ...opts,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        throw new ApiError(res.status, (body.error as string) || `HTTP ${res.status}`, body);
      }
      return res.json() as Promise<T>;
    } catch (err) {
      if (err instanceof ApiError) throw err; // pas de retry sur 4xx/5xx
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }
  throw lastError || new Error('Network unreachable');
}
