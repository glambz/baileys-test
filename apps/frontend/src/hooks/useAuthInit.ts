import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

/**
 * `useAuthInit()` — calls POST /api/auth/init.
 *
 * Used by AuthInitPage and QrScanPage.
 */
export function useAuthInit() {
  return useMutation({
    mutationFn: async () => {
      return apiClient<unknown>('/auth/init', {
        method: 'POST',
      });
    },
  });
}