// Shared fetch wrapper for backend-served metric endpoints. Parses the
// structured {error: <code>} body the backend's respondError() sends (plan
// milestone M7) into a typed error cards can branch on, instead of every
// card re-deriving a plain string message from res.ok.
export class BackendError extends Error {
  code: string;
  status: number;
  retryAfterSeconds?: number;

  constructor(message: string, code: string, status: number, retryAfterSeconds?: number) {
    super(message);
    this.name = 'BackendError';
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export async function backendFetch<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: 'same-origin' });
  if (!res.ok) {
    let code = 'upstream_error';
    let retryAfterSeconds: number | undefined;
    try {
      const body = (await res.json()) as { error?: string; retryAfterSeconds?: number };
      if (body?.error) code = body.error;
      if (body?.retryAfterSeconds) retryAfterSeconds = body.retryAfterSeconds;
    } catch {
      // Non-JSON error body — keep the generic upstream_error code.
    }
    throw new BackendError(`Request to ${path} failed (${res.status})`, code, res.status, retryAfterSeconds);
  }
  return res.json() as Promise<T>;
}
