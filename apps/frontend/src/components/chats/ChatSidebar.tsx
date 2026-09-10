import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { ChatListItem } from './ChatListItem';
import { useChats } from '@/hooks/useChats';
import { useContacts } from '@/hooks/useContacts';
import { useUiStore } from '@/stores/ui';
import { MessageSquareText, RefreshCw, WifiOff, X } from 'lucide-react';
import type { Chat } from '@/types';

/**
 * Sidebar list of conversations. Sorts pinned-first, then unread, then
 * lastMessageAt DESC. Includes a search box (Plan 08).
 *
 * v5: Pane 2 is now permanently visible at every viewport width —
 * no mobile drawer, no close-X button.
 * The rail is icon-only (`w-16`) and Pane 2 sits beside it horizontally
 * so all three panes stay side-by-side even on narrow screens.
 */
export function ChatSidebar() {
  const { chatId } = useParams<{ chatId: string }>();
  const chatsQuery = useChats();
  const contactsQuery = useContacts();
  const showArchived = useUiStore((s) => s.showArchived);
  const [offline, setOffline] = useState(
    typeof navigator !== 'undefined' && navigator.onLine === false
  );
  const [query, setQuery] = useState('');

  useEffect(() => {
    const goOnline = () => setOffline(false);
    const goOffline = () => setOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const sorted = useMemo(() => {
    const list = chatsQuery.data;
    const filtered = list.filter((c: Chat) => (showArchived ? true : !c.archived));
    if (query.trim().length > 0) {
      const q = query.toLowerCase();
      return filtered
        .filter((c) => c.lastMessagePreview.toLowerCase().includes(q))
        .sort((a, b) => {
          if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
          return b.lastMessageAt - a.lastMessageAt;
        });
    }
    return filtered.sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
      const aUnread = a.unreadCount > 0 ? 1 : 0;
      const bUnread = b.unreadCount > 0 ? 1 : 0;
      if (aUnread !== bUnread) return bUnread - aUnread;
      return b.lastMessageAt - a.lastMessageAt;
    });
  }, [chatsQuery.data, showArchived, query]);

  return (
    <aside
      className="flex h-full min-h-0 w-80 shrink-0 flex-col border-r bg-background"
      aria-label="Daftar percakapan"
    >
      <div className="flex items-center gap-2 border-b p-2">
        <Input
          type="search"
          placeholder="Cari percakapan…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          data-shortcut="sidebar-search"
          aria-label="Cari percakapan"
          className="flex-1"
        />
      </div>

      {chatsQuery.isFetching && !chatsQuery.isLoading && (
        <Progress className="h-[2px]" value={60} aria-label="Menyegarkan" />
      )}

      {offline && (
        <div
          className="flex items-center gap-2 bg-amber-100 px-3 py-2 text-xs text-amber-900 dark:bg-amber-900/30 dark:text-amber-100"
          role="status"
        >
          <WifiOff className="h-4 w-4" aria-hidden />
          Tidak ada koneksi — menampilkan data terakhir yang di-cache.
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {chatsQuery.isLoading ? (
          <SidebarSkeleton />
        ) : chatsQuery.isError ? (
          <SidebarError
            message={(chatsQuery.error as Error | null)?.message ?? 'Tidak dapat memuat percakapan'}
            onRetry={() => void chatsQuery.refetch()}
          />
        ) : sorted.length === 0 ? (
          <SidebarEmpty />
        ) : (
          <ul role="list" className="divide-y divide-border/50">
            {sorted.map((chat) => (
              <li key={chat.id}>
                <ChatListItem
                  chat={chat}
                  contacts={contactsQuery.data}
                  isActive={chat.id === chatId}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function SidebarSkeleton() {
  return (
    <div className="space-y-px py-1">
      {Array.from({ length: 6 }).map((_, idx) => (
        <div key={idx} className="flex h-14 items-center gap-3 px-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SidebarEmpty() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-12 text-center text-sm text-muted-foreground">
      <MessageSquareText className="h-10 w-10 opacity-40" aria-hidden />
      <p className="font-medium text-foreground">Belum ada percakapan</p>
      <p>Saat ini belum ada chat yang bisa ditampilkan.</p>
    </div>
  );
}

function SidebarError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex h-full items-center justify-center p-4">
      <Card className="w-full max-w-sm border-destructive/40 bg-destructive/5 p-4">
        <p className="text-sm font-medium text-destructive">{message}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={onRetry}
        >
          <RefreshCw className="mr-2 h-4 w-4" /> Coba lagi
        </Button>
      </Card>
    </div>
  );
}

// Keep an unused export to satisfy downstream references.
export const SidebarCloseIcon = X;