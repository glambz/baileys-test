import { useState, useRef, useCallback, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MessageSquare, ExternalLink, Settings, Copy, RefreshCw, Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TeamAiComposer } from '@/components/ai/TeamAiComposer';
import { ToolCallCard } from '@/components/ai/ToolCallCard';
import { MarkdownAnswer } from '@/components/ai/MarkdownAnswer';
import { useChats } from '@/hooks/useChats';
import { useUiStore } from '@/stores/ui';
import { useChatStream } from '@/hooks/useChatStream';
import { useAiHistoryQuery, useAiHistoryAdd, useAiHistoryRemove } from '@/hooks/useAiHistory';
import type { ToolEvent } from '@/types/aiStream';
import { CRM_CONFIDENCE_THRESHOLD } from '@/lib/crm/zodFromSchema';

interface PendingTool {
  id: string;
  name: string;
  input: unknown;
  resultCount: number;
  retrievalScore?: number;
}

interface PendingAnswer {
  id: string;
  question: string;
  text: string;
  confidence: number;
  tools: PendingTool[];
  done: boolean;
  answerId?: number;
}

function exportToMarkdown(items: PendingAnswer[]): string {
  const lines: string[] = ['# AI Chat export', ''];
  for (const it of items) {
    lines.push(`## ${it.question}`);
    lines.push('');
    if (it.tools.length > 0) {
      lines.push(`**Tools:** ${it.tools.map((t) => t.name).join(', ')}`);
      lines.push('');
    }
    lines.push(it.text);
    if (it.confidence && it.confidence > 0) {
      lines.push('');
      lines.push(`_(confidence: ${it.confidence.toFixed(2)})_`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export default function AiWorkspacePage() {
  const [pending, setPending] = useState<PendingAnswer[]>([]);
  const [pendingSeed, setPendingSeed] = useState('');
  const [showSources, setShowSources] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const chatsQ = useChats();
  const navigate = useNavigate();
  const { start } = useChatStream();
  const history = useAiHistoryQuery();
  const addHistory = useAiHistoryAdd();
  const removeHistory = useAiHistoryRemove();
  const abortRef = useRef<(() => void) | null>(null);

  // Cleanup the SSE stream on unmount.
  useEffect(() => () => abortRef.current?.(), []);

  const openFirstChat = () => {
    const first = chatsQ.data?.[0];
    if (first) navigate(`/chats/${encodeURIComponent(first.id)}`);
  };

  const onOpenAiSettings = () => {
    useUiStore.getState().setPane1Selection('settings');
    navigate('/ai-settings');
  };

  const restoreFromHistory = (entry: { question: string }) => setPendingSeed(entry.question);

  const handleAsk = useCallback(
    async (question: string) => {
      const id = `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setStreamingId(id);
      setPending((prev) => [
        ...prev,
        { id, question, text: '', confidence: 0, tools: [], done: false },
      ]);

      const handle = await start(
        { question },
        {
          onTool: (t: ToolEvent) => {
            setPending((prev) =>
              prev.map((p) =>
                p.id === id
                  ? {
                      ...p,
                      tools: [
                        ...p.tools,
                        {
                          id: `${id}-t-${p.tools.length}`,
                          name: t.name,
                          input: t.input,
                          resultCount: t.resultCount,
                          retrievalScore: t.retrievalScore,
                        },
                      ],
                    }
                  : p
              )
            );
          },
          onChunk: (c) => {
            setPending((prev) =>
              prev.map((p) => (p.id === id ? { ...p, text: p.text + c.delta } : p))
            );
          },
          onDone: async (d) => {
            setPending((prev) =>
              prev.map((p) => (p.id === id ? { ...p, text: d.answer, confidence: d.confidence, done: true } : p))
            );
            setStreamingId(null);
            // Persist to history.
            try {
              await addHistory.mutateAsync({
                question,
                answer: d.answer,
                confidence: d.confidence,
                kind: d.kind,
                evidence: d.evidence ?? [],
              });
            } catch {
              // History persistence is best-effort; the answer is still shown.
            }
          },
          onError: (e) => {
            setPending((prev) =>
              prev.map((p) =>
                p.id === id
                  ? { ...p, text: e.message || 'Request failed', confidence: 0, done: true }
                  : p
              )
            );
            setStreamingId(null);
          },
        }
      );
      abortRef.current = handle.abort;
    },
    [start, addHistory]
  );

  const cancel = useCallback(() => abortRef.current?.(), []);

  const regenerate = useCallback(
    async (entry: PendingAnswer) => {
      // Remove the previous answer and re-ask.
      setPending((prev) => prev.filter((p) => p.id !== entry.id));
      await handleAsk(entry.question);
    },
    [handleAsk]
  );

  const copyAnswer = useCallback((text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
  }, []);

  const exportMarkdown = useCallback(() => {
    const md = exportToMarkdown(pending);
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(md).catch(() => {});
    }
  }, [pending]);

  // Derive TranscriptItem list from pending (so evidence bubbles reuse the
  // existing Transcript component).
  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* Reveals at lg, not md: the app shell already renders the rail
          and the chat list, so a third column at 768px pushed the main
          pane off-screen. */}
      <aside className="hidden w-80 shrink-0 flex-col border-r lg:flex">
        <div className="border-b p-3">
          <h2 className="font-medium">Riwayat pertanyaan</h2>
          <p className="text-xs text-muted-foreground">
            {history.data?.length ?? 0} pertanyaan (server-side).
          </p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {history.isLoading ? (
            <p className="p-4 text-xs text-muted-foreground">Memuat…</p>
          ) : (history.data?.length ?? 0) === 0 ? (
            <p className="p-4 text-xs text-muted-foreground">
              Belum ada pertanyaan. Tanyakan di kolom kanan.
            </p>
          ) : (
            <ul role="list" className="divide-y">
              {(history.data ?? []).map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => restoreFromHistory(h)}
                    className="block w-full p-3 text-left text-xs hover:bg-secondary/60"
                  >
                    <p className="truncate font-medium">{h.question}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{h.answer}</p>
                    <p className="mt-1 flex items-center gap-2 text-[11px]">
                      <Badge variant={h.confidence >= CRM_CONFIDENCE_THRESHOLD ? 'default' : 'outline'}>
                        confidence {h.confidence.toFixed(2)}
                      </Badge>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeHistory.mutate(h.id);
                        }}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Hapus dari riwayat"
                      >
                        ×
                      </button>
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        {/* The title column needs min-w-0 and the action cluster needs
            shrink-0, otherwise flex lets the buttons hold their intrinsic
            width and crush the heading into a two-word-per-line column. */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b p-3">
          {/* A floor on the title width makes the flex container wrap the
              action cluster onto its own row rather than truncating the
              heading to "AI Wor..." - the two sidebars leave this pane
              narrow even on a wide viewport, so viewport breakpoints
              alone do not describe the space available here. */}
          <div className="min-w-[11rem] flex-1">
            <h1 className="truncate text-base font-semibold">AI Workspace</h1>
            <p className="truncate text-xs text-muted-foreground">
              Scope: tim internal - semua entity CRM terlihat.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <div className="mr-1 flex items-center gap-2">
              <Switch
                id="show-tool-chips"
                checked={showSources}
                onCheckedChange={setShowSources}
              />
              <Label htmlFor="show-tool-chips" className="whitespace-nowrap text-xs font-normal">
                Tool chips
              </Label>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={exportMarkdown}
              disabled={pending.length === 0}
              aria-label="Export transcript to markdown"
            >
              <Download className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Export</span>
            </Button>
            <Button size="sm" variant="outline" onClick={openFirstChat}>
              <MessageSquare className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Buka chat contoh</span>
              <ExternalLink className="ml-1 hidden h-3 w-3 sm:inline" />
            </Button>
            <Button size="sm" variant="ghost" onClick={onOpenAiSettings} aria-label="Atur AI">
              <Settings className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Atur AI</span>
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {pending.length === 0 ? (
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
            <div className="space-y-4">
              {pending.map((p) => (
                <div key={p.id} className="space-y-2">
                  <div className="text-xs text-muted-foreground">Q: {p.question}</div>
                  {showSources && p.tools.length > 0 && (
                    <div className="space-y-1">
                      {p.tools.map((t) => (
                        <ToolCallCard key={t.id} {...t} />
                      ))}
                    </div>
                  )}
                  <div className="rounded-md border bg-muted/30 p-3">
                    <MarkdownAnswer text={p.text || (streamingId === p.id ? '…' : '...')} />
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {p.confidence > 0 && (
                      <Badge variant={p.confidence >= CRM_CONFIDENCE_THRESHOLD ? 'default' : 'outline'}>
                        confidence {p.confidence.toFixed(2)}
                      </Badge>
                    )}
                    {p.done && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyAnswer(p.text)}
                          aria-label="Copy answer"
                        >
                          <Copy className="mr-1 h-3 w-3" /> Copy
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => regenerate(p)}
                          aria-label="Regenerate"
                        >
                          <RefreshCw className="mr-1 h-3 w-3" /> Regenerate
                        </Button>
                      </>
                    )}
                    {streamingId === p.id && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={cancel}
                        aria-label="Cancel stream"
                      >
                        <X className="mr-1 h-3 w-3" /> Cancel
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="border-t bg-background p-3">
          <TeamAiComposer
            onAnswer={() => { /* unused: we use onAsk for streaming */ }}
            onAsk={handleAsk}
            seed={pendingSeed}
            onSeedConsumed={() => setPendingSeed('')}
          />
        </div>
      </main>
    </div>
  );
}
