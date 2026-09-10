/**
 * Pure SSE stream runner (testable in node, no React).
 * Source: docs/specs/2026-08-18-in-app-ai-chat-polish.md
 */
import type {
  StreamCallbacks,
  StreamHandle,
  StreamInput,
  ToolEvent,
  ChunkEvent,
  DoneEvent,
  ErrorEvent,
} from '@/types/aiStream';

export function parseSseFrame(raw: string): { event?: string; data?: string } | null {
  const lines = raw.split('\n');
  let event: string | undefined;
  let data: string | undefined;
  for (const line of lines) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data = (data ?? '') + line.slice(5).trim();
  }
  if (!event && !data) return null;
  return { event, data };
}

export async function runChatStream(
  input: StreamInput,
  cb: StreamCallbacks,
  fetchFn: typeof fetch = fetch
): Promise<StreamHandle> {
  const ctrl = new AbortController();
  if (input.signal) {
    input.signal.addEventListener('abort', () => ctrl.abort(), { once: true });
  }

  let res: Response;
  try {
    res = await fetchFn('/api/crm/ai/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        question: input.question,
        history: input.history ?? [],
        topK: input.topK ?? 5,
      }),
      signal: ctrl.signal,
    });
  } catch (err) {
    cb.onError?.({ message: (err as Error).message || 'NetworkError' });
    return { abort: () => ctrl.abort() };
  }

  if (!res.ok || !res.body) {
    cb.onError?.({ message: `HTTP ${res.status}` });
    return { abort: () => ctrl.abort() };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let closed = false;

  const pump = async () => {
    try {
      while (!closed) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sep: number;
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const parsed = parseSseFrame(frame);
          if (!parsed || !parsed.event) continue;
          let payload: unknown = null;
          if (parsed.data) {
            try { payload = JSON.parse(parsed.data); } catch { payload = parsed.data; }
          }
          switch (parsed.event) {
            case 'tool':
              cb.onTool?.(payload as ToolEvent);
              break;
            case 'chunk':
              cb.onChunk?.(payload as ChunkEvent);
              break;
            case 'done':
              cb.onDone?.(payload as DoneEvent);
              closed = true;
              break;
            case 'error':
              cb.onError?.(payload as ErrorEvent);
              closed = true;
              break;
          }
        }
      }
    } catch (err) {
      if (!closed) cb.onError?.({ message: (err as Error).message || 'StreamError' });
    } finally {
      try { reader.releaseLock(); } catch { /* noop */ }
    }
  };

  void pump();
  return { abort: () => ctrl.abort() };
}
