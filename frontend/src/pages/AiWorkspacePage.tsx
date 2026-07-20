import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MessageSquare, ExternalLink, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Transcript, type TranscriptItem } from '@/components/ai/Transcript';
import { TeamAiComposer } from '@/components/ai/TeamAiComposer';
import { useChats } from '@/hooks/useChats';
import { useUiStore } from '@/stores/ui';
import { CRM_CONFIDENCE_THRESHOLD } from '@/lib/crm/zodFromSchema';
import { AI_FALLBACK_MESSAGE_ID } from '@/lib/ai/fallbackMessage';
import type { CrmAskAiResponse, CrmAiEvidence } from '@/types/crm';

interface HistoryEntry {
  question: string;
  answer: string;
  confidence: number;
  scope: 'team';
  ts: number;
}

const HISTORY_KEY = 'ai.history.v1';

function loadHistory(): HistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HistoryEntry[];
  } catch {
    return [];
  }
}

function saveHistory(list: HistoryEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

function toTranscriptItem(resp: CrmAskAiResponse, _question: string, idx: number): TranscriptItem {
  if (resp.kind === 'answered') {
    const evidenceFromCrm = resp.evidence.map((e: CrmAiEvidence) => ({
      entryId: e.recordId ?? e.entryId ?? `crm-ev-${idx}`,
      excerpt: e.excerpt,
      source: e.source,
      confidence: e.confidence,
      sourceUrl: null,
      contactId: e.contactId ?? null,
    }));
    return {
      id: `crm-a-${idx}`,
      role: 'ai',
      payload: {
        kind: 'answered',
        answer: resp.answer,
        confidence: resp.confidence,
        evidence: evidenceFromCrm as unknown as import('@/types').Evidence[],
        generatedAt: resp.generatedAt,
        question: resp.question,
      },
    };
  }
  return {
    id: `crm-f-${idx}`,
    role: 'fallback',
    payload: {
      kind: 'fallback',
      message: resp.message || AI_FALLBACK_MESSAGE_ID,
    },
  };
}

export default function AiWorkspacePage() {
  const [items, setItems] = useState<TranscriptItem[]>([]);
  const [pendingSeed, setPendingSeed] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());
  const [showSources, setShowSources] = useState(false);
  const chatsQ = useChats();
  const navigate = useNavigate();

  const handleAnswer = (resp: CrmAskAiResponse, question: string) => {
    setItems((prev) => [
      ...prev,
      { id: `q-${prev.length}-${Date.now()}`, role: 'user', question },
      toTranscriptItem(resp, question, prev.length),
    ]);
    const nextHistory: HistoryEntry[] = [
      {
        question,
        answer: resp.kind === 'answered' ? resp.answer : resp.message,
        confidence: resp.kind === 'answered' ? resp.confidence : 0.2,
        scope: 'team' as const,
        ts: Date.now(),
      },
      ...history,
    ].slice(0, 30);
    setHistory(nextHistory);
    saveHistory(nextHistory);
  };

  const restoreFromHistory = (entry: HistoryEntry) => setPendingSeed(entry.question);

  const openFirstChat = () => {
    const first = chatsQ.data?.[0];
    if (first) navigate(`/chats/${encodeURIComponent(first.id)}`);
  };

  /**
   * Atur AI shortcut. Disabled when a settings drawer is open
   * (future cycles). For now the guard is always false.
   * Plan 14 task 1 — the click sets `pane1Selection = 'settings'`
   * BEFORE navigating so the rail item is already highlighted when
   * `/ai-settings` mounts.
   */
  const drawerGuardOpen = false;
  const onOpenAiSettings = () => {
    useUiStore.getState().setPane1Selection('settings');
    navigate('/ai-settings');
  };

  return (
    <div className="flex h-full flex-col md:flex-row">
      <aside className="hidden w-80 shrink-0 flex-col border-r md:flex">
        <div className="border-b p-3">
          <h2 className="font-medium">Riwayat pertanyaan</h2>
          <p className="text-xs text-muted-foreground">{history.length} pertanyaan.</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {history.length === 0 ? (
            <p className="p-4 text-xs text-muted-foreground">
              Belum ada pertanyaan. Tanyakan di kolom kanan.
            </p>
          ) : (
            <ul role="list" className="divide-y">
              {history.map((h, i) => (
                <li key={`${h.question}-${i}`}>
                  <button
                    type="button"
                    onClick={() => restoreFromHistory(h)}
                    className="block w-full p-3 text-left text-xs hover:bg-secondary/60"
                  >
                    <p className="truncate font-medium">{h.question}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{h.answer}</p>
                    <p className="mt-1 text-[11px]">
                      <Badge variant={h.confidence >= CRM_CONFIDENCE_THRESHOLD ? 'default' : 'outline'}>
                        confidence {h.confidence.toFixed(2)}
                      </Badge>
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-2 border-b p-3">
          <div>
            <h1 className="text-base font-semibold">AI Workspace</h1>
            <p className="text-xs text-muted-foreground">
              Scope: tim internal - semua entity CRM terlihat.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={showSources}
                onChange={(e) => setShowSources(e.target.checked)}
              />
              <span>Tampilkan sumber KB / CRM</span>
            </label>
            <Button size="sm" variant="outline" onClick={openFirstChat}>
              <MessageSquare className="mr-1 h-4 w-4" /> Buka chat contoh
              <ExternalLink className="ml-1 h-3 w-3" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onOpenAiSettings}
              disabled={drawerGuardOpen}
              aria-label="Atur AI"
            >
              <Settings className="mr-1 h-4 w-4" /> Atur AI
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {items.length === 0 ? (
            <Card className="border-dashed">
              <CardHeader>
                <CardTitle className="text-sm">Tanya AI</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>Scope tim internal - semua entity dan knowledge base terlihat.</p>
                <p>
                  Threshold keyakinan: <span className="font-mono">{CRM_CONFIDENCE_THRESHOLD}</span>
                </p>
                <p>
                  <Link to="/ai-chat" className="hover:underline">
                    /ai-chat
                  </Link>{' '}
                  tersedia sebagai alias.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {showSources && (
                <div className="mb-3 rounded border bg-muted/40 p-2 text-xs text-muted-foreground">
                  Breakdown sumber aktif. Setiap kartu jawaban akan menampilkan jumlah evidence per
                  tipe (KB / CRM).
                </div>
              )}
              <Transcript items={items} />
            </>
          )}
        </div>
        <div className="border-t bg-background p-3">
          <TeamAiComposer
            onAnswer={handleAnswer}
            seed={pendingSeed}
            onSeedConsumed={() => setPendingSeed('')}
          />
        </div>
      </main>
    </div>
  );
}
