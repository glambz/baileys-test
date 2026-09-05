import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { AiAnswerSchema, FallbackAiAnswerSchema } from '@/lib/contract';
import { AI_CONFIDENCE_THRESHOLD } from '@/lib/config';
import { AI_FALLBACK_MESSAGE_ID } from '@/lib/ai/fallbackMessage';
import type { AskAiResponse } from '@/types';

export interface AskAiInput {
  question: string;
  topK?: number;
}

export interface UseAskAiResult {
  mutate: (input: AskAiInput) => void;
  mutateAsync: (input: AskAiInput) => Promise<AskAiResponse>;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  data: AskAiResponse | undefined;
}

/**
 * `useAskAi()` — calls POST /api/crm/ai/ask. Enforces the no-hallucination
 * guard: any `kind: "answered"` response whose `confidence <
 * AI_CONFIDENCE_THRESHOLD` is downgraded to a FallbackAiAnswer (see
 * `docs/frontend/features/ai-chat/spec.md` §7).
 *
 * Note: prior versions called `/api/ai/ask` (404). The real BE exposes
 * this under `/api/crm/ai/ask` per `src/ai/routes/ai.js:14`.
 */
export function useAskAi(): UseAskAiResult {
  const mutation = useMutation<AskAiResponse, Error, AskAiInput>({
    mutationFn: async (input) => {
      const raw = await apiClient<unknown>('/crm/ai/ask', {
        method: 'POST',
        body: JSON.stringify({ question: input.question, topK: input.topK ?? 3 }),
      });

      // Validate the discriminator first.
      const probe = raw as { kind?: string };
      if (probe?.kind === 'answered') {
        const parsed = AiAnswerSchema.parse(raw);
        if (parsed.confidence < AI_CONFIDENCE_THRESHOLD) {
          return downgradeToFallback();
        }
        return parsed;
      }
      if (probe?.kind === 'fallback') {
        return FallbackAiAnswerSchema.parse(raw);
      }
      throw new Error('Unexpected response shape from /api/ai/ask');
    },
  });

  return {
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
    data: mutation.data,
  };
}

function downgradeToFallback(): AskAiResponse {
  return {
    kind: 'fallback',
    message: AI_FALLBACK_MESSAGE_ID,
  };
}