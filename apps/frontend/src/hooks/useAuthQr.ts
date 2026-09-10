import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { ApiError } from '@/lib/apiError';

/**
 * `useAuthQr()` — calls GET /api/auth/qr.json on demand.
 *
 * A mutation rather than a query: the connection page fetches the QR when the
 * operator asks for it, not on render. (The onboarding flow at /qr polls
 * automatically; this page is deliberately manual.)
 *
 * The endpoint answers with three meaningfully different statuses, and the
 * caller needs to tell them apart:
 *
 *   200  the QR is ready — `qr` is a `data:image/png;base64,...` URL
 *   202  the socket is still connecting, so there is no QR yet. Retry.
 *        Note 202 is a 2xx, so apiClient resolves it: the body carries
 *        `error: 'QRNotReady'` rather than throwing.
 *   409  already authenticated, so there is nothing to scan. apiClient
 *        throws ApiError for this one.
 *
 * Rather than make every call site re-derive that, this normalises into a
 * single discriminated result.
 */
export type AuthQrResult =
  | { kind: 'ready'; dataUrl: string; message?: string }
  | { kind: 'not-ready'; message: string }
  | { kind: 'already-connected'; message: string };

interface QrJsonBody {
  qr?: string;
  message?: string;
  error?: string;
}

export function useAuthQr() {
  return useMutation<AuthQrResult>({
    mutationFn: async (): Promise<AuthQrResult> => {
      try {
        const body = await apiClient<QrJsonBody>('/auth/qr.json');
        if (body?.qr) {
          return { kind: 'ready', dataUrl: body.qr, message: body.message };
        }
        // 202 lands here: a 2xx with no `qr` field.
        return {
          kind: 'not-ready',
          message:
            body?.message ?? 'QR belum siap — socket masih menyambung. Coba lagi sebentar.',
        };
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          return {
            kind: 'already-connected',
            message: err.message || 'WhatsApp sudah tersambung; tidak ada QR untuk dipindai.',
          };
        }
        throw err;
      }
    },
  });
}
