import { useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { apiClient } from '@/lib/apiClient';
import { MessageSchema } from '@/lib/contract';
import { z } from 'zod';
import type { Message } from '@/types';

/**
 * useSendWhatsAppMessage(chatId, phone) — POST /api/messages/send
 *
 * BUG-KIRIM-NOT-THROUGH-WHATSAPP fix (2026-07-23): the Composer was
 * wired to useSendMessage (the local DB-insert hook). That writes the
 * message to the messages table but does NOT push it through Baileys,
 * so the contact never sees the message. The user reported the kirim
 * button "still didn't send the message through WhatsApp".
 *
 * The real send endpoint is POST /api/messages/send with body
 * `{ phone: "<E.164 digits>", message: "<text>" }`. The response is
 * { ok, data: { messageId, to, text, timestamp } }, NOT { message: {...} }.
 *
 * phone derivation: the parent chat object (from useChats()) has the
 * canonical `phone` field. The Composer receives `chatId` (a JID) plus
 * the full chat object so it can pass phone through.
 */
export interface SendWhatsAppInput {
  phone: string;
  message: string;
}

interface SendResponse {
  success?: boolean;
  ok?: boolean;
  data?: {
    messageId: string;
    to: string;
    text: string;
    timestamp: number | string;
  };
}

export function useSendWhatsAppMessage() {
  const qc = useQueryClient();

  return useMutation<SendResponse, Error, SendWhatsAppInput, SendContext>({
    mutationFn: async ({ phone, message }) => {
      // Strip the '+' if present; BE expects bare E.164 digits.
      const barePhone = phone.replace(/^\+/, '').replace(/\D/g, '');
      return apiClient<SendResponse>('/messages/send', {
        method: 'POST',
        body: JSON.stringify({ phone: barePhone, message }),
      });
    },

    // BUG-PUSH-EVENTS feature (2026-08-03): the user picked
    // "optimistic + SSE replace". Insert the message locally with an
    // `optimistic-<uuid>` id so it appears instantly, then the SSE
    // `message.created` event (via useChatEvents) replaces the
    // optimistic entry with the canonical BE-assigned id.
    onMutate: async ({ phone, message }): Promise<SendContext> => {
      const chatId = await deriveChatIdFromPhone(qc, phone);
      if (!chatId) return { chatId: null };
      const optimisticId = `optimistic-${crypto.randomUUID()}`;
      const optimistic: Message = {
        id: optimisticId,
        chatId,
        direction: 'out',
        key: { remoteJid: chatId, fromMe: true },
        senderName: null,
        body: message,
        kind: 'text',
        caption: null,
        mime: null,
        timestamp: dayjs().unix(),
      };
      qc.setQueryData<MessagesEnvelope>(['messages', chatId], (old) => ({
        messages: [...(old?.messages ?? []), optimistic],
      }));
      return { optimisticId, chatId };
    },

    onSuccess: () => {
      // The SSE event will replace the optimistic entry. Force a
      // refetch as a belt-and-braces fallback in case the SSE event
      // doesn't arrive (e.g. the FE tab is backgrounded).
      void qc.invalidateQueries({ queryKey: ['chats'] });
    },

    onError: (_err, _input, context) => {
      // Rollback the optimistic insert on error.
      if (!context?.optimisticId || !context?.chatId) return;
      qc.setQueryData<MessagesEnvelope>(['messages', context.chatId], (old) => {
        const list = (old?.messages ?? []).filter((m) => m.id !== context.optimisticId);
        return { messages: list };
      });
    },
  });
}

/**
 * Resolve chatId from the phone number by looking at the chats cache.
 * The phone -> chatId mapping is stored in the chats array keyed by id.
 */
async function deriveChatIdFromPhone(qc: ReturnType<typeof useQueryClient>, phone: string): Promise<string | null> {
  const chats = qc.getQueryData<{ id: string; phone: string }[]>(['chats']) ?? [];
  const bare = phone.replace(/^\+/, '').replace(/\D/g, '');
  const match = chats.find((c) => (c.phone || '').replace(/^\+/, '').replace(/\D/g, '') === bare);
  return match?.id ?? null;
}

type SendContext = { chatId: string | null; optimisticId?: string };

/**
 * useSendMessage — kept for the local-DB-insert path (no Baileys send).
 * Used by code that wants to record an outbound without going through
 * WhatsApp (e.g. moderator message drafts).
 */
type MessagesEnvelope = { messages: Message[] } | undefined;

export interface SendMessageInput {
  body: string;
}

const ResponseSchema = z.object({ message: MessageSchema });

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
      if (context?.previous) qc.setQueryData(['messages', chatId], context.previous);
    },
    onSuccess: (serverMsg) => {
      qc.setQueryData<MessagesEnvelope>(['messages', chatId], (old) => {
        const list = old?.messages ?? [];
        const next = list.map((m) => (m.id.startsWith('optimistic-') ? serverMsg : m));
        if (!next.some((m) => m.id === serverMsg.id)) next.push(serverMsg);
        return { messages: next };
      });
      void qc.invalidateQueries({ queryKey: ['messages', chatId] });
      void qc.invalidateQueries({ queryKey: ['chats'] });
    },
  });
}