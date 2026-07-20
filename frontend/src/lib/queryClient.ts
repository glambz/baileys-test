import { QueryClient } from '@tanstack/react-query';
import { AI_CONFIDENCE_THRESHOLD } from './config';

/**
 * Global TanStack Query client.
 *
 * - `staleTime` defaults to 30 s so background refetches don't visibly
 *   flicker the sidebar on focus.
 * - `retry: 1` so transient mock failures bubble up to the caller
 *   without infinite retries.
 * - The AI confidence threshold is attached for debugging convenience.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

queryClient.setQueryData(['config', 'ai'], {
  threshold: AI_CONFIDENCE_THRESHOLD,
});