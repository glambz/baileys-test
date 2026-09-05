import * as React from 'react';
import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useSendMessage, useSendWhatsAppMessage } from '@/hooks/useSendWhatsApp';
import { useChatSocket } from '@/hooks/useChatSocket';
import { cn } from '@/lib/utils';

const ComposerSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Pesan tidak boleh kosong')
    .max(4096, 'Pesan terlalu panjang'),
});
type ComposerForm = z.infer<typeof ComposerSchema>;

interface ComposerProps {
  chatId: string;
  /**
   * E.164 digits (e.g. "6281236012938"). Used by useSendWhatsAppMessage
   * to call POST /api/messages/send with `{ phone, message }`. Optional —
   * when absent, Composer falls back to the local-insert path so the
   * test/local-dev flow still works.
   */
  phone?: string;
}

/**
 * Sticky-bottom composer. Enter sends, Shift+Enter inserts a newline.
 * Uses react-hook-form with zod validation. Optimistic insert is
 * handled inside `useSendMessage`.
 */
export function Composer({ chatId, phone }: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { register, handleSubmit, reset, watch, formState } = useForm<ComposerForm>({
    resolver: zodResolver(ComposerSchema),
    defaultValues: { body: '' },
    mode: 'onChange',
  });
  const bodyRegistration = register('body');
  const body = watch('body') ?? '';
  // BUG-KIRIM-NOT-THROUGH-WHATSAPP fix (2026-07-23): the Composer now
  // routes through useSendWhatsAppMessage (POST /api/messages/send) when
  // the parent supplies `phone`. Falls back to useSendMessage (local
  // DB-only insert) when phone is unknown — useful for tests / local dev.
  const sendWA = useSendWhatsAppMessage();
  const sendLocal = useSendMessage(chatId);

  // BUG-PUSH-EVENTS-TYPING fix (2026-08-03): WS-based typing indicator.
  // The hook opens a WebSocket to /ws/chat?chatId=X; we send a typing
  // event when the local user types (debounced), and we receive echoes
  // from other clients on the same chat.
  const { typingFromOthers, sendTyping } = useChatSocket(chatId, 'operator');

  useEffect(() => {
    textareaRef.current?.focus();
  }, [chatId]);

  const onSubmit = handleSubmit(async ({ body: text }) => {
    try {
      if (phone) {
        // Real WhatsApp send.
        const r = await sendWA.mutateAsync({ phone, message: text });
        // Optimistic insert (so the bubble appears immediately; the
        // server echo will replace the optimistic id with the real one).
        reset({ body: '' });
        textareaRef.current?.focus();
        void r; // silence unused
      } else {
        await sendLocal.mutateAsync({ body: text });
        reset({ body: '' });
        textareaRef.current?.focus();
      }
    } catch (err) {
      const error = err as Error & { code?: string };
      toast.error(error.message || 'Gagal mengirim pesan');
    }
  });

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void onSubmit();
    }
  };

  // BUG-PUSH-EVENTS-TYPING: notify the BE that this user is typing.
  // The hook throttles internally (one event per ~3s).
  const handleChange = () => {
    if (body.trim().length === 0) return;
    sendTyping();
  };

  const disabled =
    sendWA.isPending || sendLocal.isPending || body.trim().length === 0;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit();
      }}
      className="border-t bg-background p-3"
      aria-label="Kirim pesan"
    >
      <div className="flex items-end gap-2">
        <Textarea
          {...bodyRegistration}
          ref={(el) => {
            // BUG-CHAT-COMPOSER-UNDEFINED-BODY fix (2026-07-22): the
            // form's `watch('body')` returns undefined on every keystroke
            // unless react-hook-form's ref callback from `register` is
            // attached. We call `register('body')` exactly once at the
            // top of the render, then forward the resulting ref into
            // the Textarea here (combined with our focus ref).
            const registerRef = bodyRegistration.ref;
            if (typeof registerRef === 'function') {
              registerRef(el);
            } else if (registerRef && typeof registerRef === 'object' && 'current' in registerRef) {
              (registerRef as { current: HTMLTextAreaElement | null }).current = el;
            }
            textareaRef.current = el;
          }}
          rows={1}
          placeholder="Tulis pesan…"
          className="max-h-40 min-h-[40px] flex-1 resize-none"
          onKeyDown={handleKeyDown}
          onChange={handleChange}
          disabled={sendWA.isPending || sendLocal.isPending}
          aria-invalid={formState.errors.body ? 'true' : 'false'}
        />
        {/* BUG-PUSH-EVENTS-TYPING: show "X is typing" indicator */}
        {typingFromOthers.length > 0 && (
          <p className="text-[11px] text-muted-foreground italic" aria-live="polite">
            {typingFromOthers.join(', ')} sedang mengetik…
          </p>
        )}
        <Button
          type="submit"
          disabled={disabled}
          aria-label="Kirim"
          className={cn(disabled && 'opacity-60')}
        >
          {sendWA.isPending || sendLocal.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Send className="h-4 w-4" aria-hidden />
          )}
          <span className="ml-1.5 hidden sm:inline">Kirim</span>
        </Button>
      </div>
      {formState.errors.body && (
        <p className="mt-1 text-xs text-destructive" role="alert">
          {formState.errors.body.message}
        </p>
      )}
    </form>
  );
}