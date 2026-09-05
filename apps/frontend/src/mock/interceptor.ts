import { routeMockRequest } from './handler';

/**
 * Install the in-process fetch interceptor.
 *
 * Any fetch request whose URL starts with `/api/` is routed through
 * the handler table in `handler.ts`. When the env var
 * `VITE_USE_REAL_API === "true"` the interceptor is a no-op so the
 * future real-backend swap is a config flip away.
 *
 * Call exactly once, before the first `createRoot(...).render(...)`.
 */
let installed = false;

export function installMockInterceptor(): void {
  if (installed) return;
  installed = true;

  if (import.meta.env.VITE_USE_REAL_API === 'true') {
    return;
  }

  const originalFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    if (!url.startsWith('/api/') && url !== '/api') {
      // Pass through to the real network for non-mocked requests
      // (e.g. asset fetches).
      return originalFetch(input, init);
    }

    const method = (init?.method ?? 'GET').toUpperCase();
    const parsed = new URL(url, 'http://mock.local');
    const urlPath = parsed.pathname.replace(/^\/api/, '');

    let body: unknown = undefined;
    if (init?.body) {
      if (typeof init.body === 'string') {
        try {
          body = JSON.parse(init.body);
        } catch {
          body = init.body;
        }
      } else if (init.body instanceof FormData) {
        body = Object.fromEntries(init.body.entries());
      } else {
        body = init.body;
      }
    }

    const response = await routeMockRequest(method, urlPath, parsed, body);
    if (!response) {
      throw new Error(`No mock handler registered for ${method} ${urlPath}`);
    }
    return response;
  };
}