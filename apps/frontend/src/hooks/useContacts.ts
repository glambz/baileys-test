import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { ContactSchema } from '@/lib/contract';
import { z } from 'zod';
import type { Contact } from '@/types';

const ResponseSchema = z.object({ contacts: z.array(ContactSchema) });

/**
 * `useContacts()` — address-book list. Cached for the lifetime of the
 * app; invalidated manually when a contact is added (Phase 3+).
 */
export function useContacts() {
  const query = useQuery<Contact[]>({
    queryKey: ['contacts'],
    queryFn: async () => {
      const raw = await apiClient<unknown>('/contacts');
      const parsed = ResponseSchema.parse(raw);
      return parsed.contacts as Contact[];
    },
    staleTime: 5 * 60_000,
  });
  return { ...query, data: query.data ?? [] };
}