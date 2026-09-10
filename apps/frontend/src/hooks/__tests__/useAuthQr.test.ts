/**
 * useAuthQr — the three outcomes of GET /api/auth/qr.json.
 *
 * Unit tests rather than a live check because the interesting case (a QR is
 * ready) only happens while the socket is NOT paired, and forcing that on a
 * running instance means logging the operator out.
 *
 * Everything is mocked at the top level and the module is imported exactly
 * once. An earlier version re-imported the hook per test with
 * vi.resetModules(), which gave the hook a *different* ApiError class object
 * than the test constructed, so its `instanceof ApiError` check could never
 * match. Keep one module graph.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const apiClientMock = vi.fn();
let capturedMutationFn: (() => Promise<unknown>) | undefined;

vi.mock('@/lib/apiClient', () => ({
  apiClient: (...args: unknown[]) => apiClientMock(...args),
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: (opts: { mutationFn: () => Promise<unknown> }) => {
    capturedMutationFn = opts.mutationFn;
    return { mutate: vi.fn(), mutateAsync: opts.mutationFn, isPending: false };
  },
}));

const { useAuthQr } = await import('../useAuthQr');
const { ApiError } = await import('@/lib/apiError');

/**
 * Calling the hook registers its mutationFn with the mocked useMutation.
 * Named with the `use` prefix so react-hooks/rules-of-hooks accepts the
 * hook call inside it.
 */
function useCapturedMutationFn() {
  useAuthQr();
  if (!capturedMutationFn) throw new Error('mutationFn was not captured');
  return capturedMutationFn;
}

beforeEach(() => {
  apiClientMock.mockReset();
});

describe('useAuthQr', () => {
  it('returns "ready" with the data URL when the QR is available (200)', async () => {
    apiClientMock.mockResolvedValue({
      qr: 'data:image/png;base64,AAAA',
      message: 'Scan this QR',
    });
    await expect(useCapturedMutationFn()()).resolves.toEqual({
      kind: 'ready',
      dataUrl: 'data:image/png;base64,AAAA',
      message: 'Scan this QR',
    });
    expect(apiClientMock).toHaveBeenCalledWith('/auth/qr.json');
  });

  it('returns "not-ready" for a 202, which apiClient resolves rather than throws', async () => {
    apiClientMock.mockResolvedValue({
      error: 'QRNotReady',
      message: 'QR is not ready yet.',
    });
    await expect(useCapturedMutationFn()()).resolves.toEqual({
      kind: 'not-ready',
      message: 'QR is not ready yet.',
    });
  });

  it('falls back to its own copy when a 202 carries no message', async () => {
    apiClientMock.mockResolvedValue({ error: 'QRNotReady' });
    const r = (await useCapturedMutationFn()()) as { kind: string; message: string };
    expect(r.kind).toBe('not-ready');
    expect(r.message.length).toBeGreaterThan(0);
  });

  it('maps a 409 to "already-connected" instead of surfacing an error', async () => {
    apiClientMock.mockRejectedValue(
      new ApiError(409, 'AlreadyAuthenticated', 'WhatsApp is already connected.')
    );
    await expect(useCapturedMutationFn()()).resolves.toEqual({
      kind: 'already-connected',
      message: 'WhatsApp is already connected.',
    });
  });

  it('rethrows anything that is not a 409 so the UI shows a real failure', async () => {
    apiClientMock.mockRejectedValue(new ApiError(500, 'ServerError', 'boom'));
    await expect(useCapturedMutationFn()()).rejects.toThrow('boom');
  });

  it('rethrows non-ApiError failures (e.g. network down)', async () => {
    apiClientMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(useCapturedMutationFn()()).rejects.toThrow('Failed to fetch');
  });
});
