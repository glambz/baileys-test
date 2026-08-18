import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAskAiTeam } from '@/hooks/crm/useCrmAi';
import type { CrmAskAiResponse } from '@/types/crm';
import { cn } from '@/lib/utils';

const Schema = z.object({
  question: z
    .string()
    .trim()
    .min(3, 'Pertanyaan minimal 3 karakter')
    .max(500, 'Pertanyaan terlalu panjang'),
});
type FormValues = z.infer<typeof Schema>;

interface TeamAiComposerProps {
  onAnswer: (response: CrmAskAiResponse, question: string) => void;
  onAsk?: (question: string) => void | Promise<void>;
  seed?: string;
  onSeedConsumed?: () => void;
}

/**
 * Team-scope AI composer for `/ai`. Calls
 * `POST /api/crm/ai/ask` (no contact filter).
 */
export function TeamAiComposer({ onAnswer, onAsk, seed, onSeedConsumed }: TeamAiComposerProps) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const { register, handleSubmit, reset, watch, setValue, formState } = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: { question: seed ?? '' },
    mode: 'onChange',
  });
  const mutation = useAskAiTeam();
  const question = watch('question');
  // When onAsk is provided, the parent owns the streaming state. We
  // don't know from here whether the stream is in-flight, so we just
  // disable the mutation path. The parent can also pass a more
  // explicit onAnswer + custom button if needed.
  const disabled = mutation.isPending || question.trim().length < 3;

  useEffect(() => {
    if (typeof seed === 'string') {
      setValue('question', seed, { shouldValidate: false });
      ref.current?.focus();
      onSeedConsumed?.();
    }
  }, [seed, setValue, onSeedConsumed]);

  const submit = handleSubmit(async (values) => {
    if (onAsk) {
      // Streaming path: caller manages the request lifecycle.
      try {
        await onAsk(values.question);
        reset({ question: '' });
        ref.current?.focus();
      } catch (err) {
        toast.error((err as Error).message || 'Gagal menghubungi layanan AI');
      }
      return;
    }
    try {
      const response = await mutation.mutateAsync({ question: values.question });
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
      aria-label="Kirim pertanyaan AI (team scope)"
    >
      <Textarea
        {...register('question')}
        ref={(el) => {
          register('question').ref(el);
          ref.current = el;
        }}
        data-shortcut="ai-composer"
        rows={1}
        placeholder="Tanya AI (scope tim)…"
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
    </form>
  );
}
