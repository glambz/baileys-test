import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { ChatListSchema } from '@/lib/contract';
import type { Chat } from '@/types';

const ResponseSchema = ChatListSchema;

/**
 * `useChats()` — list chats. Reads from `GET /api/chats` via the
 * mock interceptor. Returns `data ?? []` so consumers never deal with
 * `undefined`.
 */
export function useChats() {
  const query = useQuery<Chat[]>({
    queryKey: ['chats'],
    queryFn: async () => {
      const raw = await apiClient<unknown>('/chats');
      const parsed = ResponseSchema.parse(raw);
      return parsed.chats as Chat[];
    },
  });
  return { ...query, data: query.data ?? [] };
}