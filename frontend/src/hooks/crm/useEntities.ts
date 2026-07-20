import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { EntityDefinition } from '@/types/crm';
import { z } from 'zod';

const EntitySchema = z.object({
  id: z.string(),
  name: z.string(),
  label: z.string(),
  icon: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  schemaJson: z.object({
    fields: z.array(z.unknown()),
    relations: z.array(z.unknown()),
  }),
  version: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
  archivedAt: z.number().nullable().optional(),
}) as unknown as z.ZodType<EntityDefinition>;

const ListResponse = z.object({ entities: z.array(EntitySchema) });

export function useEntities() {
  return useQuery<EntityDefinition[]>({
    queryKey: ['crm', 'entities'],
    queryFn: async () => {
      const raw = await apiClient<unknown>('/crm/entities');
      return ListResponse.parse(raw).entities as EntityDefinition[];
    },
  });
}

export function useEntityByName(name: string | undefined) {
  return useQuery<EntityDefinition>({
    queryKey: ['crm', 'entities', 'name', name],
    enabled: typeof name === 'string',
    queryFn: async () => {
      const raw = await apiClient<unknown>(`/crm/entities/${encodeURIComponent(name ?? '')}`);
      return EntitySchema.parse(raw) as EntityDefinition;
    },
  });
}

export function useCreateEntity() {
  const qc = useQueryClient();
  return useMutation<EntityDefinition, Error, Partial<EntityDefinition>>({
    mutationFn: async (body) => {
      const raw = await apiClient<unknown>('/crm/entities', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return EntitySchema.parse(raw) as EntityDefinition;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['crm', 'entities'] });
    },
  });
}

export function useUpdateEntity() {
  const qc = useQueryClient();
  return useMutation<EntityDefinition, Error, { id: string; patch: Partial<EntityDefinition> }>({
    mutationFn: async ({ id, patch }) => {
      const raw = await apiClient<unknown>(`/crm/entities/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      return EntitySchema.parse(raw) as EntityDefinition;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['crm', 'entities'] });
    },
  });
}

export function useArchiveEntity() {
  const qc = useQueryClient();
  return useMutation<void, Error, { id: string }>({
    mutationFn: async ({ id }) => {
      await apiClient<unknown>(`/crm/entities/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['crm', 'entities'] });
    },
  });
}
