import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import type { Message } from '@/types';

/**
 * BUG-PUSH-EVENTS feature (2026-08-03): subscribes to the BE's SSE
 * stream for the given chatId. Events the BE publishes:
 *   - message.created       new inbound or outbound message persisted
 *   - chat.mode.changed     ai_mode transition
 *   - chat.handoff          trigger flipped to human_pending_flag
 *
 * The hook merges message.created events into the messages cache so
 * the chat thread updates instantly without polling. The EventSource
 * API auto-reconnects on disconnect and replays the last event ID.
 */

const ChatModeEnum = z.enum(['ai', 'human', 'human_pending_flag']);

const MessageCreatedSchema = z.object({
  id: z.string(),
  chatId: z.string(),
  direction: z.enum(['in', 'out']),
  bodyLength: z.number(),
  timestamp: z.number(),
  senderName: z.string().nullable().optional(),
});

const ChatModeChangedSchema = z.object({
  chatId: z.string(),
  previousMode: ChatModeEnum,
  currentMode: ChatModeEnum,
  reason: z.string().nullable().optional(),
});

const ChatHandoffSchema = z.object({
  chatId: z.string(),
  reason: z.string().nullable().optional(),
});

const EventEnvelopeSchema = z.object({
  event: z.string(),
  data: z.unknown(),
  topic: z.string().optional(),
});

export function useChatEvents(chatId: string | null) {
  const qc = useQueryClient();
  const lastEventIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!chatId) return;
    const url = `/api/chats/${encodeURIComponent(chatId)}/events`;
    const es = new EventSource(url);

    es.onmessage = (e) => {
      try {
        if (e.lastEventId) lastEventIdRef.current = e.lastEventId;
        const env = EventEnvelopeSchema.parse(JSON.parse(e.data));
        if (env.event === 'message.created') {
          const msg = MessageCreatedSchema.parse(env.data);
          // Insert into the messages cache. The previous optimistic
          // insert (id starts with 'optimistic-') is dedup-replaced by the
          // canonical message from the BE.
          qc.setQueryData<{ messages: Message[] }>(['messages', chatId], (curr) => {
            const list = (curr?.messages ?? []).filter((m) => m.id !== msg.id);
            list.push({
              id: msg.id,
              chatId: msg.chatId,
              direction: msg.direction,
              body: null,
              key: { remoteJid: msg.chatId, fromMe: msg.direction === 'out' },
              senderName: msg.senderName ?? null,
              kind: 'text',
              caption: null,
              mime: null,
              timestamp: msg.timestamp,
              isFallback: false,
            });
            return { messages: list };
          });
        } else if (env.event === 'chat.mode.changed') {
          ChatModeChangedSchema.parse(env.data);
          void qc.invalidateQueries({ queryKey: ['crm', 'chats', 'modes'] });
        } else if (env.event === 'chat.handoff') {
          ChatHandoffSchema.parse(env.data);
          void qc.invalidateQueries({ queryKey: ['crm', 'chats', 'modes'] });
        }
      } catch (err) {
        console.error('SSE parse error', err);
      }
    };

    es.onerror = () => {
      // EventSource auto-reconnects with lastEventId. Nothing to do.
    };

    return () => {
      es.close();
    };
  }, [chatId, qc]);
}
