/**
 * useAiHistory — server-backed history for the in-app AI chat.
 * Source: docs/specs/2026-08-18-in-app-ai-chat-polish.md
 *
 * Replaces the sessionStorage stub in `AiWorkspacePage.tsx`. Wraps
 * react-query so the UI gets loading/error states for free. Mutations
 * (add, remove) invalidate the list so the sidebar stays in sync.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { z } from 'zod';

const EvidenceSchema = z.array(z.any());
const EntrySchema = z.object({
  id: z.number(),
  question: z.string(),
  answer: z.string(),
  confidence: z.number(),
  kind: z.enum(['answered', 'fallback']),
  evidence: EvidenceSchema,
  createdAt: z.string(),
});
const ListSchema = z.object({ items: z.array(EntrySchema) });

export type AiHistoryEntry = z.infer<typeof EntrySchema>;
export type NewAiHistoryEntry = {
  question: string;
  answer: string;
  confidence: number;
  kind?: 'answered' | 'fallback';
  evidence?: unknown[];
};

export function useAiHistoryQuery() {
  return useQuery<AiHistoryEntry[]>({
    queryKey: ['ai-history'],
    queryFn: async () => {
      const raw = await apiClient<unknown>('/crm/ai/history');
      const parsed = ListSchema.parse(raw);
      return parsed.items;
    },
    staleTime: 30_000,
  });
}

export function useAiHistoryAdd() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entry: NewAiHistoryEntry) => {
      const raw = await apiClient<unknown>('/crm/ai/history', {
        method: 'POST',
        body: JSON.stringify(entry),
      });
      return EntrySchema.parse((raw as { entry: unknown }).entry);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-history'] });
    },
  });
}

export function useAiHistoryRemove() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await apiClient<unknown>(`/crm/ai/history/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-history'] });
    },
  });
}
