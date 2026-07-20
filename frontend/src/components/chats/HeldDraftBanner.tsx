import { useState } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useReplyPreview, useHandoff } from '@/hooks/crm/useCrmAi';
import type { HandoffContextDto } from '@/lib/contract';
import { toast } from 'sonner';

dayjs.extend(relativeTime);

export type HeldDraftScenario = 'confidence_low' | 'fallback_handoff';

interface HeldDraftBannerProps {
  chatId: string;
  confidence: number;
  /**
   * Why the banner is showing.
   * - `confidence_low` (default): AI drafted a reply but held it because
   *   confidence was low. Operator reviews the draft and decides.
   * - `fallback_handoff`: AI already sent a locked fallback phrase
   *   (e.g. "kak, butuh bantuan manusia") and the chat is now flagged
   *   for a human operator to answer the specific question. Legacy path
   *   is `confidence_low`; the new dominant path is `fallback_handoff`
   *   (see BE `trigger.js` `fallback_used` handling).
   */
  scenario?: HeldDraftScenario;
}

const SEND_AS_IS = 'send-as-is';
const EDIT_AND_SEND = 'edit-and-send';
const DISCARD = 'discard';
const VIEW_AI_MESSAGE = 'view-ai-message';
const ANSWER_MANUAL = 'answer-manual';

/**
 * Inline handoff summary panel — only rendered inside the
 * `fallback_handoff` scenario after the operator clicks
 * "Lihat ringkasan". Shows the BE-served conversation summary, last 3
 * messages, and the flag reason so the operator can take over without
 * re-reading the full thread.
 */
function HandoffSummaryInline({
  chatId,
  onClose,
}: {
  chatId: string;
  onClose: () => void;
}) {
  const { data, isLoading, isError, error } = useHandoff(chatId);

  if (isLoading) {
    return (
      <div
        className="rounded-md border border-slate-200 bg-white p-3 text-sm space-y-2"
        data-testid="handoff-summary-loading"
      >
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 space-y-2">
        <p>Gagal memuat ringkasan handoff: {(error as Error)?.message ?? 'unknown error'}</p>
        <Button size="sm" variant="outline" onClick={onClose}>
          Tutup
        </Button>
      </div>
    );
  }

  // BE returns 404 → the chat was toggled back to AI mode while open.
  if (data === null) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm space-y-2">
        <p className="text-slate-700">Chat tidak lagi dalam mode handoff.</p>
        <Button size="sm" variant="outline" onClick={onClose}>
          Tutup
        </Button>
      </div>
    );
  }

  // `useQuery`'s `data` is `T | undefined`; with the loading/error/null
  // branches above guarded, the only remaining case is a successful
  // payload. Narrow once for the rest of the JSX.
  const ctx = data as NonNullable<HandoffContextDto>;

  return (
    <div
      className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm space-y-3"
      data-testid="handoff-summary"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-sky-900">{ctx.flagReasonLabel}</p>
          {typeof ctx.summaryUpdatedAt === 'number' && (
            <p className="text-xs text-sky-700/80">
              Ringkasan diperbarui {dayjs.unix(ctx.summaryUpdatedAt).fromNow()}
            </p>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Tutup
        </Button>
      </div>

      <blockquote className="border-l-2 border-sky-300 bg-white/70 pl-3 pr-2 py-2 text-sm italic text-slate-800">
        {ctx.conversationSummary}
      </blockquote>

      {ctx.lastMessages.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-sky-900/80">Pesan terakhir</p>
          <ul className="space-y-1">
            {ctx.lastMessages.map((m: HandoffContextDto['lastMessages'][number]) => (
              <li
                key={m.id}
                className="flex gap-2 rounded bg-white/70 px-2 py-1 text-xs text-slate-700"
              >
                <span aria-hidden className="font-mono text-slate-500">
                  {m.direction === 'in' ? '←' : '→'}
                </span>
                <span className="flex-1">
                  {m.senderName && (
                    <span className="font-medium text-slate-900">{m.senderName}: </span>
                  )}
                  {m.body ?? <em className="text-slate-400">(kosong)</em>}
                </span>
                <span className="shrink-0 text-slate-400">
                  {dayjs.unix(m.timestamp).fromNow()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Held-draft banner shown above the thread panel when
 * `chat.aiMode === 'human_pending_flag'`. Three actions mapped to
 * the state machine in `docs/tech/ai-reply-state-machine.md`.
 *
 * Scenario-aware: `confidence_low` keeps the original draft-review UI;
 * `fallback_handoff` shows a different copy + actions because the AI has
 * already sent the fallback phrase to the contact.
 */
export function HeldDraftBanner({
  chatId,
  confidence,
  scenario = 'confidence_low',
}: HeldDraftBannerProps) {
  const preview = useReplyPreview();
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const isFallback = scenario === 'fallback_handoff';

  const dispatch = async (action: string) => {
    setBusyAction(action);
    try {
      const msg = await preview.mutateAsync({
        chatId,
        message: '[held-draft-replay]',
      });
      if (action === SEND_AS_IS) {
        toast.success(`Dikirim apa adanya (confidence ${msg.confidence.toFixed(2)})`);
      } else if (action === EDIT_AND_SEND) {
        toast.message('Draf dibuka di composer untuk diedit');
      } else if (action === DISCARD) {
        toast.success('Draf dibuang');
      } else if (action === VIEW_AI_MESSAGE) {
        toast.message(`Pesan fallback: "${msg.answer}"`);
      } else if (action === ANSWER_MANUAL) {
        toast.message('Composer dibuka untuk menjawab kontak secara manual');
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <Card
      role="alert"
      aria-live="polite"
      className="border-amber-300 bg-amber-50 dark:bg-amber-900/20"
    >
      <CardContent className="space-y-3 p-4 text-sm">
        {isFallback ? (
          <p>
            AI sudah kirim pesan fallback ke kontak (kak, butuh bantuan). Chat ini butuh kamu
            untuk menjawab pertanyaan spesifik.
          </p>
        ) : (
          <p>
            AI menyusun draf jawaban, tetapi tingkat keyakinannya rendah (confidence:{' '}
            <span className="font-mono">{confidence.toFixed(2)}</span>). Tinjau dulu sebelum
            mengirim.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {isFallback ? (
            <>
              <Button
                size="sm"
                disabled={busyAction !== null}
                onClick={() => dispatch(VIEW_AI_MESSAGE)}
              >
                Lihat pesan AI
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busyAction !== null}
                onClick={() => dispatch(ANSWER_MANUAL)}
              >
                Jawab manual
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busyAction !== null}
                onClick={() => setShowSummary((v) => !v)}
                aria-expanded={showSummary}
              >
                {showSummary ? 'Sembunyikan ringkasan' : 'Lihat ringkasan'}
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                disabled={busyAction !== null}
                onClick={() => dispatch(SEND_AS_IS)}
              >
                Kirim apa adanya
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busyAction !== null}
                onClick={() => dispatch(EDIT_AND_SEND)}
              >
                Edit & kirim
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busyAction !== null}
                onClick={() => dispatch(DISCARD)}
              >
                Buang draf
              </Button>
            </>
          )}
        </div>
        {isFallback && showSummary && (
          <HandoffSummaryInline chatId={chatId} onClose={() => setShowSummary(false)} />
        )}
      </CardContent>
    </Card>
  );
}
