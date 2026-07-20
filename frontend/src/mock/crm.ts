import dayjs from 'dayjs';
import { crmMock } from './crmStore';
import { AI_FALLBACK_MESSAGE_ID } from '@/lib/ai/fallbackMessage';
import { CRM_CONFIDENCE_THRESHOLD, getCachedValidator } from '@/lib/crm/zodFromSchema';
import { formatPhone } from '@/lib/config';
import type {
  AIReplyMode,
  CrmAskAiResponse,
  CrmRecord,
  CrmReplyPreview,
  EntityDefinition,
  EntityField,
  KnowledgeFile,
} from '@/types/crm';

const delay = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

// ----- SHA-256 chunker (Plan 05 MT-4) ---------------------------------
// Splits a knowledge file into deterministic chunks so re-uploading the
// same metadata produces the same chunks (count + stable hashes). Uses
// Web Crypto (`crypto.subtle.digest('SHA-256', …)`), which is available
// in both browser and Node 20+ runtimes; the mock therefore runs the
// same chunker regardless of host.
//
// Inputs are metadata-only on purpose: the production backend will
// replace the synthetic content with real text extraction; the mock
// deterministically derives a file-level fingerprint from the metadata
// so chunk hashes are stable across calls.

const CHUNK_MAX_CHARS = 2048;
const CHUNK_OVERLAP_CHARS = 50;
const CHUNK_HASH_PREFIX = 'sha256:';

interface ChunkableInput {
  name: string;
  size: number;
  mimeType: string;
}

export interface KnowledgeChunkSpec {
  index: number;
  text: string;
  hash: string;
}

function toHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    s += bytes[i].toString(16).padStart(2, '0');
  }
  return s;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBuffer);
  return toHex(new Uint8Array(digest));
}

/**
 * Deterministic file-content synthesis for the mock: identical
 * `(name, size, mimeType)` always produces the same string. The mock
 * has no real file body; the production backend (`Plan 09`) will
 * extract real text. Keeping it deterministic lets the test assert
 * equal chunk counts for equal inputs.
 */
function syntheticContent(name: string, size: number, mimeType: string, fileHash: string): string {
  const head = `[${mimeType}] ${name} :: sha256-prefix=${fileHash.slice(0, 12)}`;
  // Repeat a varied unit until `size` chars are reached, then trim.
  const unit = `${head}\nLorem ipsum dolor sit amet consectetur adipiscing elit. `;
  let buf = '';
  if (size <= head.length) return head.slice(0, size);
  while (buf.length < size) buf += unit;
  buf = head + buf;
  return buf.slice(0, size);
}

/**
 * Split a knowledge file (or its metadata) into deterministic chunks.
 * Each chunk's `hash` is `sha256(<fileHash>:<chunkIndex>)` so the
 * hashing is stable across calls.
 */
export async function chunkFile(input: ChunkableInput): Promise<KnowledgeChunkSpec[]> {
  const seed = new TextEncoder().encode(`${input.name}|${input.size}|${input.mimeType}`);
  const fileHash = await sha256Hex(seed);
  const text = syntheticContent(input.name, input.size, input.mimeType, fileHash);

  const chunks: KnowledgeChunkSpec[] = [];
  if (text.length === 0) {
    const hash = await sha256Hex(new TextEncoder().encode(`${fileHash}:0`));
    chunks.push({
      index: 0,
      text: `<chunk 0 of ${input.name} — content fingerprint: ${fileHash.slice(0, 12)}>`,
      hash: `${CHUNK_HASH_PREFIX}${hash}`,
    });
    return chunks;
  }

  let i = 0;
  let idx = 0;
  while (true) {
    const piece = text.slice(i, i + CHUNK_MAX_CHARS);
    if (!piece) break;
    const hash = await sha256Hex(new TextEncoder().encode(`${fileHash}:${idx}`));
    chunks.push({
      index: idx,
      text: piece,
      hash: `${CHUNK_HASH_PREFIX}${hash}`,
    });
    idx++;
    if (i + CHUNK_MAX_CHARS >= text.length) break;
    i += CHUNK_MAX_CHARS - CHUNK_OVERLAP_CHARS;
  }
  return chunks;
}

type CrmHandler = (
  params: Record<string, string>,
  body: unknown,
  url: URL
) => Response | Promise<Response>;

const CrmRoutes: Array<{ method: string; pattern: RegExp; paramKeys: string[]; handler: CrmHandler }> = [];

function register(method: string, pattern: RegExp, paramKeys: string[], handler: CrmHandler) {
  CrmRoutes.push({ method, pattern, paramKeys, handler });
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const err = (status: number, code: string, message: string, details?: unknown): Response =>
  json(status, details ? { error: code, message, details } : { error: code, message });

function pickEntityByName(name: string): EntityDefinition | undefined {
  return crmMock
    .getState()
    .entities.find((e) => e.name === name && !e.archivedAt);
}

function pickEntityById(id: string): EntityDefinition | undefined {
  return crmMock.getState().entities.find((e) => e.id === id);
}

function entityByPathName(pathname: string): string {
  return decodeURIComponent(pathname.match(/\/crm\/entities\/([^/?]+)/)?.[1] ?? '');
}

function nextVersion(entity: EntityDefinition): number {
  const hist = crmMock.getState().entityHistory[entity.id];
  if (hist && hist.length > 0) {
    return Math.max(...hist.map((r) => r.version)) + 1;
  }
  return entity.version + 1;
}

interface RecordWithArchive extends CrmRecord {
  archivedAt?: number;
}
function isArchived(r: CrmRecord): boolean {
  return Boolean((r as RecordWithArchive).archivedAt);
}

// ----- CRM Entity routes -----
register('GET', /^\/crm\/entities$/, [], async (_params, _body, _url) => {
  await delay(60);
  const entities = crmMock.getState().entities.filter((e) => !e.archivedAt);
  return json(200, { entities });
});

register(
  'GET',
  /^\/crm\/entities\/([^/]+)$/,
  ['name'],
  async (_params, _body, url) => {
    await delay(60);
    const ent = pickEntityByName(entityByPathName(url.pathname));
    if (!ent || ent.archivedAt) return err(404, 'EntityNotFound', 'entity not found');
    return json(200, ent);
  }
);

register(
  'GET',
  /^\/crm\/entities\/([^/]+)\/records$/,
  ['name'],
  async (_params, _body, url) => {
    await delay(80);
    const entityName = entityByPathName(url.pathname);
    const ent = pickEntityByName(entityName);
    if (!ent) return err(404, 'EntityNotFound', 'entity not found');
    const limit = Number(url.searchParams.get('limit') ?? '25') || 25;
    const offset = Number(url.searchParams.get('offset') ?? '0') || 0;
    const q = (url.searchParams.get('q') ?? '').toLowerCase().trim();
    const sort = url.searchParams.get('sort') ?? 'updatedAt:desc';

    const indexableFields = ent.schemaJson.fields.filter((f) => f.indexable);
    let rows = crmMock.getState().records.filter(
      (r) => r.entityName === entityName && !isArchived(r)
    );

    if (q && indexableFields.length > 0) {
      rows = rows.filter((row) =>
        indexableFields.some((f) => {
          const v = row.data?.[f.name];
          if (typeof v !== 'string') return false;
          return v.toLowerCase().includes(q);
        })
      );
    }

    rows = sortRows(rows, sort);

    const total = rows.length;
    const sliced = rows.slice(offset, offset + limit);
    return json(200, { records: sliced, total, limit, offset });
  }
);

register(
  'POST',
  /^\/crm\/entities\/([^/]+)\/records$/,
  ['name'],
  async (_params, body, url) => {
    await delay(100);
    const entityName = entityByPathName(url.pathname);
    const ent = pickEntityByName(entityName);
    if (!ent) return err(404, 'EntityNotFound', 'entity not found');

    const payload = (body ?? {}) as {
      data?: Record<string, unknown>;
      contactId?: string | null;
    };
    const validator = getCachedValidator(ent);
    const parsed = validator.safeParse(payload.data ?? {});
    if (!parsed.success) {
      return err(400, 'ValidationError', 'Record validation failed', parsed.error.flatten());
    }
    const now = dayjs().unix();
    const rec: CrmRecord = {
      id: `mock-rec-${Math.random().toString(36).slice(2, 10)}`,
      entityId: ent.id,
      entityName: ent.name,
      contactId: payload.contactId ?? null,
      data: parsed.data as Record<string, unknown>,
      createdAt: now,
      updatedAt: now,
    };
    crmMock.addRecord(rec);
    return json(201, rec);
  }
);

register(
  'PATCH',
  /^\/crm\/records\/([^/]+)$/,
  ['id'],
  async (_params, body, url) => {
    await delay(80);
    const id = decodeURIComponent(url.pathname.match(/\/crm\/records\/([^/?]+)/)?.[1] ?? '');
    const r = crmMock.getState().records.find((x) => x.id === id);
    if (!r) return err(404, 'RecordNotFound', 'record not found');
    const ent = pickEntityByName(r.entityName);
    if (!ent) return err(404, 'EntityNotFound', 'entity not found');
    const payload = (body ?? {}) as { data?: Record<string, unknown> };
    const validator = getCachedValidator(ent);
    const merged = { ...r.data, ...payload.data };
    const parsed = validator.safeParse(merged);
    if (!parsed.success) {
      return err(400, 'ValidationError', 'Record validation failed', parsed.error.flatten());
    }
    const updated: CrmRecord = {
      ...r,
      data: parsed.data as Record<string, unknown>,
      updatedAt: dayjs().unix(),
    };
    crmMock.updateRecord(updated);
    return json(200, updated);
  }
);

register(
  'DELETE',
  /^\/crm\/records\/([^/]+)$/,
  ['id'],
  async (_params, _body, url) => {
    await delay(60);
    const id = decodeURIComponent(url.pathname.match(/\/crm\/records\/([^/?]+)/)?.[1] ?? '');
    const r = crmMock.getState().records.find((x) => x.id === id);
    if (!r) return err(404, 'RecordNotFound', 'record not found');
    crmMock.deleteRecord(id);
    return json(200, { ok: true });
  }
);

register('POST', /^\/crm\/entities$/, [], async (_params, body) => {
  await delay(120);
  const payload = (body ?? {}) as Partial<EntityDefinition>;
  if (!payload.name || !payload.label) {
    return err(400, 'ValidationError', 'name and label are required');
  }
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(payload.name)) {
    return err(400, 'ValidationError', 'name must match ^[a-z][a-z0-9_]{0,63}$');
  }
  if (pickEntityByName(payload.name)) {
    return err(400, 'ValidationError', 'entity name already exists');
  }
  const now = dayjs().unix();
  const ent: EntityDefinition = {
    id: `mock-ent-${Math.random().toString(36).slice(2, 10)}`,
    name: payload.name,
    label: payload.label,
    icon: payload.icon ?? 'Database',
    description: payload.description ?? null,
    schemaJson: payload.schemaJson ?? { fields: [], relations: [] },
    version: 1,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  };
  crmMock.addEntity(ent);
  return json(201, ent);
});

register(
  'PATCH',
  /^\/crm\/entities\/([^/]+)$/,
  ['id'],
  async (_params, body, url) => {
    await delay(120);
    const idOrName = entityByPathName(url.pathname);
    const existing = pickEntityById(idOrName) ?? pickEntityByName(idOrName);
    if (!existing) return err(404, 'EntityNotFound', 'entity not found');
    const payload = (body ?? {}) as Partial<EntityDefinition>;
    if (payload.schemaJson) {
      for (const f of payload.schemaJson.fields as EntityField[]) {
        if (!/^[a-z][a-z0-9_]{0,63}$/.test(f.name)) {
          return err(400, 'ValidationError', `Field name invalid: ${f.name}`);
        }
      }
    }
    const next: EntityDefinition = {
      ...existing,
      label: payload.label ?? existing.label,
      icon: payload.icon ?? existing.icon,
      description: payload.description ?? existing.description,
      schemaJson: payload.schemaJson ?? existing.schemaJson,
      version: nextVersion(existing),
      updatedAt: dayjs().unix(),
    };
    crmMock.updateEntity(next);
    return json(200, next);
  }
);

register(
  'DELETE',
  /^\/crm\/entities\/([^/]+)$/,
  ['id'],
  async (_params, _body, url) => {
    await delay(80);
    const idOrName = entityByPathName(url.pathname);
    const existing = pickEntityById(idOrName) ?? pickEntityByName(idOrName);
    if (!existing) return err(404, 'EntityNotFound', 'entity not found');
    const records = crmMock.getState().records.filter((r) => r.entityName === existing.name);
    if (records.length > 0) {
      return err(
        400,
        'ValidationError',
        'Archive instead; records depend on this entity.',
        { recordCount: records.length }
      );
    }
    crmMock.archiveEntity(existing.id);
    return json(200, { ok: true });
  }
);

// ----- CRM Knowledge routes -----
register(
  'GET',
  /^\/crm\/knowledge\/files$/,
  [],
  async (_params, _body, url) => {
    await delay(80);
    const entityId = url.searchParams.get('entityId');
    const items = crmMock
      .getState()
      .knowledge.filter((k) => (entityId ? k.entityId === entityId : true));
    return json(200, { files: items });
  }
);

register('POST', /^\/crm\/knowledge\/files$/, [], async (_params, body) => {
  await delay(400);
  const payload = (body ?? {}) as Partial<KnowledgeFile> & {
    filename?: string;
    size?: number;
    mimeType?: string;
  };
  if (!payload.filename || typeof payload.size !== 'number' || !payload.mimeType) {
    return err(400, 'ValidationError', 'filename, mimeType, size required');
  }
  const id = `mock-kf-${Math.random().toString(36).slice(2, 10)}`;
  const file: KnowledgeFile = {
    id,
    filename: payload.filename,
    mimeType: payload.mimeType,
    size: payload.size,
    status: 'pending',
    chunksCount: 0,
    ingestedAt: null,
    entityId: payload.entityId ?? null,
    uploadedAt: dayjs().unix(),
  };
  crmMock.addKnowledgeFile(file);

  // Plan 05 MT-4 — real SHA-256 chunker; UX status lifecycle remains
  // setTimeout-driven, but `chunksCount` is now derived from the
  // input file via Web Crypto SHA-256.
  const inputMeta = {
    name: payload.filename,
    size: payload.size,
    mimeType: payload.mimeType,
  };
  setTimeout(() => {
    void chunkFile(inputMeta)
      .then((chunks) => {
        crmMock.updateKnowledgeFile(id, { status: 'chunked', chunksCount: chunks.length });
        setTimeout(() => {
          crmMock.updateKnowledgeFile(id, {
            status: 'embedded',
            chunksCount: chunks.length,
            ingestedAt: dayjs().unix(),
          });
        }, 200);
      })
      .catch((err) => {
        // Chunk failure → file stays in `chunked` is wrong; mark as
        // `failed` with the error message (see SSoT status enum).
        crmMock.updateKnowledgeFile(id, {
          status: 'failed',
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      });
  }, 100);

  return json(201, { file });
});

register(
  'POST',
  /^\/crm\/knowledge\/files\/([^/]+)\/reembed$/,
  ['id'],
  async (_params, _body, url) => {
    await delay(60);
    const id = decodeURIComponent(
      url.pathname.match(/\/crm\/knowledge\/files\/([^/?]+)\/reembed/)?.[1] ?? ''
    );
    const file = crmMock.getState().knowledge.find((x) => x.id === id);
    if (!file) return err(404, 'FileNotFound', 'file not found');
    crmMock.updateKnowledgeFile(id, { status: 'pending', chunksCount: 0, ingestedAt: null });
    const inputMeta = { name: file.filename, size: file.size, mimeType: file.mimeType };
    setTimeout(() => {
      void chunkFile(inputMeta)
        .then((chunks) => {
          crmMock.updateKnowledgeFile(id, { status: 'chunked', chunksCount: chunks.length });
          setTimeout(() => {
            crmMock.updateKnowledgeFile(id, {
              status: 'embedded',
              chunksCount: chunks.length,
              ingestedAt: dayjs().unix(),
            });
          }, 200);
        })
        .catch((err) => {
          crmMock.updateKnowledgeFile(id, {
            status: 'failed',
            errorMessage: err instanceof Error ? err.message : String(err),
          });
        });
    }, 100);
    return json(200, file);
  }
);

register(
  'DELETE',
  /^\/crm\/knowledge\/files\/([^/]+)$/,
  ['id'],
  async (_params, _body, url) => {
    await delay(60);
    const id = decodeURIComponent(
      url.pathname.match(/\/crm\/knowledge\/files\/([^/?]+)/)?.[1] ?? ''
    );
    crmMock.removeKnowledgeFile(id);
    return json(200, { ok: true });
  }
);

// ----- CRM AI routes -----
// Future BE: prepend `buildSystemPrompt({ tenantName, language: 'id' })` to the
// retrieved CONTEXT block before calling the LLM. See
// `docs/crm/features/ai-chat/systemPrompt.md` and
// `frontend/src/lib/ai/systemPrompt.ts`.
//
// Plan 13 — the AI Settings feature is wired through this endpoint.
// The handler now reads `body.settings.language` and emits answer
// text in the matching language. The handler also echoes the
// `systemPrompt` it received as `systemPromptEcho` so tests can assert
// byte-equivalence of the composed prompt (base + fragment +
// hardened). The hardened block is one of the two layers enforcing
// the cross-contact leak guard — see `docs/crm/features/ai-autoreply/spec.md`
// §5 table (defense-in-depth).
register('POST', /^\/crm\/ai\/ask$/, [], async (_params, body) => {
  await delay(120);
  const payload = (body ?? {}) as {
    question?: string;
    systemPrompt?: string;
    settings?: {
      language?: 'id' | 'en' | 'id-mod';
      whatsappAutoReply?: { confidenceThreshold?: number };
    };
  };
  const question = typeof payload.question === 'string' ? payload.question.trim() : '';
  if (question.length < 3 || question.length > 500) {
    return err(400, 'ValidationError', 'question must be 3-500 chars');
  }
  const language = payload.settings?.language ?? 'id';
  const systemPromptEcho = typeof payload.systemPrompt === 'string' ? payload.systemPrompt : '';

  const q = question.toLowerCase();
  const tokens = new Set(q.split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 2));
  const records = crmMock.getState().records.filter((r) => !isArchived(r));
  const scored = records
    .map((r) => {
      let hits = 0;
      for (const v of Object.values(r.data)) {
        if (typeof v === 'string') {
          for (const tok of tokens) if (v.toLowerCase().includes(tok)) hits++;
        }
      }
      return { r, hits };
    })
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 3);

  if (scored.length === 0) {
    const fb =
      language === 'en'
        ? {
            kind: 'fallback' as const,
            message: "Sorry, I don't have confident enough information to answer that.",
          }
        : { kind: 'fallback' as const, message: AI_FALLBACK_MESSAGE_ID };
    return json(200, { ...fb, systemPromptEcho });
  }

  const top = scored[0];
  const confidence = Math.min(1, 0.6 + top.hits * 0.05);
  const topLabel = top.r.data['title'] ?? top.r.data['name'] ?? top.r.id;
  const baseAnswer =
    language === 'en'
      ? `Here is what I found in your CRM data: ${topLabel}.`
      : language === 'id-mod'
        ? `[Modern] Berikut yang saya temukan di data CRM Anda: ${topLabel}.`
        : `Berikut yang saya temukan di data CRM Anda: ${topLabel}.`;
  const answer: CrmAskAiResponse = {
    kind: 'answered',
    answer: baseAnswer,
    confidence: Number(confidence.toFixed(3)),
    evidence: scored.map((s) => ({
      kind: 'record' as const,
      recordId: s.r.id,
      excerpt: JSON.stringify(s.r.data).slice(0, 110),
      source: s.r.entityName,
      contactId: s.r.contactId ?? null,
      confidence: Number((0.5 + s.hits * 0.05).toFixed(3)),
    })),
    generatedAt: dayjs().unix(),
    question,
  };
  return json(200, { ...answer, systemPromptEcho });
});

register('POST', /^\/crm\/ai\/toggle-mode$/, [], async (_params, body) => {
  await delay(40);
  const payload = (body ?? {}) as { chatId?: string; mode?: string };
  if (!payload.chatId) return err(400, 'ValidationError', 'chatId required');
  if (payload.mode !== 'ai' && payload.mode !== 'human') {
    return err(400, 'ValidationError', 'Invalid mode');
  }
  crmMock.setChatMode(payload.chatId, payload.mode);
  return json(200, { chatId: payload.chatId, mode: payload.mode });
});

register('POST', /^\/crm\/ai\/reply-preview$/, [], async (_params, body) => {
  await delay(120);
  const payload = (body ?? {}) as { chatId?: string; message?: string };
  if (!payload.chatId || typeof payload.message !== 'string') {
    return err(400, 'ValidationError', 'chatId and message required');
  }
  const { chats, contacts } = await import('./data');
  const chat = chats.find((c) => c.id === payload.chatId);
  if (!chat) return err(404, 'ChatNotFound', 'chat not found');
  const senderPn = chat.phone || '';

  const q = payload.message.toLowerCase();
  const tokens = new Set(q.split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 2));

  // HARD contact filter (plan 02 task 3 / spec 5.2): r.contact_id = chat.contact_id
  const records = crmMock
    .getState()
    .records.filter((r) => !isArchived(r) && r.contactId === senderPn);
  const scored = records
    .map((r) => {
      let hits = 0;
      for (const v of Object.values(r.data)) {
        if (typeof v === 'string') {
          for (const tok of tokens) if (v.toLowerCase().includes(tok)) hits++;
        }
      }
      return { r, hits };
    })
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 3);

  void contacts;

  if (scored.length === 0) {
    const out: CrmReplyPreview = {
      answer: AI_FALLBACK_MESSAGE_ID,
      confidence: 0.2,
      evidence: [],
      would_send: false,
      reason: 'Tidak ada record CRM milik kontak ini yang cocok.',
    };
    return json(200, out);
  }
  const confidence = Math.min(1, 0.6 + scored[0].hits * 0.05);
  const replyBody: CrmReplyPreview = {
    answer: `Untuk ${chat.phone ? formatPhone(chat.phone) : 'Anda'}: ${scored[0].r.data['title'] ?? scored[0].r.data['name'] ?? 'data ditemukan'}`,
    confidence: Number(confidence.toFixed(3)),
    evidence: scored.map((s) => ({
      kind: 'record' as const,
      recordId: s.r.id,
      excerpt: JSON.stringify(s.r.data).slice(0, 110),
      source: s.r.entityName,
      contactId: s.r.contactId ?? null,
      confidence: Number((0.5 + s.hits * 0.05).toFixed(3)),
    })),
    would_send: confidence >= CRM_CONFIDENCE_THRESHOLD,
    reason:
      confidence < CRM_CONFIDENCE_THRESHOLD
        ? `Confidence ${confidence.toFixed(2)} di bawah threshold ${CRM_CONFIDENCE_THRESHOLD}.`
        : null,
  };
  return json(200, replyBody);
});

// ----- Chats (Plan 06: returns aiMode for each chat) -----
register('GET', /^\/crm\/chats\/modes$/, [], async () => {
  await delay(40);
  const { chats } = await import('./data');
  const modes: Record<string, AIReplyMode> = {};
  for (const c of chats) {
    modes[c.id] = crmMock.getState().chatModes[c.id] ?? 'ai';
  }
  return json(200, { modes });
});

function sortRows(rows: CrmRecord[], sort: string): CrmRecord[] {
  const [field, dir] = sort.split(':');
  const desc = dir !== 'asc';
  const copy = [...rows];
  copy.sort((a, b) => {
    let av: unknown;
    let bv: unknown;
    if (field === 'updatedAt') {
      av = a.updatedAt;
      bv = b.updatedAt;
    } else {
      av = a.data?.[field];
      bv = b.data?.[field];
    }
    if (typeof av === 'number' && typeof bv === 'number') {
      return desc ? bv - av : av - bv;
    }
    if (typeof av === 'string' && typeof bv === 'string') {
      return desc ? bv.localeCompare(av) : av.localeCompare(bv);
    }
    return 0;
  });
  return copy;
}

export { CrmRoutes };
