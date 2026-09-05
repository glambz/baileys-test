import dayjs from 'dayjs';
import type { AskAiResponse, Chat, Message } from '@/types';
import { chats, contacts, messages as seededMessages, searchKnowledge } from './data';
import { AI_CONFIDENCE_THRESHOLD, MOCK_SEND_DELAY_MS } from '@/lib/config';
import { AI_FALLBACK_MESSAGE_ID } from '@/lib/ai/fallbackMessage';
import { CrmRoutes } from './crm';

/**
 * Mock endpoint handlers — each matches `(method, urlPath)` and returns
 * a `Response` with the appropriate JSON body. The shape mirrors
 * `docs/frontend/api/api-spec.md` §2.
 *
 * All mock-only fields are tagged with `/* mock-only *\/` per §3.
 */

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const errorResponse = (status: number, code: string, message: string): Response =>
  jsonResponse(status, { error: code, message });

const delay = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

type HandlerFn = (params: Record<string, string>, body: unknown, url: URL) => Response | Promise<Response>;

interface RouteEntry {
  /** HTTP method, uppercase. */
  method: string;
  /** Regex with capture groups matching the URL path (after `/api`). */
  pattern: RegExp;
  /** Maps capture-group indices to named param keys. */
  paramKeys: string[];
  handler: HandlerFn;
}

const routes: RouteEntry[] = [];

/** Register a route; `paramKeys[i]` becomes `params[paramKeys[i]]`. */
function register(
  method: string,
  pattern: RegExp,
  paramKeys: string[],
  handler: HandlerFn
): void {
  routes.push({ method, pattern, paramKeys, handler });
}

// ----- GET /api/chats -----
register('GET', /^\/chats$/, [], () => jsonResponse(200, { chats }));

// ----- GET /api/contacts -----
register('GET', /^\/contacts$/, [], () => jsonResponse(200, { contacts }));

// ----- GET /api/auth/status -----
register('GET', /^\/auth\/status$/, [], () =>
  jsonResponse(200, {
    connected: true,
    state: 'open',
    userJid: '6281234567890@s.whatsapp.net',
    userName: 'Indocyber Studio',
    lastUpdatedAt: dayjs().unix(),
  })
);

// ----- GET /api/chats/:id/messages -----
register('GET', /^\/chats\/([^/]+)\/messages$/, ['id'], (_params, _body, url) => {
  const chatId = decodeURIComponent(_params.id);
  const chat = chats.find((c) => c.id === chatId);
  if (!chat) return errorResponse(404, 'ChatNotFound', `Chat ${chatId} not found`);
  const list = seededMessages.get(chatId) ?? [];
  const limit = Number(url.searchParams.get('limit') ?? list.length) || list.length;
  const beforeParam = url.searchParams.get('before');
  const before = beforeParam ? Number(beforeParam) : undefined;
  let filtered = list;
  if (typeof before === 'number' && !Number.isNaN(before)) {
    filtered = list.filter((m) => m.timestamp < before);
  }
  const sliced = filtered.slice(-limit);
  const nextBefore = sliced.length > 0 ? sliced[0].timestamp : undefined;
  return jsonResponse(200, {
    chatId,
    messages: sliced,
    ...(typeof nextBefore === 'number' ? { nextBefore } : {}),
  });
});

// ----- POST /api/chats/:id/messages -----
register('POST', /^\/chats\/([^/]+)\/messages$/, ['id'], async (_params, body) => {
  const chatId = decodeURIComponent(_params.id);
  const payload = (body ?? {}) as { body?: unknown };
  const text = typeof payload.body === 'string' ? payload.body.trim() : '';
  if (!text || text.length > 4096) {
    return errorResponse(400, 'ValidationError', 'body must be 1–4096 chars after trim');
  }
  const chat = chats.find((c) => c.id === chatId);
  if (!chat) return errorResponse(404, 'ChatNotFound', `Chat ${chatId} not found`);
  await delay(MOCK_SEND_DELAY_MS); // mock-only artificial delay
  const id = `mock-msg-${dayjs().valueOf().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const message: Message = {
    id,
    chatId,
    direction: 'out',
    key: { remoteJid: chat.jid, fromMe: true },
    senderName: null,
    body: text,
    kind: 'text',
    caption: null,
    mime: null,
    timestamp: dayjs().unix(),
  };
  return jsonResponse(200, { message });
});

// ----- POST /api/ai/ask -----
register('POST', /^\/ai\/ask$/, [], (_params, body) => {
  const payload = (body ?? {}) as { question?: unknown; topK?: unknown };
  const question = typeof payload.question === 'string' ? payload.question.trim() : '';
  if (!question || question.length < 3 || question.length > 500) {
    return errorResponse(400, 'ValidationError', 'question must be 3–500 chars');
  }
  const topK = Math.min(5, Math.max(1, typeof payload.topK === 'number' ? payload.topK : 3));

  const hits = searchKnowledge(question, Math.max(topK, 3));
  const top = hits[0];

  if (!top || top.confidence < AI_CONFIDENCE_THRESHOLD) {
    const suggestion = hits[0]?.entry;
    const rejected = hits.slice(0, topK).map((h) => ({
      entryId: h.entry.id,
      confidence: Number(h.confidence.toFixed(3)),
    }));
    return jsonResponse(200, {
      kind: 'fallback',
      message: AI_FALLBACK_MESSAGE_ID,
      ...(suggestion
        ? {
            suggestion: {
              entryId: suggestion.id,
              question: suggestion.question,
              source: suggestion.source,
            },
          }
        : {}),
      rejectedCandidates: rejected,
    } satisfies Extract<AskAiResponse, { kind: 'fallback' }>);
  }

  const entry = top.entry;
  return jsonResponse(200, {
    kind: 'answered',
    answer: entry.answer,
    confidence: Number(top.confidence.toFixed(3)),
    evidence: [
      {
        entryId: entry.id,
        excerpt:
          entry.answer.length > 120
            ? entry.answer.slice(0, 117).replace(/\s+/g, ' ').trim() + '…'
            : entry.answer.replace(/\s+/g, ' ').trim(),
        source: entry.source,
        sourceUrl: entry.sourceUrl ?? null,
        confidence: Number(top.confidence.toFixed(3)),
      },
    ],
    generatedAt: dayjs().unix(),
    question,
  } satisfies Extract<AskAiResponse, { kind: 'answered' }>);
});

/**
 * Resolve an incoming fetch against the route table. Returns the
 * handler's Response or `null` if no route matches.
 */
export async function routeMockRequest(
  method: string,
  urlPath: string,
  url: URL,
  body: unknown
): Promise<Response | null> {
  const upper = method.toUpperCase();
  for (const r of routes) {
    if (r.method !== upper) continue;
    const m = urlPath.match(r.pattern);
    if (!m) continue;
    const params: Record<string, string> = {};
    r.paramKeys.forEach((key, idx) => {
      const value = m[idx + 1];
      if (typeof value === 'string') params[key] = decodeURIComponent(value);
    });
    return await r.handler(params, body, url);
  }
  // CRM module route table
  for (const r of CrmRoutes) {
    if (r.method !== upper) continue;
    const m = urlPath.match(r.pattern);
    if (!m) continue;
    const params: Record<string, string> = {};
    r.paramKeys.forEach((key, idx) => {
      const value = m[idx + 1];
      if (typeof value === 'string') params[key] = decodeURIComponent(value);
    });
    return await r.handler(params, body, url);
  }
  return errorResponse(404, 'NoMockHandler', `No mock handler for ${upper} ${urlPath}`);
}

export type { Chat };