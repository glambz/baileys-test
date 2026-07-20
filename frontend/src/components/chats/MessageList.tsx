import { useEffect, useLayoutEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageBubble } from './MessageBubble';
import type { Message } from '@/types';
import { Loader2, RefreshCw, Upload } from 'lucide-react';

interface MessageListProps {
  messages: Message[] | undefined;
  isLoading: boolean;
  isFetchingOlder: boolean;
  isError: boolean;
  hasOlder: boolean;
  onRetry: () => void;
  onLoadOlder: () => void;
}

/**
 * Auto-scrolling message list with loading / empty / error states per
 * `docs/frontend/features/chats/spec.md` §6.2.
 *
 * Bug fixes (2026-07-16):
 *  - Bug 4: `useLayoutEffect` for first-mount scroll-to-bottom — runs
 *    synchronously before paint, so the user sees the bottom of the
 *    thread on initial render (the previous `useEffect` ran after
 *    paint, which left the scroll position at the top for an instant).
 *  - Bug 5: scroll listener calls `onLoadOlder` when the user scrolls
 *    near the top. Preserves scroll position by recording the scroll
 *    offset BEFORE the append and re-applying it AFTER the DOM grows,
 *    so prepending older messages doesn't appear to push the user away
 *    from the message they were reading.
 */
export function MessageList({
  messages,
  isLoading,
  isFetchingOlder,
  isError,
  hasOlder,
  onRetry,
  onLoadOlder,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // BUG-CHAT-UX-FIX-5: preserve the user's relative scroll anchor when
  // older messages are prepended. `stickyAnchorId` is the id of the
  // message that was at the top of the visible window before the fetch;
  // after the fetch, we scroll so that same message is at the same
  // offset from the top of the viewport.
  const pendingAnchor = useRef<{
    anchorId: string | null;
    anchorOffsetFromTop: number;
  } | null>(null);

  // BUG-CHAT-UX-FIX-4 (2026-07-16): synchronous pre-paint scroll-to-bottom
  // on mount + chatId change so the user never sees the top on first
  // render.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  // BUG-CHAT-UX-FIX-4 (continued): when new messages arrive at the
  // bottom and the user is already near the bottom, auto-scroll. If the
  // user has scrolled away from the bottom, don't jerk them back — they
  // can scroll down at their own pace.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Apply the pending scroll-anchor from a recent fetchOlder call, if any.
    const anchor = pendingAnchor.current;
    if (anchor && anchor.anchorId) {
      const target = el.querySelector<HTMLDivElement>(
        `[data-message-id="${CSS.escape(anchor.anchorId)}"]`,
      );
      if (target) {
        const newOffsetTop =
          target.getBoundingClientRect().top -
          el.getBoundingClientRect().top +
          el.scrollTop;
        el.scrollTop = newOffsetTop - anchor.anchorOffsetFromTop;
        pendingAnchor.current = null;
        return;
      }
    }
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceToBottom < 200) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // BUG-CHAT-UX-FIX-5 (continued): scroll listener — fire onLoadOlder
  // when the user scrolls near the top. Throttle to once per 250ms so
  // we don't queue many fetch calls during a fast scroll.
  const lastTriggerAt = useRef(0);
  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    if (!hasOlder) return;
    if (el.scrollTop <= 100) {
      const now = Date.now();
      if (now - lastTriggerAt.current < 250) return;
      lastTriggerAt.current = now;
      // Anchor the top message so when older messages prepend, the
      // user's scroll position is preserved.
      const visible = el.querySelectorAll<HTMLDivElement>('[data-message-id]');
      const firstVisible = visible[0];
      if (firstVisible) {
        const elRect = el.getBoundingClientRect();
        const mRect = firstVisible.getBoundingClientRect();
        pendingAnchor.current = {
          anchorId: firstVisible.getAttribute('data-message-id'),
          anchorOffsetFromTop: mRect.top - elRect.top,
        };
      }
      onLoadOlder();
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col gap-3 p-4">
        {Array.from({ length: 5 }).map((_, idx) => {
          const right = idx % 2 === 0;
          return (
            <div key={idx} className={right ? 'flex justify-end' : 'flex justify-start'}>
              <Skeleton
                className="h-12 w-[60%] max-w-md rounded-2xl"
                aria-hidden
              />
            </div>
          );
        })}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Card className="w-full max-w-sm border-destructive/40 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive">
            Tidak dapat memuat pesan.
          </p>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetry}>
            <RefreshCw className="mr-2 h-4 w-4" /> Coba lagi
          </Button>
        </Card>
      </div>
    );
  }

  const list = messages ?? [];
  if (list.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Belum ada pesan di percakapan ini.
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 space-y-2 overflow-y-auto p-4"
      role="log"
      aria-live="polite"
      aria-relevant="additions"
    >
      {(hasOlder || isFetchingOlder) && (
        <div className="flex flex-col items-center gap-1 pb-2 text-xs text-muted-foreground">
          {isFetchingOlder ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              <span>Memuat pesan lama…</span>
            </>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={onLoadOlder}
              aria-label="Muat pesan lebih lama"
            >
              <Upload className="mr-1 h-4 w-4" /> Muat pesan lama
            </Button>
          )}
        </div>
      )}
      {list.map((m) => (
        <div key={m.id} data-message-id={m.id}>
          <MessageBubble message={m} />
        </div>
      ))}
    </div>
  );
}