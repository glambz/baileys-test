import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { MessageListSchema } from '@/lib/contract';
import type { Message } from '@/types';

export interface UseMessagesResult {
  data: Message[] | undefined;
  isLoading: boolean;
  isFetchingOlder: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  hasOlder: boolean;
  fetchOlder: () => Promise<void>;
}

/**
 * `useMessages(chatId)` — thread history.
 *
 * Bug fixes (2026-07-16):
 *  - Bug 2: 5-second `refetchInterval` so new inbound/AI messages appear
 *    automatically without a manual page refresh.
 *  - Bug 5: `fetchOlder()` lets the FE pull the next batch from the BE
 *    using the `?before=<ts>&limit=<n>` cursor (`nextBefore` from the
 *    response).
 *
 * BUG-PUSH-EVENTS feature (2026-08-03): the 5-second poll is now
 * redundant since `useChatEvents` (mounted by ChatsPage) streams
 * `message.created` events via Server-Sent Events. We keep the poll
 * as a belt-and-braces fallback for browsers where EventSource is
 * blocked (e.g. some embedded WebViews) — but at a longer interval
 * (15s) so the loop doesn't waste bandwidth.
 */
export function useMessages(chatId: string | null): UseMessagesResult {
  const qc = useQueryClient();
  const queryKey = ['messages', chatId] as const;

  // Cache the older-batch cursor in a ref so it survives renders but
  // doesn't trigger re-renders itself.
  const cursorRef = useRef<{ nextBefore?: number }>({});

  const query = useQuery<{ messages: Message[] }>({
    queryKey,
    enabled: chatId !== null,
    queryFn: async () => {
      const raw = await apiClient<unknown>(
        `/chats/${encodeURIComponent(chatId as string)}/messages`,
      );
      const parsed = MessageListSchema.parse(raw);
      // Reset older-batch cursor whenever we run the first query against
      // this chatId (e.g. chatId changed or refetch after switching tabs).
      cursorRef.current = { nextBefore: parsed.nextBefore };
      return { messages: parsed.messages as Message[] };
    },
    // BUG-CHAT-UX-FIX-2 fix (2026-07-16): poll every 5s for new
    // messages; pause when the tab is hidden (TanStack Query's smart
    // refetching also catches up on focus).
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    // Keep prior messages visible across refetches by considering each
    // cache entry scoped to its chatId only.
    staleTime: 1000,
  });

  // BUG-CHAT-UX-FIX-5 fix (2026-07-16): infinite older-message loading.
  // Prepend the new batch to the existing list so the FE list stays in
  // chronological order (oldest at the top, newest at the bottom).
  // BUG-CHAT-CACHE-SHAPE-MISMATCH fix (2026-07-22): align the cache shape
  // with useSendMessage.ts and useMessages's own queryFn: the cached
  // value is `{ messages: Message[] }`, NOT a bare `Message[]`.
  const fetchOlderMutation = useMutation<Message[], Error, { chatId: string }>({
    mutationFn: async ({ chatId: cid }) => {
      const cursor = cursorRef.current.nextBefore;
      if (!cursor) return [];
      const url =
        `/chats/${encodeURIComponent(cid)}/messages?before=${cursor}&limit=50`;
      const raw = await apiClient<unknown>(url);
      const parsed = MessageListSchema.parse(raw);
      cursorRef.current = { nextBefore: parsed.nextBefore };
      return parsed.messages as Message[];
    },
    onSuccess: (olderMsgs) => {
      if (olderMsgs.length > 0) {
        qc.setQueryData<{ messages: Message[] }>(queryKey, (curr) => {
          const existing = curr?.messages ?? [];
          const seen = new Set<string>();
          const next: Message[] = [];
          for (const m of olderMsgs) {
            if (!seen.has(m.id)) {
              seen.add(m.id);
              next.push(m);
            }
          }
          for (const m of existing) {
            if (!seen.has(m.id)) {
              seen.add(m.id);
              next.push(m);
            }
          }
          return { messages: next };
        });
      }
      // BUG-AI-HUMAN-BANNER-NEEDS-REFRESH fix (2026-07-23): when a new
      // message lands (including older batches that change the cache),
      // also invalidate the modes map so the SystemHumanHandoffBanner
      // updates immediately if the trigger transitioned the chat to
      // `human_pending_flag` as a side-effect.
      void qc.invalidateQueries({ queryKey: ['crm', 'chats', 'modes'] });
    },
  });

  // Reset the older cursor on chatId change so a switch to another chat
  // does not reuse a stale cursor (timestamp is chat-relative).
  useEffect(() => {
    cursorRef.current = {};
  }, [chatId]);

  const data = query.data?.messages;
  // BUG-CHAT-UX-FIX-5: we have older messages to load if either:
  // (a) the BE returned a `nextBefore` cursor (still older rows exist),
  // (b) the last-fetch returned exactly the page-size cap (likely more),
  // or (c) the cursor was set previously (subsequent batches).
  const lastLen = data?.length ?? 0;
  const hasOlder =
    typeof cursorRef.current.nextBefore === 'number' ||
    lastLen >= 50; // PAGE_SIZE_HINT matches the BE limit default of 50

  return {
    data,
    isLoading: query.isLoading,
    isFetchingOlder: fetchOlderMutation.isPending,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: query.refetch,
    hasOlder,
    fetchOlder: async () => {
      if (!chatId) return;
      if (fetchOlderMutation.isPending) return;
      await fetchOlderMutation.mutateAsync({ chatId });
    },
  };
}