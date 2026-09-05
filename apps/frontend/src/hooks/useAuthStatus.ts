import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { AuthStatusSchema } from '@/lib/contract';
import type { AuthStatus } from '@/types';

/**
 * `useAuthStatus()` — calls GET /api/auth/status. Polls every 30 s so
 * the banner reflects disconnects within a minute.
 */
export function useAuthStatus() {
  return useQuery<AuthStatus>({
    queryKey: ['auth', 'status'],
    queryFn: async () => {
      const raw = await apiClient<unknown>('/auth/status');
      return AuthStatusSchema.parse(raw) as AuthStatus;
    },
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
}