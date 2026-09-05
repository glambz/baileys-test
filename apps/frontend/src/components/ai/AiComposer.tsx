import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAskAi } from '@/hooks/useAskAi';
import type { AskAiResponse } from '@/types';
import { cn } from '@/lib/utils';

const Schema = z.object({
  question: z
    .string()
    .trim()
    .min(3, 'Pertanyaan minimal 3 karakter')
    .max(500, 'Pertanyaan terlalu panjang'),
});
type FormValues = z.infer<typeof Schema>;

interface AiComposerProps {
  onAnswer: (response: AskAiResponse, question: string) => void;
  /** When set, the composer pre-fills its textarea with this value. */
  seed?: string;
  /** Called when the seed has been consumed. */
  onSeedConsumed?: () => void;
}

/**
 * AI Chat composer. Enter submits, Shift+Enter newline, Esc clears.
 */
export function AiComposer({ onAnswer, seed, onSeedConsumed }: AiComposerProps) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const { register, handleSubmit, reset, watch, setValue, formState } = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: { question: seed ?? '' },
    mode: 'onChange',
  });
  const mutation = useAskAi();
  const question = watch('question');
  const disabled = mutation.isPending || question.trim().length < 3;

  useEffect(() => {
    if (typeof seed === 'string') {
      setValue('question', seed, { shouldValidate: false });
      ref.current?.focus();
      onSeedConsumed?.();
    }
  }, [seed, setValue, onSeedConsumed]);

  const submit = handleSubmit(async (values) => {
    try {
      const response = await mutation.mutateAsync({ question: values.question, topK: 3 });
      onAnswer(response, values.question);
      reset({ question: '' });
      ref.current?.focus();
    } catch (err) {
      const error = err as Error & { code?: string };
      if (error.code === 'ValidationError') return;
      toast.error(error.message || 'Gagal menghubungi layanan AI');
    }
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="flex items-end gap-2"
      aria-label="Kirim pertanyaan AI"
    >
      <Textarea
        {...register('question')}
        ref={(el) => {
          register('question').ref(el);
          ref.current = el;
        }}
        data-shortcut="ai-composer"
        rows={1}
        placeholder="Tanya AI…"
        className="max-h-40 min-h-[40px] flex-1 resize-none"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            void submit();
          } else if (event.key === 'Escape') {
            reset({ question: '' });
          }
        }}
        disabled={mutation.isPending}
        aria-invalid={formState.errors.question ? 'true' : 'false'}
      />
      <Button
        type="submit"
        disabled={disabled}
        className={cn(disabled && 'opacity-60')}
        aria-label="Tanya AI"
      >
        {mutation.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Send className="h-4 w-4" aria-hidden />
        )}
        <span className="ml-1.5 hidden sm:inline">Tanya</span>
      </Button>
      {formState.errors.question && (
        <p className="absolute -mt-7 text-xs text-destructive" role="alert">
          {formState.errors.question.message}
        </p>
      )}
      {mutation.isPending && (
        <div className="absolute -mt-7 flex justify-start">
          <span className="rounded-2xl bg-muted/60 px-3 py-1 text-xs italic text-muted-foreground">
            …
          </span>
        </div>
      )}
    </form>
  );
}