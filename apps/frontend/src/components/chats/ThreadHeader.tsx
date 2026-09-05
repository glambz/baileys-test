import { useState } from 'react';
import { MoreVertical, FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import type { Chat, Contact } from '@/types';
import type { AIReplyMode } from '@/types/crm';
import { contactLabel, findContactForPhone } from '@/lib/contactLabel';
import { formatPhone } from '@/lib/config';
import { AiModeToggle } from './AiModeToggle';
import { HeldDraftBanner } from './HeldDraftBanner';
import { useChatAiModes, useReplyPreview } from '@/hooks/crm/useCrmAi';

interface ThreadHeaderProps {
  chat: Chat;
  contacts: readonly Contact[];
}

const HELD_DRAFT_CONFIDENCE = 0.42;

/**
 * Header for the focused chat - primary label via `contactLabel()`,
 * sub-line of formatted phone when no `Contact.displayName` exists,
 * the AI/Human toggle pill, the kebab menu with a Test reply action,
 * and the held-draft banner when `aiMode === 'human_pending_flag'`.
 */
export function ThreadHeader({ chat, contacts }: ThreadHeaderProps) {
  const contact = findContactForPhone(contacts, chat.phone);
  const label = contactLabel(chat, contact, chat.phone ?? '');
  const showSubline = !!chat.phone && !contact?.displayName && chat.jid !== 'status@broadcast';
  const subline = showSubline ? formatPhone(chat.phone ?? '') : null;

  // BUG-AI-HUMAN-TOGGLE-NO-VISUAL-UPDATE fix (2026-07-16): derive the
  // mode from the per-chat modes query (not from chat.aiMode on the
  // chat list). The toggle pill invalidates ['crm', 'chats', 'modes']
  // after success, which refetches this query and updates the pill
  // immediately. The previous code read chat.aiMode from the chats
  // list, which (a) the FE schema stripped during parse and (b) never
  // refreshed because useChats uses a different cache key.
  const modesQuery = useChatAiModes();
  const mode: AIReplyMode =
    (chat.aiMode ?? modesQuery.data?.[chat.id] ?? 'ai') as AIReplyMode;
  const showBanner = mode === 'human_pending_flag';

  return (
    <div className="shrink-0">
      <header className="flex h-14 items-center justify-between gap-2 border-b bg-background px-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold" data-testid="thread-header-label">
            {label}
          </p>
          {subline && (
            <p className="truncate text-xs text-muted-foreground" data-testid="thread-header-subline">
              {subline}
            </p>
          )}
        </div>
        <AiModeToggle chatId={chat.id} mode={mode} />
        <KebabMenu chat={chat} />
      </header>
      {/* Bounded so the handoff panel cannot squeeze the message list to
          zero height. The panel grew when the escalation briefing was added
          to it; without a cap it consumed the whole thread pane and the
          conversation the agent is taking over became unreachable. */}
      {showBanner && (
        <div className="max-h-[45vh] overflow-y-auto border-b bg-background p-3">
          <HeldDraftBanner
            chatId={chat.id}
            confidence={HELD_DRAFT_CONFIDENCE}
            scenario="fallback_handoff"
          />
        </div>
      )}
    </div>
  );
}

function KebabMenu({ chat }: { chat: Chat }) {
  const [openTest, setOpenTest] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Aksi percakapan"
          >
            <MoreVertical className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setOpenTest(true)}>
            <FlaskConical className="mr-2 h-4 w-4" /> Test reply
          </DropdownMenuItem>
          <DropdownMenuItem disabled>Lihat kontak</DropdownMenuItem>
          <DropdownMenuItem disabled>Arsipkan</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <TestReplyDialog chatId={chat.id} open={openTest} onOpenChange={setOpenTest} />
    </>
  );
}

function TestReplyDialog({
  chatId,
  open,
  onOpenChange,
}: {
  chatId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [message, setMessage] = useState('Berapa total invoice bulan ini?');
  const preview = useReplyPreview();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Test reply</DialogTitle>
          <DialogDescription>
            Preview auto-reply untuk chat ini dengan pesan hipotetis. Hard contact filter tetap berlaku.
          </DialogDescription>
        </DialogHeader>
        <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} />
        <div className="space-y-3">
          <Button
            size="sm"
            disabled={preview.isPending || message.length === 0}
            onClick={() => preview.mutate({ chatId, message })}
          >
            Jalankan preview
          </Button>
          {preview.data && (
            <div className="space-y-2 rounded border p-3 text-sm">
              <div className="flex items-center justify-between">
                <span>
                  Confidence: <span className="font-mono">{preview.data.confidence.toFixed(2)}</span>
                </span>
                <Badge variant={preview.data.would_send ? 'default' : 'outline'}>
                  {preview.data.would_send ? 'akan terkirim' : 'tidak terkirim'}
                </Badge>
              </div>
              {!preview.data.would_send && preview.data.reason && (
                <p className="text-amber-700 dark:text-amber-300">{preview.data.reason}</p>
              )}
              <p className="whitespace-pre-wrap break-words rounded bg-muted p-2 text-xs">
                {preview.data.answer}
              </p>
              {preview.data.evidence.length > 0 && (
                <div className="space-y-1 text-xs">
                  <p className="text-muted-foreground">Evidence ({preview.data.evidence.length})</p>
                  <ul className="space-y-1">
                    {preview.data.evidence.map((e, idx) => (
                      <li key={idx} className="rounded border p-2">
                        <div className="flex items-center justify-between">
                          <code className="text-[10px]">{e.source}</code>
                          <code className="text-[10px] text-muted-foreground">
                            contact: {e.contactId ?? 'none'}
                          </code>
                        </div>
                        <div className="truncate">{e.excerpt}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
