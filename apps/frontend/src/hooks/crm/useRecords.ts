import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { z } from 'zod';
import type { CrmRecord } from '@/types/crm';

const RecordSchema = z.object({
  id: z.string(),
  entityId: z.string(),
  entityName: z.string(),
  contactId: z.string().nullable().optional(),
  data: z.record(z.unknown()),
  createdAt: z.number(),
  updatedAt: z.number(),
  createdBy: z.string().optional(),
}) as unknown as z.ZodType<CrmRecord>;

const ListResponse = z.object({
  records: z.array(RecordSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

export interface UseRecordsOptions {
  limit?: number;
  offset?: number;
  q?: string;
  sort?: string;
}

export function useRecords(entityName: string | undefined, opts: UseRecordsOptions = {}) {
  const { limit = 25, offset = 0, q, sort = 'updatedAt:desc' } = opts;
  return useQuery<{ records: CrmRecord[]; total: number }>({
    queryKey: ['crm', 'records', entityName, limit, offset, q ?? '', sort],
    enabled: Boolean(entityName),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(offset));
      if (q) params.set('q', q);
      if (sort) params.set('sort', sort);
      const raw = await apiClient<unknown>(
        `/crm/entities/${encodeURIComponent(entityName ?? '')}/records?${params.toString()}`
      );
      const parsed = ListResponse.parse(raw);
      return { records: parsed.records as CrmRecord[], total: parsed.total };
    },
  });
}

export function useCreateRecord(entityName: string) {
  const qc = useQueryClient();
  return useMutation<CrmRecord, Error, { data: Record<string, unknown>; contactId?: string | null }>({
    mutationFn: async (body) => {
      const raw = await apiClient<unknown>(
        `/crm/entities/${encodeURIComponent(entityName)}/records`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        }
      );
      return RecordSchema.parse(raw) as CrmRecord;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['crm', 'records'] });
    },
  });
}

export function useUpdateRecord() {
  const qc = useQueryClient();
  return useMutation<CrmRecord, Error, { id: string; data: Record<string, unknown> }>({
    mutationFn: async ({ id, data }) => {
      const raw = await apiClient<unknown>(`/crm/records/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ data }),
      });
      return RecordSchema.parse(raw) as CrmRecord;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['crm', 'records'] });
    },
  });
}

export function useDeleteRecord() {
  const qc = useQueryClient();
  return useMutation<void, Error, { id: string }>({
    mutationFn: async ({ id }) => {
      await apiClient<unknown>(`/crm/records/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['crm', 'records'] });
    },
  });
}
