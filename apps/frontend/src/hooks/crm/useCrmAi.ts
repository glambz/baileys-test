import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { z } from 'zod';
import type { AIReplyMode, CrmAskAiResponse, CrmReplyPreview } from '@/types/crm';
import { HandoffContextSchema } from '@/lib/contract';
import type { HandoffContextDto } from '@/lib/contract';
import { useAiSettingsStore } from '@/stores/useAiSettingsStore';
import { buildSystemPrompt } from '@/lib/ai/systemPrompt';

const Answer: z.ZodType<Extract<CrmAskAiResponse, { kind: 'answered' }>> = z.object({
  kind: z.literal('answered'),
  answer: z.string(),
  confidence: z.number(),
  evidence: z.array(
    z.object({
      kind: z.string(),
      entryId: z.string().optional(),
      recordId: z.string().optional(),
      excerpt: z.string(),
      source: z.string(),
      contactId: z.string().nullable().optional(),
      confidence: z.number(),
    })
  ),
  generatedAt: z.number(),
  question: z.string(),
}) as z.ZodType<Extract<CrmAskAiResponse, { kind: 'answered' }>>;

const Fallback: z.ZodType<Extract<CrmAskAiResponse, { kind: 'fallback' }>> = z.object({
  kind: z.literal('fallback'),
  message: z.string(),
}) as z.ZodType<Extract<CrmAskAiResponse, { kind: 'fallback' }>>;

const ReplyPreviewSchema: z.ZodType<CrmReplyPreview> = z.object({
  answer: z.string(),
  confidence: z.number(),
  evidence: z.array(
    z.object({
      kind: z.string(),
      entryId: z.string().optional(),
      recordId: z.string().optional(),
      excerpt: z.string(),
      source: z.string(),
      contactId: z.string().nullable().optional(),
      confidence: z.number(),
    })
  ),
  would_send: z.boolean(),
  reason: z.string().nullable().optional(),
}) as z.ZodType<CrmReplyPreview>;

export function useAskAiTeam() {
  const settings = useAiSettingsStore((s) => s.settings);
  return useMutation<CrmAskAiResponse, Error, { question: string }>({
    mutationFn: async ({ question }) => {
      // Plan 13: read the per-tenant AI Settings, compose the
      // three-block system prompt (base + fragment + hardened), and
      // pass it through to the mock interceptor.
      // `'id-mod'` falls into the `'id'` base-prompt bucket at the
      // base-prompt level; the per-tenant fragment carries the
      // presentation flag for the LLM.
      const baseLanguage = settings.language === 'en' ? 'en' : 'id';
      const systemPrompt = buildSystemPrompt({
        tenantName: 'Baileys Studio',
        language: settings.language,
        settings,
      });
      const raw = await apiClient<unknown>('/crm/ai/ask', {
        method: 'POST',
        body: JSON.stringify({ question, systemPrompt, settings }),
        // Stash the resolved language hint on the request for the mock
        // handler (the mock already knows via `settings.language` but
        // this is the explicit test affordance).
        headers: { 'x-ai-base-language': baseLanguage },
      });
      const kind = (raw as { kind?: string }).kind;
      if (kind === 'answered') return Answer.parse(raw) as CrmAskAiResponse;
      if (kind === 'fallback') return Fallback.parse(raw) as CrmAskAiResponse;
      throw new Error('Unexpected response shape');
    },
  });
}

export function useToggleAiMode() {
  const qc = useQueryClient();
  return useMutation<{ chatId: string; mode: AIReplyMode }, Error, { chatId: string; mode: 'ai' | 'human' }>({
    mutationFn: async (body) => {
      const raw = await apiClient<unknown>('/crm/ai/toggle-mode', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return z.object({ chatId: z.string(), mode: z.string() }).parse(raw) as {
        chatId: string;
        mode: AIReplyMode;
      };
    },
    onSuccess: () => {
      // BUG-AI-HUMAN-TOGGLE-NO-VISUAL-UPDATE fix (2026-07-16): in addition
      // to invalidating the broader chat lists, invalidate the per-chat
      // modes map so ThreadHeader + ChatListItem (which read from
      // useChatAiModes() keyed by ['crm', 'chats', 'modes']) refetch
      // and pick up the new mode immediately.
      void qc.invalidateQueries({ queryKey: ['crm', 'chats'] });
      void qc.invalidateQueries({ queryKey: ['chats'] });
      void qc.invalidateQueries({ queryKey: ['crm', 'chats', 'modes'] });
    },
  });
}

export function useReplyPreview() {
  return useMutation<CrmReplyPreview, Error, { chatId: string; message: string }>({
    mutationFn: async ({ chatId, message }) => {
      const raw = await apiClient<unknown>('/crm/ai/reply-preview', {
        method: 'POST',
        body: JSON.stringify({ chatId, message }),
      });
      return ReplyPreviewSchema.parse(raw) as CrmReplyPreview;
    },
  });
}

export function useChatAiModes() {
  return useQuery<Record<string, AIReplyMode>>({
    queryKey: ['crm', 'chats', 'modes'],
    queryFn: async () => {
      const raw = await apiClient<unknown>('/crm/chats/modes');
      return z.object({ modes: z.record(z.string()) }).parse(raw).modes as Record<string, AIReplyMode>;
    },
    // BUG-AI-HUMAN-BANNER-NEEDS-REFRESH fix (2026-07-23): the modes
    // query was on-demand only, so when the BE trigger flipped a chat
    // to `human_pending_flag`, the FE didn't know until a manual
    // refresh. Poll every 5s + on window focus so the
    // SystemHumanHandoffBanner (driven by the modes query) shows up
    // immediately after the BE auto-flips the mode. Bump the interval
    // down a bit (was none → 3s) so operators see the flag within ~3s
    // of a turbo_cutoff or confidence_low.
    refetchInterval: 3000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
  });
}

/**
 * Fetch the handoff context for a chat in `human_pending_flag` mode.
 *
 * Returns `null` when the chat is no longer in handoff mode (the BE
 * returns 404 in that case — the operator toggled it back to `ai`).
 * Throws for any other error so React Query surfaces a retryable error.
 */
export function useHandoff(chatId: string | null) {
  return useQuery<HandoffContextDto | null>({
    queryKey: ['crm', 'ai', 'handoff', chatId],
    enabled: !!chatId,
    queryFn: async (): Promise<HandoffContextDto | null> => {
      if (!chatId) throw new Error('chatId required');
      const raw = await apiClient<unknown>(
        `/crm/ai/handoff?chatId=${encodeURIComponent(chatId)}`
      );
      if (raw === null || raw === undefined) return null;
      // Defensive: apiClient throws on non-2xx, but the mock / future
      // implementations may signal "no longer in handoff" with a 404-
      // like payload. Treat obvious 404 envelopes as null.
      const kind = (raw as { status?: number } | null)?.status;
      if (kind === 404) return null;
      return HandoffContextSchema.parse(raw);
    },
    staleTime: 30_000,
    retry: false,
  });
}
