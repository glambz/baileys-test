import * as React from 'react';
import { useState } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useReplyPreview, useHandoff } from '@/hooks/crm/useCrmAi';
import type { HandoffContextDto } from '@/lib/contract';
import { EscalationBriefing } from './EscalationBriefing';
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
        className="space-y-2 rounded-lg border border-border bg-card p-4 text-sm"
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
      <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
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
      <div className="space-y-2 rounded-lg border border-border bg-muted p-4 text-sm">
        <p className="text-muted-foreground">Chat tidak lagi dalam mode handoff.</p>
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
    <div className="space-y-3 text-sm" data-testid="handoff-summary">
      {ctx.escalationBriefing ? (
        <EscalationBriefing briefing={ctx.escalationBriefing} />
      ) : (
        // Pre-migration-013 BE, or a chat flagged before briefings existed.
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="font-medium text-foreground">{ctx.flagReasonLabel}</p>
          {typeof ctx.summaryUpdatedAt === 'number' && ctx.summaryUpdatedAt > 0 && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Ringkasan diperbarui {dayjs.unix(ctx.summaryUpdatedAt).fromNow()}
            </p>
          )}
        </div>
      )}

      <details className="group rounded-lg border border-border bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span>Konteks percakapan</span>
          <span aria-hidden className="transition-transform group-open:rotate-90">
            &rsaquo;
          </span>
        </summary>
        <div className="space-y-3 border-t border-border px-4 py-3">
          <StructuredSummary raw={ctx.conversationSummary} />

          {ctx.lastMessages.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Pesan terakhir
              </p>
              <ul className="space-y-1">
                {ctx.lastMessages.map((m: HandoffContextDto['lastMessages'][number]) => (
                  <li
                    key={m.id}
                    className="flex gap-2 rounded-md bg-muted px-2 py-1.5 text-xs text-foreground"
                  >
                    <span aria-hidden className="font-mono text-muted-foreground">
                      {m.direction === 'in' ? '←' : '→'}
                    </span>
                    <span className="sr-only">
                      {m.direction === 'in' ? 'Masuk:' : 'Keluar:'}
                    </span>
                    <span className="flex-1">
                      {m.senderName && (
                        <span className="font-medium">{m.senderName}: </span>
                      )}
                      {m.body ?? <em className="text-muted-foreground">(kosong)</em>}
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {dayjs.unix(m.timestamp).fromNow()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </details>
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
      className="border-warning/40 bg-warning/[0.07]"
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
        {/* Always rendered: an agent looking at this banner is taking the
            chat over, and the briefing is what they need to do that. It
            used to be behind a "Lihat ringkasan" button and limited to the
            fallback scenario. */}
        <HandoffSummaryInline chatId={chatId} onClose={() => undefined} />
      </CardContent>
    </Card>
  );
}

/**
 * BUG-CHAT-HANDOFF-SUMMARY-NOT-HUMAN-READABLE fix (2026-07-22):
 * the BE stores `chats.conversation_summary` as a JSON.stringify of a
 * structured object:
 *   { topic, user_intent, key_facts[], decisions[], open_questions[], running_summary }
 * The previous FE rendered the raw string inside a blockquote, which
 * showed the operator an unreadable JSON blob. Now we attempt to parse it
 * and render each field as a labelled section. If the parse fails (older
 * summaries were stored as plain text) we fall back to the raw
 * blockquote rendering.
 */
type ParsedSummary =
  | {
      ok: true;
      topic?: string;
      user_intent?: string;
      key_facts: string[];
      decisions: string[];
      open_questions: string[];
      running_summary?: string;
    }
  | { ok: false; raw: string };

function parseConversationSummary(raw: string): ParsedSummary {
  if (!raw) return { ok: false, raw: '' };
  const trimmed = raw.trim();
  // The LLM is instructed to produce JSON without markdown fencing, but
  // some responses wrap it in ```json ... ```. Strip that defensively.
  const stripped = trimmed.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    const obj = JSON.parse(stripped);
    if (obj && typeof obj === 'object') {
      const str = (v: unknown): string | undefined =>
        typeof v === 'string' && v.trim() ? v.trim() : undefined;
      const arr = (v: unknown): string[] =>
        Array.isArray(v)
          ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => (x as string).trim())
          : [];
      return {
        ok: true,
        topic: str(obj.topic),
        user_intent: str((obj as { user_intent?: unknown }).user_intent),
        key_facts: arr((obj as { key_facts?: unknown }).key_facts),
        decisions: arr((obj as { decisions?: unknown }).decisions),
        open_questions: arr((obj as { open_questions?: unknown }).open_questions),
        running_summary: str((obj as { running_summary?: unknown }).running_summary),
      };
    }
  } catch {
    // fall through to raw fallback
  }
  return { ok: false, raw };
}

function SummarySection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  );
}

function StructuredSummary({ raw }: { raw: string }) {
  const parsed = parseConversationSummary(raw);
  if (!parsed.ok) {
    return (
      <blockquote className="border-l-2 border-border bg-muted py-2 pl-3 pr-2 text-sm italic text-foreground">
        {parsed.raw}
      </blockquote>
    );
  }
  const { topic, user_intent, key_facts, decisions, open_questions, running_summary } = parsed;
  const allEmpty =
    !topic &&
    !user_intent &&
    key_facts.length === 0 &&
    decisions.length === 0 &&
    open_questions.length === 0 &&
    !running_summary;
  if (allEmpty) {
    return (
      <p className="text-xs italic text-muted-foreground">
        Ringkasan belum tersedia.
      </p>
    );
  }
  return (
    <div className="space-y-3 border-l-2 border-border bg-muted px-3 py-2 text-sm text-foreground">
      {topic && (
        <SummarySection title="Topik">
          <p className="font-medium">{topic}</p>
        </SummarySection>
      )}
      {user_intent && (
        <SummarySection title="Maksud user">
          <p>{user_intent}</p>
        </SummarySection>
      )}
      {key_facts.length > 0 && (
        <SummarySection title="Fakta penting">
          <ul className="list-disc space-y-0.5 pl-5">
            {key_facts.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </SummarySection>
      )}
      {decisions.length > 0 && (
        <SummarySection title="Keputusan / kesepakatan">
          <ul className="list-disc space-y-0.5 pl-5">
            {decisions.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </SummarySection>
      )}
      {open_questions.length > 0 && (
        <SummarySection title="Pertanyaan terbuka">
          <ul className="list-disc space-y-0.5 pl-5">
            {open_questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </SummarySection>
      )}
      {running_summary && (
        <SummarySection title="Ringkasan kronologis">
          <p className="whitespace-pre-wrap">{running_summary}</p>
        </SummarySection>
      )}
    </div>
  );
}
