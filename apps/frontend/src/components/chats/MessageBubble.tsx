import dayjs from 'dayjs';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Message } from '@/types';
import { formatPhone } from '@/lib/config';
import { Badge } from '@/components/ui/badge';

interface MessageBubbleProps {
  message: Message;
}

/**
 * Single message bubble. `out` messages align right with primary
 * background; `in` messages align left with muted background. Pending
 * (optimistic) bubbles show a spinner instead of a timestamp.
 */
export function MessageBubble({ message }: MessageBubbleProps) {
  const isOut = message.direction === 'out';
  const label = isOut
    ? 'Anda'
    : message.senderName ?? formatPhone(message.key.senderPn ?? '');
  const isPending = message.id.startsWith('optimistic-');

  return (
    <div
      data-testid={isPending ? 'message-pending' : 'message'}
      className={cn('flex w-full', isOut ? 'justify-end' : 'justify-start')}
    >
      <div
        className={cn(
          'max-w-[70%] rounded-2xl px-3 py-2 text-sm shadow-sm',
          isOut
            ? 'rounded-br-sm bg-primary text-primary-foreground'
            : 'rounded-bl-sm bg-muted text-foreground'
        )}
      >
        <p className="mb-0.5 text-[11px] font-medium opacity-70">{label}</p>
        {message.kind === 'text' && <p className="whitespace-pre-wrap break-words">{message.body}</p>}
        {message.kind !== 'text' && (
          <p className="whitespace-pre-wrap break-words italic">
            [{message.kind}] {message.caption ?? message.body ?? ''}
          </p>
        )}
        <div className="mt-1 flex justify-end text-[10px] opacity-70" aria-live="polite">
          {isPending ? (
            <span role="status" className="inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> mengirim…
            </span>
          ) : (
            <span>{dayjs.unix(message.timestamp).format('HH:mm')}</span>
          )}
        </div>
        {message.direction === 'out' && message.isFallback && (
          <div className="mt-1 flex justify-end">
            <Badge variant="secondary" className="text-[10px]">
              🤝 butuh bantuan manusia
            </Badge>
          </div>
        )}
      </div>
    </div>
  );
}