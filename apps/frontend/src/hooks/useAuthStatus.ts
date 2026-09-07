import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { AuthStatusEnvelopeSchema } from '@/lib/contract';
import type { AuthStatus } from '@/types';

/**
 * `useAuthStatus()` — calls GET /api/auth/status. Polls every 30 s so
 * the banner reflects disconnects within a minute.
 *
 * Parses through AuthStatusEnvelopeSchema, not AuthStatusSchema directly:
 * the BE wraps its payload as `{ status: {...} }` while the schema expects a
 * flat object, so the raw response threw "state Required" on every poll. The
 * query therefore never resolved and the header badge read "Error"
 * permanently regardless of the real connection state.
 */
export function useAuthStatus() {
  return useQuery<AuthStatus>({
    queryKey: ['auth', 'status'],
    queryFn: async () => {
      const raw = await apiClient<unknown>('/auth/status');
      return AuthStatusEnvelopeSchema.parse(raw) as AuthStatus;
    },
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
}
