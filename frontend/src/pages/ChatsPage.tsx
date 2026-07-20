import { useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { History, MessagesSquare } from 'lucide-react';
import { ThreadHeader } from '@/components/chats/ThreadHeader';
import { MessageList } from '@/components/chats/MessageList';
import { Composer } from '@/components/chats/Composer';
import { useChats } from '@/hooks/useChats';
import { useContacts } from '@/hooks/useContacts';
import { useMessages } from '@/hooks/useMessages';
import { useUiStore } from '@/stores/ui';

/**
 * Pane-3 contents for the Chats menu — only the focused-thread
 * surface (header + list + composer). The chat list itself now lives
 * in `AppShell` (Pane 2) per `docs/crm/features/navigation/spec.md`.
 */
export default function ChatsPage() {
  const { chatId } = useParams<{ chatId: string }>();
  const navigate = useNavigate();
  const setLastOpenedChatId = useUiStore((s) => s.setLastOpenedChatId);
  const setMobileSidebarOpen = useUiStore((s) => s.setMobileSidebarOpen);
  const chatsQuery = useChats();
  const contactsQuery = useContacts();
  const messagesQuery = useMessages(chatId ?? null);

  useEffect(() => {
    if (chatId) setLastOpenedChatId(chatId);
  }, [chatId, setLastOpenedChatId]);

  // On mobile, picking a chat should hide the chat-list overlay so
  // the user sees the focused thread (Pane 3) instead of the drawer.
  useEffect(() => {
    if (chatId) setMobileSidebarOpen(false);
  }, [chatId, setMobileSidebarOpen]);

  useEffect(() => {
    if (!chatId) return;
    if (messagesQuery.isError) {
      const err = messagesQuery.error as Error & { code?: string } | null;
      if (err && (err.code === 'ChatNotFound' || /not found/i.test(err.message))) {
        toast.error('Chat tidak ditemukan');
        navigate('/chats', { replace: true });
      }
    }
  }, [chatId, messagesQuery.error, messagesQuery.isError, navigate]);

  const focusedChat = chatId ? chatsQuery.data.find((c) => c.id === chatId) : undefined;

  return (
    <section
      aria-label="Panel percakapan"
      className="flex flex-1 flex-col overflow-hidden"
    >
      {chatId && focusedChat ? (
        <>
          <ThreadHeader chat={focusedChat} contacts={contactsQuery.data} />
          <MessageList
            messages={messagesQuery.data}
            isLoading={messagesQuery.isLoading}
            isFetchingOlder={messagesQuery.isFetchingOlder}
            isError={messagesQuery.isError}
            hasOlder={messagesQuery.hasOlder}
            onRetry={() => messagesQuery.refetch()}
            onLoadOlder={() => { void messagesQuery.fetchOlder(); }}
          />
          <Composer chatId={focusedChat.id} />
        </>
      ) : (
        <EmptyThreadState />
      )}
    </section>
  );
}

function EmptyThreadState() {
  const lastOpenedChatId = useUiStore((s) => s.lastOpenedChatId);
  return (
    <div className="flex flex-1 items-center justify-center">
      <Card className="w-full max-w-md border-dashed">
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          <MessagesSquare className="h-10 w-10 text-muted-foreground" aria-hidden />
          <p className="font-medium">Pilih percakapan untuk mulai</p>
          {lastOpenedChatId && (
            <Button asChild variant="outline" size="sm">
              <Link to={`/chats/${encodeURIComponent(lastOpenedChatId)}`}>
                <History className="mr-2 h-4 w-4" aria-hidden />
                Buka chat terakhir
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
