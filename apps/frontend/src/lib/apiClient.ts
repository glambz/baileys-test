import { ApiError, type ApiErrorBody } from './apiError';

/**
 * Thin fetch-based API client.
 *
 * All paths are prefixed with `/api`. The mock interceptor (see
 * `src/mock/interceptor.ts`) installs before this client is ever used;
 * real-network calls happen only when `VITE_USE_REAL_API === "true"`.
 *
 * Throws `ApiError` on non-2xx responses; on success returns the parsed
 * JSON body as `T`. Generic type is the caller's responsibility.
 */
export async function apiClient<T>(path: string, init?: RequestInit): Promise<T> {
  const url = path.startsWith('/') ? path : `/${path}`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...((init?.headers as Record<string, string> | undefined) ?? {}),
  };
  if (typeof init?.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`/api${url}`, { ...init, headers });

  if (!response.ok) {
    let body: ApiErrorBody = {};
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      /* response body may not be JSON */
    }
    throw new ApiError(
      response.status,
      body.error ?? 'UnknownError',
      body.message ?? `Request failed with status ${response.status}`,
      body.details
    );
  }

  return (await response.json()) as T;
}