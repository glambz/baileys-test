import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { z } from 'zod';
import type { KnowledgeFile } from '@/types/crm';

/**
 * Normalise a timestamp to epoch SECONDS, which is what `KnowledgeFile`
 * declares and what the page renders with `dayjs.unix()`.
 *
 * The real backend sends ISO strings (`created_at` straight out of Postgres)
 * while the mock layer sends epoch seconds. Feeding an ISO string to
 * dayjs.unix() rendered every row's Uploaded column as "Invalid Date".
 * Milliseconds are tolerated too, since that is the other shape a JS
 * backend tends to emit.
 */
function toEpochSeconds(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null;
    // Anything past ~5138-11-16 in seconds is really milliseconds.
    return v > 1e11 ? Math.floor(v / 1000) : Math.floor(v);
  }
  const parsed = Date.parse(String(v));
  return Number.isNaN(parsed) ? null : Math.floor(parsed / 1000);
}

/**
 * The wire shape, kept deliberately loose, then transformed into the
 * canonical `KnowledgeFile`. This used to be a narrow object cast with
 * `as unknown as z.ZodType<KnowledgeFile>` — the cast asserted a shape the
 * data did not have, which is what let three separate mismatches through:
 * the status vocabulary, ISO-vs-epoch timestamps, and lastError vs
 * errorMessage.
 */
const FileWireSchema = z.object({
  id: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  size: z.number(),
  // Left as a string rather than an enum so a status the FE has not been
  // taught about degrades to an unknown chip instead of failing the parse
  // and blanking the page. StatusChip resolves it with a fallback.
  status: z.string(),
  chunksCount: z.number(),
  ingestedAt: z.union([z.number(), z.string(), z.null()]).optional(),
  // The BE column is `last_error` and the route serialises it as `lastError`;
  // the FE calls it `errorMessage`. Accept both so the failure tooltip
  // actually receives the message.
  errorMessage: z.string().nullable().optional(),
  lastError: z.string().nullable().optional(),
  entityId: z.string().nullable().optional(),
  uploadedAt: z.union([z.number(), z.string(), z.null()]).optional(),
});

const FileSchema = FileWireSchema.transform(
  (raw): KnowledgeFile => ({
    id: raw.id,
    filename: raw.filename,
    mimeType: raw.mimeType,
    size: raw.size,
    status: raw.status as KnowledgeFile['status'],
    chunksCount: raw.chunksCount,
    ingestedAt: toEpochSeconds(raw.ingestedAt),
    errorMessage: raw.errorMessage ?? raw.lastError ?? null,
    entityId: raw.entityId ?? null,
    // 0 means "unknown"; the page renders a dash rather than 1970.
    uploadedAt: toEpochSeconds(raw.uploadedAt) ?? 0,
  })
);

const ListResponse = z.object({ files: z.array(FileSchema) });

export function useKnowledgeFiles(entityId?: string) {
  return useQuery<KnowledgeFile[]>({
    queryKey: ['crm', 'knowledge', entityId ?? 'all'],
    queryFn: async () => {
      const url = entityId
        ? `/crm/knowledge/files?entityId=${encodeURIComponent(entityId)}`
        : `/crm/knowledge/files`;
      const raw = await apiClient<unknown>(url);
      return ListResponse.parse(raw).files;
    },
  });
}

export function useUploadKnowledgeFile() {
  const qc = useQueryClient();
  return useMutation<KnowledgeFile, Error, Partial<KnowledgeFile> & { filename: string; mimeType: string; size: number }>({
    mutationFn: async (body) => {
      const raw = await apiClient<unknown>('/crm/knowledge/files', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const resp = z.object({ file: FileSchema }).parse(raw);
      return resp.file;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['crm', 'knowledge'] });
    },
  });
}

export function useDeleteKnowledgeFile() {
  const qc = useQueryClient();
  return useMutation<void, Error, { id: string }>({
    mutationFn: async ({ id }) => {
      await apiClient<unknown>(`/crm/knowledge/files/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['crm', 'knowledge'] });
    },
  });
}

export function useReEmbedKnowledgeFile() {
  const qc = useQueryClient();
  return useMutation<KnowledgeFile, Error, { id: string }>({
    mutationFn: async ({ id }) => {
      const raw = await apiClient<unknown>(
        `/crm/knowledge/files/${encodeURIComponent(id)}/reembed`,
        { method: 'POST' }
      );
      return FileSchema.parse(raw) as KnowledgeFile;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['crm', 'knowledge'] });
    },
  });
}
