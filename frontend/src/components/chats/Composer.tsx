import * as React from 'react';
import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useSendMessage } from '@/hooks/useSendMessage';
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
}

/**
 * Sticky-bottom composer. Enter sends, Shift+Enter inserts a newline.
 * Uses react-hook-form with zod validation. Optimistic insert is
 * handled inside `useSendMessage`.
 */
export function Composer({ chatId }: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { register, handleSubmit, reset, watch, formState } = useForm<ComposerForm>({
    resolver: zodResolver(ComposerSchema),
    defaultValues: { body: '' },
    mode: 'onChange',
  });
  const body = watch('body');
  const mutation = useSendMessage(chatId);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [chatId]);

  const onSubmit = handleSubmit(async ({ body: text }) => {
    try {
      await mutation.mutateAsync({ body: text });
      reset({ body: '' });
      textareaRef.current?.focus();
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

  const disabled = mutation.isPending || body.trim().length === 0;

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
          {...register('body', {
            // keep register minimal — zod handles validation on submit
          })}
          ref={(el) => {
            register('body').ref(el);
            textareaRef.current = el;
          }}
          rows={1}
          placeholder="Tulis pesan…"
          className="max-h-40 min-h-[40px] flex-1 resize-none"
          onKeyDown={handleKeyDown}
          disabled={mutation.isPending}
          aria-invalid={formState.errors.body ? 'true' : 'false'}
        />
        <Button
          type="submit"
          disabled={disabled}
          aria-label="Kirim"
          className={cn(disabled && 'opacity-60')}
        >
          {mutation.isPending ? (
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