import { z } from 'zod';

/**
 * Zod schemas mirroring `docs/tech/chat-data-model.md` §2.
 *
 * Used at the API boundary (in `mockAskAi` and the future real fetch
 * client) to validate responses before they reach the React tree.
 */

// --- Chat ---
// BUG-AI-HUMAN-TOGGLE-NO-VISUAL-UPDATE fix (2026-07-16): the previous schema
// was incomplete — it dropped jid, phone, aiMode, lastMessagePreview,
// lastMessageAt, unreadCount because the BE returns them but the schema
// didn't validate for them. The AI-mode toggle refetched the new value but
// the parse stripped it (default zod behaviour). Now we accept the full FE
// shape the BE returns.
export const ChatSchema = z.object({
  id: z.string(),
  jid: z.string(),
  phone: z.string().optional(),
  aiMode: z.enum(['ai', 'human', 'human_pending_flag']).optional(),
  lastMessagePreview: z.string(),
  lastMessageAt: z.number(),
  unreadCount: z.number(),
  pinned: z.boolean().optional(),
  muted: z.boolean().optional(),
  archived: z.boolean().optional(),
});
export type ChatDto = z.infer<typeof ChatSchema>;

export const ChatListSchema = z.object({ chats: z.array(ChatSchema) });

// --- Message ---
export const MessageKeySchema = z.object({
  remoteJid: z.string(),
  fromMe: z.boolean(),
  senderPn: z.string().optional(),
  participantPn: z.string().optional(),
});

export const MessageSchema = z.object({
  id: z.string(),
  chatId: z.string(),
  direction: z.enum(['in', 'out']),
  key: MessageKeySchema,
  senderName: z.string().nullable(),
  body: z.string().nullable(),
  kind: z.enum(['text', 'image', 'video', 'document', 'audio', 'sticker', 'unknown']),
  caption: z.string().nullable().optional(),
  mime: z.string().nullable().optional(),
  timestamp: z.number(),
  isFallback: z.boolean().optional(), // NEW (2026-07-16) — outbound message that flagged the chat as needing human help
});
export type MessageDto = z.infer<typeof MessageSchema>;

export const MessageListSchema = z.object({
  chatId: z.string(),
  messages: z.array(MessageSchema),
  nextBefore: z.number().optional(),
});

// --- Contact ---
export const ContactSchema = z.object({
  id: z.string(),
  phone: z.string(),
  displayName: z.string(),
  groupName: z.string().nullable().optional(),
  lid: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
  updatedAt: z.number(),
});

// --- KnowledgeEntry ---
export const KnowledgeEntrySchema = z.object({
  id: z.string(),
  question: z.string(),
  answer: z.string(),
  tags: z.array(z.string()).optional(),
  source: z.string(),
  sourceUrl: z.string().nullable().optional(),
  updatedAt: z.number(),
});

// --- AiAnswer / FallbackAiAnswer ---
export const EvidenceSchema = z.object({
  entryId: z.string(),
  excerpt: z.string(),
  source: z.string(),
  sourceUrl: z.string().nullable().optional(),
  confidence: z.number(),
});

export const AiAnswerSchema = z.object({
  kind: z.literal('answered'),
  answer: z.string(),
  confidence: z.number(),
  evidence: z.array(EvidenceSchema),
  generatedAt: z.number(),
  question: z.string(),
});

export const FallbackAiAnswerSchema = z.object({
  kind: z.literal('fallback'),
  message: z.string(),
  suggestion: z
    .object({
      entryId: z.string(),
      question: z.string(),
      source: z.string(),
    })
    .optional(),
  rejectedCandidates: z.array(z.object({ entryId: z.string(), confidence: z.number() })).optional(),
});

// --- AuthStatus ---
// The BE returns { state, connected, user, lastError, reconnectAttempts }.
// The FE keeps its canonical shape (userJid/userName) and accepts the
// BE's `user: { id, name }` as a fallback so both wire shapes parse.
export const AuthStatusSchema = z
  .object({
    state: z.string(),
    connected: z.boolean().optional(),
    userJid: z.string().nullable().optional(),
    userName: z.string().nullable().optional(),
    user: z
      .object({
        id: z.string(),
        name: z.string().optional(),
      })
      .nullable()
      .optional(),
    lastUpdatedAt: z.number().nullable().optional(),
  })
  .transform((raw) => ({
    connected: raw.connected ?? (raw.user !== null && raw.user !== undefined),
    state: raw.state,
    userJid: raw.userJid ?? raw.user?.id ?? null,
    userName: raw.userName ?? raw.user?.name ?? null,
    lastUpdatedAt: raw.lastUpdatedAt ?? Math.floor(Date.now() / 1000),
  }));

// --- CrmChatsModes (GET /api/crm/chats/modes) ---
// Per-chat AI reply mode. The BE maps `chatId -> AIReplyMode`.
export const CrmChatsModesSchema = z.object({
  modes: z.record(z.string(), z.enum(['ai', 'human', 'human_pending_flag'])),
});
export type CrmChatsModesDto = z.infer<typeof CrmChatsModesSchema>;

// --- Handoff context (GET /api/crm/ai/handoff?chatId=...) ---
// Returned only when the chat is in `human_pending_flag` mode. 404 otherwise.
export const HandoffMessageSchema = z.object({
  id: z.string(),
  direction: z.enum(['in', 'out']),
  body: z.string().nullable(),
  timestamp: z.number(),
  senderName: z.string().nullable().optional(),
});

/**
 * Agent-facing escalation briefing, generated at the moment of escalation.
 * Mirrors the BE's `src/ai/settings/escalation.js` output.
 *
 * Distinct from `conversationSummary`, which is a running digest refreshed
 * at most once per 10 minutes and can be empty or stale at handoff time.
 *
 * Every field is optional: the BE stores a degraded briefing (built from
 * locally-known facts) when the LLM is unavailable, so the panel renders
 * whatever is present rather than failing to parse.
 */
export const EscalationBriefingSchema = z.object({
  headline: z.string().optional(),
  customer_wants: z.string().optional(),
  ai_attempted: z.string().optional(),
  blocking_gap: z.string().optional(),
  suggested_next_action: z.string().optional(),
  sentiment: z.enum(['neutral', 'frustrated', 'urgent']).catch('neutral').optional(),
  reason: z.string().nullable().optional(),
  confidence: z.number().nullable().optional(),
  ai_reasoning: z.string().nullable().optional(),
  degraded: z.boolean().optional(),
});
export type EscalationBriefingDto = z.infer<typeof EscalationBriefingSchema>;

export const HandoffContextSchema = z.object({
  chatId: z.string(),
  aiMode: z.string(),
  phone: z.string().nullable().optional(),
  lastMessageAt: z.number().optional(),
  flagReason: z.string(),
  flagReasonLabel: z.string(),
  conversationSummary: z.string(),
  summaryUpdatedAt: z.number().optional(),
  lastMessages: z.array(HandoffMessageSchema),
  // Optional so the FE keeps working against a BE that predates migration 013.
  escalationBriefing: EscalationBriefingSchema.nullable().optional(),
  escalationReason: z.string().nullable().optional(),
  escalationAt: z.number().optional(),
});
export type HandoffContextDto = z.infer<typeof HandoffContextSchema>;

// --- AiSettings (per-tenant) ---
// Mirrors `frontend/src/types/aiSettings.ts -> AiSettings`. Used by the BE
// integration paths that hydrate `useAiSettingsStore` from a real `GET /api/crm/ai/settings`
// response. The BE persists fields as snake_case (e.g. `confidence_threshold`,
// `fallback_enabled`, `whatsapp_personality`); the FE uses camelCase. The
// `.transform()` below coerces both shapes into the FE form before the data
// reaches the store, so consumers can read `settings.fallbackEnabled` directly
// regardless of which side produced the row.
const AiWhatsappAutoReplyWireSchema = z
  .object({
    enabled: z.boolean().optional(),
    confidence_threshold: z.number().optional(),
  })
  .transform((raw) => ({
    enabled: raw.enabled !== false,
    confidenceThreshold:
      typeof raw.confidence_threshold === 'number' ? raw.confidence_threshold : 0.7,
  }));

export const AiSettingsSchema = z
  .object({
    identity: z
      .object({
        name: z.string(),
        role: z.string(),
        description: z.string().optional(),
        greeting: z.string().optional(),
        closing: z.string().optional(),
      })
      .passthrough(),
    tone: z.string().optional(),
    language: z.string().optional(),
    scope: z
      .object({
        topics: z.array(z.string()).optional(),
        excludedTopics: z.array(z.string()).optional(),
        excluded_topics: z.array(z.string()).optional(),
        bannedPhrases: z.array(z.string()).optional(),
        banned_phrases: z.array(z.string()).optional(),
      })
      .passthrough(),
    rules: z.array(z.string()).optional(),
    // Either camelCase (FE) or snake_case (BE) keys accepted on the wire.
    whatsappAutoReply: AiWhatsappAutoReplyWireSchema.optional(),
    whatsapp_auto_reply: AiWhatsappAutoReplyWireSchema.optional(),
    // `fallbackEnabled` (FE) and `fallback_enabled` (BE) both coerce to a
    // boolean; missing values default to `true` (the safe CS behavior).
    fallbackEnabled: z.boolean().optional(),
    fallback_enabled: z.boolean().optional(),
    whatsappPersonality: z.string().optional(),
    whatsapp_personality: z.string().optional(),
    chatPersonality: z.string().optional(),
    chat_personality: z.string().optional(),
    updatedAt: z.string().optional(),
    updated_at: z.string().optional(),
  })
  .passthrough()
  .transform((raw) => {
    const autoReply =
      raw.whatsappAutoReply ?? raw.whatsapp_auto_reply ?? { enabled: true, confidenceThreshold: 0.7 };
    const fallback =
      typeof raw.fallbackEnabled === 'boolean'
        ? raw.fallbackEnabled
        : typeof raw.fallback_enabled === 'boolean'
          ? raw.fallback_enabled
          : true;
    return {
      identity: raw.identity,
      tone: (raw.tone ?? 'friendly') as never,
      language: (raw.language ?? 'id') as never,
      scope: {
        topics: raw.scope?.topics ?? [],
        excludedTopics: raw.scope?.excludedTopics ?? raw.scope?.excluded_topics ?? [],
      },
      rules: raw.rules ?? [],
      whatsappAutoReply: autoReply,
      fallbackEnabled: fallback,
      whatsappPersonality: (raw.whatsappPersonality ?? raw.whatsapp_personality ?? 'friendly-polite') as never,
      chatPersonality: (raw.chatPersonality ?? raw.chat_personality ?? 'professional') as never,
      updatedAt: raw.updatedAt ?? raw.updated_at ?? new Date().toISOString(),
    };
  });
export type AiSettingsDto = z.infer<typeof AiSettingsSchema>;