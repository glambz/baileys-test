import { useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { History, MessagesSquare, HandHeart } from 'lucide-react';
import { ThreadHeader } from '@/components/chats/ThreadHeader';
import { MessageList } from '@/components/chats/MessageList';
import { Composer } from '@/components/chats/Composer';
import { useChats } from '@/hooks/useChats';
import { useContacts } from '@/hooks/useContacts';
import { useMessages } from '@/hooks/useMessages';
import { useChatAiModes } from '@/hooks/crm/useCrmAi';
import { useChatEvents } from '@/hooks/useChatEvents';
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
  const modesQuery = useChatAiModes();
  // BUG-PUSH-EVENTS feature (2026-08-03): subscribe to the BE's SSE
  // stream for the active chat. The hook merges message.created events
  // into the messages cache and invalidates the modes query on
  // chat.mode.changed / chat.handoff events.
  useChatEvents(chatId ?? null);

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

  // BUG-CHAT-AI-NO-REPLY-FEEDBACK (2026-07-22): derive the chat's current
  // mode from the modes map (the canonical source post-toggle fix), with
  // fallback to chat.aiMode. Compute whether the most recent message is
  // an inbound without an outbound reply after it — the visual cue that
  // "AI didn't reply to the latest user message" only matters when the
  // latest message is inbound.
  const chatMode =
    focusedChat?.aiMode ?? modesQuery.data?.[focusedChat?.id ?? ''] ?? 'ai';
  const lastMessageIsInbound =
    (messagesQuery.data?.[messagesQuery.data.length - 1]?.direction ?? '') ===
    'in';
  const lastInboundAt = (() => {
    const inbound = messagesQuery.data?.filter((m) => m.direction === 'in') ?? [];
    return inbound[inbound.length - 1]?.timestamp;
  })();

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
          {/* BUG-CHAT-AI-NO-REPLY-FEEDBACK fix (2026-07-22): when the
              chat is in human_pending_flag (the trigger held without
              sending an AI reply), surface a small system banner just
              above the composer so the user understands why the AI went
              silent — and is reminded to take over manually. */}
          {(chatMode === 'human_pending_flag' ||
            (chatMode !== 'ai' &&
              lastMessageIsInbound)) && (
            <SystemHumanHandoffBanner
              lastInboundAt={lastInboundAt}
              messages={messagesQuery.data ?? []}
            />
          )}
          <Composer chatId={focusedChat.id} phone={focusedChat.phone} />
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

/**
 * BUG-CHAT-AI-NO-REPLY-FEEDBACK (2026-07-22): small sticky banner
 * shown above the composer whenever the chat's last inbound has not
 * been answered by an outbound message. Tells the user explicitly
 * "AI tidak bisa jawab — silakan dijawab manual" instead of leaving
 * them confused by a silent chat.
 */
function SystemHumanHandoffBanner({
  lastInboundAt,
  messages,
}: {
  lastInboundAt?: number;
  messages: { direction: 'in' | 'out'; timestamp: number }[];
}) {
  const now = Math.floor(Date.now() / 1000);
  const ageMin = lastInboundAt ? Math.max(0, Math.round((now - lastInboundAt) / 60)) : null;
  return (
    <div
      className="border-t border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-2">
        <HandHeart className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div className="flex-1">
          <p className="font-medium">
            🤖 AI tidak bisa jawab dari knowledge DB — silakan dijawab manual.
          </p>
          <p className="mt-0.5 text-[11px] opacity-80">
            Chat ini butuh kamu jawab sendiri. Mode: human_pending_flag
            {ageMin !== null ? ` · pesan terakhir ${ageMin} menit lalu` : ''}
            {' · '}
            {messages.length} pesan total
          </p>
        </div>
      </div>
    </div>
  );
}
