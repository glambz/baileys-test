import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { z } from 'zod';
import type { KnowledgeFile } from '@/types/crm';

const FileSchema = z.object({
  id: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  size: z.number(),
  // The BE's knowledge_files.status CHECK includes 'queued','indexed','failed'.
  // The FE's previous enum omitted 'indexed' (the success state!) — every
  // indexed file threw a zod parse error.
  status: z.string(),
  chunksCount: z.number(),
  ingestedAt: z.union([z.number(), z.string(), z.null()]).optional(),
  errorMessage: z.string().nullable().optional(),
  entityId: z.string().nullable().optional(),
  uploadedAt: z.union([z.number(), z.string()]).optional(),
}) as unknown as z.ZodType<KnowledgeFile>;

const ListResponse = z.object({ files: z.array(FileSchema) });

export function useKnowledgeFiles(entityId?: string) {
  return useQuery<KnowledgeFile[]>({
    queryKey: ['crm', 'knowledge', entityId ?? 'all'],
    queryFn: async () => {
      const url = entityId
        ? `/crm/knowledge/files?entityId=${encodeURIComponent(entityId)}`
        : `/crm/knowledge/files`;
      const raw = await apiClient<unknown>(url);
      return ListResponse.parse(raw).files as KnowledgeFile[];
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
      return resp.file as KnowledgeFile;
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
