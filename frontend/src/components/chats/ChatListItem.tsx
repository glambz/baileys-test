import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { Chat, Contact } from '@/types';
import { contactLabel, findContactForPhone, findContactForJid } from '@/lib/contactLabel';
import { formatPhone } from '@/lib/config';
import { useUiStore } from '@/stores/ui';
import { useChatAiModes } from '@/hooks/crm/useCrmAi';
import { AiModeBadge } from './AiModeBadge';
import dayjs from 'dayjs';

interface ChatListItemProps {
  chat: Chat;
  contacts: readonly Contact[];
  isActive: boolean;
}

/**
 * Single row in the sidebar. Avatar with initial, primary label
 * (via `contactLabel`), sub-line of formatted phone when no
 * `displayName` is known, last-message preview, timestamp, unread badge,
 * and the AI-mode badge when the chat is in `human_pending_flag`.
 */
export function ChatListItem({ chat, contacts, isActive }: ChatListItemProps) {
  const navigate = useNavigate();
  const setMobileSidebarOpen = useUiStore((s) => s.setMobileSidebarOpen);
  const modesQuery = useChatAiModes();
  const isGroupOrStatus = chat.jid.endsWith('@g.us') || chat.jid === 'status@broadcast';
  const contact = isGroupOrStatus
    ? findContactForJid(contacts, chat.jid)
    : findContactForPhone(contacts, chat.phone);
  const label = contactLabel(chat, contact, chat.phone ?? '', undefined, undefined);
  const subline =
    chat.jid === 'status@broadcast'
      ? null
      : !contact?.displayName && chat.phone
        ? formatPhone(chat.phone)
        : null;

  const tsLabel = formatChatTime(chat.lastMessageAt);
  const initial = (label.trim()[0] ?? '?').toUpperCase();
  const avatarBg = pickAvatarColor(chat.id);
  const effectiveMode = (chat.aiMode ?? modesQuery.data?.[chat.id] ?? 'ai') as
    | 'ai'
    | 'human'
    | 'human_pending_flag';

  return (
    <button
      type="button"
      onClick={() => {
        navigate(`/chats/${encodeURIComponent(chat.id)}`);
        setMobileSidebarOpen(false);
      }}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'group flex h-14 w-full items-center gap-3 border-b border-border/50 px-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isActive ? 'bg-secondary' : 'hover:bg-secondary/60'
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white',
          avatarBg
        )}
      >
        {initial}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-baseline gap-2">
          <span className="truncate font-medium">{label}</span>
          {effectiveMode === 'human_pending_flag' && (
            <span className="ml-1">
              <AiModeBadge mode="human_pending_flag" />
            </span>
          )}
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">{tsLabel}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="truncate text-xs text-muted-foreground">
            {subline ? `${subline} · ` : ''}
            {chat.lastMessagePreview}
          </span>
          {chat.unreadCount > 0 && (
            <span
              className="ml-auto inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-semibold text-destructive-foreground"
              aria-label={`${chat.unreadCount} pesan belum dibaca`}
            >
              {chat.unreadCount}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

function formatChatTime(unixSeconds: number): string {
  const m = dayjs.unix(unixSeconds);
  if (!m.isValid()) return '';
  const now = dayjs();
  if (m.isSame(now, 'day')) return m.format('HH:mm');
  return m.format('DD/MM');
}

function pickAvatarColor(seed: string): string {
  const palette = [
    'bg-emerald-600',
    'bg-sky-600',
    'bg-amber-600',
    'bg-rose-600',
    'bg-violet-600',
    'bg-teal-600',
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}
