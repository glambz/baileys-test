import { useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { apiClient } from '@/lib/apiClient';
import { MessageSchema } from '@/lib/contract';
import { z } from 'zod';
import type { Message } from '@/types';

const ResponseSchema = z.object({ message: MessageSchema });

// BUG-CHAT-CACHE-SHAPE-MISMATCH fix (2026-07-22): useSendMessage.ts and
// useMessages.ts both read/write the SAME query cache key
// ('messages', chatId), but with different shapes:
//   - useMessages.ts treated it as `{ messages: Message[] }`
//   - useSendMessage.ts treated it as `Message[]`
// When the cache was seeded by useMessages as an object, the updater in
// useSendMessage would receive `{ messages: [...] }` as `old`, then try
// `[...old]` and throw `(old ?? []) is not iterable`. Align both sides
// to the same envelope.
type MessagesEnvelope = { messages: Message[] } | undefined;

export interface SendMessageInput {
  body: string;
}

/**
 * `useSendMessage(chatId)` — optimistic insert → server replace →
 * rollback on error. The optimistic id format is
 * `optimistic-<uuid>` per `docs/frontend/features/chats/spec.md` §5.
 */
export function useSendMessage(chatId: string) {
  const qc = useQueryClient();

  return useMutation<Message, Error, SendMessageInput, { previous: MessagesEnvelope }>({
    mutationFn: async ({ body }) => {
      const raw = await apiClient<unknown>(`/chats/${encodeURIComponent(chatId)}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      });
      return ResponseSchema.parse(raw).message as Message;
    },

    onMutate: async ({ body }) => {
      await qc.cancelQueries({ queryKey: ['messages', chatId] });
      const previous = qc.getQueryData<MessagesEnvelope>(['messages', chatId]);

      const optimisticId = `optimistic-${crypto.randomUUID()}`;
      const optimistic: Message = {
        id: optimisticId,
        chatId,
        direction: 'out',
        key: { remoteJid: 'unknown@s.whatsapp.net', fromMe: true },
        senderName: null,
        body,
        kind: 'text',
        caption: null,
        mime: null,
        timestamp: dayjs().unix(),
      };

      qc.setQueryData<MessagesEnvelope>(['messages', chatId], (old) => {
        const list = old?.messages ?? [];
        return { messages: [...list, optimistic] };
      });

      return { previous };
    },

    onError: (_err, _input, context) => {
      if (context?.previous) {
        qc.setQueryData(['messages', chatId], context.previous);
      }
    },

    onSuccess: (serverMsg) => {
      qc.setQueryData<MessagesEnvelope>(['messages', chatId], (old) => {
        const list = old?.messages ?? [];
        const next = list.map((m) => (m.id.startsWith('optimistic-') ? serverMsg : m));
        if (!next.some((m) => m.id === serverMsg.id)) next.push(serverMsg);
        return { messages: next };
      });
      // BUG-CHAT-UX-FIX-3 fix (2026-07-16): invalidate the messages query
      // too so the canonical list is refetched (and matches the BE).
      // Belt-and-braces with the optimistic write; harmless on duplicate.
      void qc.invalidateQueries({ queryKey: ['messages', chatId] });
      // Bump the sidebar preview/lastMessageAt.
      void qc.invalidateQueries({ queryKey: ['chats'] });
    },
  });
}