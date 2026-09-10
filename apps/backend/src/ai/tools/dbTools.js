'use strict';
/**
 * Read-only database tools, available to BOTH AI functions at different
 * reach.
 *
 * The auto-reply and the internal chat are different functions with opposite
 * requirements, and they must not share a data envelope:
 *
 *   - `internal` scope — the in-app assistant, used by staff. Sees
 *     everything: every chat of the connected account, every CRM record,
 *     the whole knowledge base, and aggregates over all of it.
 *   - `chat` scope — the WhatsApp auto-reply, answering ONE contact. Sees
 *     only that conversation's messages and only CRM records belonging to
 *     that contact, plus knowledge the retrieval layer already deems
 *     visible to the chat. It cannot read another customer's data, cannot
 *     list conversations, and cannot enumerate internal file names.
 *
 * Scope is enforced HERE, in `runTool`, not by asking the model nicely. A
 * chat-scoped call physically cannot produce another contact's rows: the
 * filters are appended server-side after argument validation, and the tools
 * that make no sense customer-facing are refused outright.
 *
 * Every tool is also:
 *   - READ ONLY. No INSERT/UPDATE/DELETE. No model output is ever
 *     interpolated into SQL — table and operator names come from fixed
 *     allowlists in this file, every value is a bound parameter.
 *   - BOUNDED. Row counts capped, text truncated, so one question cannot
 *     pull the database into a prompt.
 *   - ACCOUNT-SCOPED for chats and messages (migration 014), so no linked
 *     account ever sees another's conversations.
 */
const { z } = require('zod');
const { getPool } = require('../../db/client');
const { currentAccountId } = require('../../whatsapp/account');
const { hybridRetrieval } = require('../retrieval/hybrid');

const MAX_ROWS = 50;
const MAX_TEXT = 400;

/** The two reach levels. */
const SCOPE_INTERNAL = 'internal';
const SCOPE_CHAT = 'chat';

function truncate(v, n = MAX_TEXT) {
  if (v === null || v === undefined) return null;
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function clampLimit(n, fallback = 20) {
  const v = Number.isFinite(n) ? Math.floor(n) : fallback;
  return Math.min(Math.max(v, 1), MAX_ROWS);
}

/**
 * The contact's phone as `entity_records.contact_id` stores it: bare digits.
 *
 * Derived from the chat JID rather than `chats.phone`, because that column is
 * unreliable in practice — some rows hold '' and others '+6289...' — whereas
 * the JID is always `<digits>@s.whatsapp.net`.
 */
function contactPhoneFromChatId(chatId) {
  if (!chatId) return null;
  const bare = String(chatId).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
  return bare.length >= 8 ? bare : null;
}

const OPERATORS = Object.freeze({
  eq: '=',
  ne: '<>',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  contains: 'ILIKE',
});

/** Build the WHERE fragments for a filter list. Values are always bound. */
function applyFilters(filters, params, where) {
  for (const f of filters || []) {
    const sqlOp = OPERATORS[f.op];
    const numeric = typeof f.value === 'number';
    params.push(f.field);
    const fieldIdx = params.length;
    params.push(f.op === 'contains' ? `%${f.value}%` : String(f.value));
    const valIdx = params.length;
    where.push(
      numeric && f.op !== 'contains'
        ? `NULLIF(data->>$${fieldIdx}, '')::numeric ${sqlOp} $${valIdx}::numeric`
        : `data->>$${fieldIdx} ${sqlOp} $${valIdx}`
    );
  }
}

async function resolveEntity(pool, key) {
  const r = await pool.query(
    `SELECT id, name, label, schema_json FROM entity_definitions
      WHERE deleted_at IS NULL AND (id = $1 OR name = $1)
      ORDER BY (id = $1) DESC, version DESC
      LIMIT 1`,
    [key]
  );
  return r.rows[0] || null;
}

// ---------------------------------------------------------------------------
const listEntitiesArgs = z.object({}).passthrough();

async function listEntities(_args, scope) {
  const pool = getPool();
  const r = await pool.query(
    `SELECT e.id, e.name, e.label, e.description, e.schema_json,
            (SELECT count(*)::int FROM entity_records r WHERE r.entity_id = e.id) AS record_count
       FROM entity_definitions e
      WHERE e.deleted_at IS NULL
      ORDER BY e.name
      LIMIT $1`,
    [MAX_ROWS]
  );
  return {
    entities: r.rows.map((row) => ({
      id: row.id,
      name: row.name,
      label: row.label,
      description: row.description,
      // Under chat scope the tenant-wide count is not this contact's
      // business, and leaking it tells a customer how many customers exist.
      recordCount: scope.mode === SCOPE_INTERNAL ? row.record_count : undefined,
      fields: ((row.schema_json && row.schema_json.fields) || []).map((f) => ({
        name: f.name,
        type: f.type,
        label: f.label,
      })),
    })),
  };
}

// ---------------------------------------------------------------------------
const queryRecordsArgs = z.object({
  entity: z.string().min(1),
  filters: z
    .array(
      z.object({
        field: z.string().min(1),
        op: z.enum(Object.keys(OPERATORS)),
        value: z.union([z.string(), z.number(), z.boolean()]),
      })
    )
    .max(5)
    .optional(),
  limit: z.number().int().optional(),
  orderBy: z.string().optional(),
  direction: z.enum(['asc', 'desc']).optional(),
});

async function queryRecords(args, scope) {
  const pool = getPool();
  const entity = await resolveEntity(pool, args.entity);
  if (!entity) {
    return { error: `No entity named "${args.entity}". Call list_entities first.` };
  }

  const params = [entity.id];
  const where = ['entity_id = $1'];

  // Server-side scope clamp. Appended after validation so no argument the
  // model supplies can widen it.
  if (scope.mode === SCOPE_CHAT) {
    if (!scope.contactPhone) {
      return { error: 'This conversation is not linked to a contact, so no records are visible.' };
    }
    params.push(scope.contactPhone);
    where.push(`contact_id = $${params.length}`);
  }

  applyFilters(args.filters, params, where);

  let orderSql = 'created_at DESC';
  if (args.orderBy) {
    params.push(args.orderBy);
    orderSql = `data->>$${params.length} ${args.direction === 'asc' ? 'ASC' : 'DESC'}`;
  }

  const limit = clampLimit(args.limit);
  params.push(limit);

  const r = await pool.query(
    `SELECT id, contact_id, data, created_at
       FROM entity_records
      WHERE ${where.join(' AND ')}
      ORDER BY ${orderSql}
      LIMIT $${params.length}`,
    params
  );
  return {
    entity: { id: entity.id, name: entity.name, label: entity.label },
    scope: scope.mode,
    rowCount: r.rows.length,
    records: r.rows.map((row) => ({
      id: row.id,
      contactId: row.contact_id,
      data: row.data,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    })),
  };
}

// ---------------------------------------------------------------------------
const aggregateRecordsArgs = z.object({
  entity: z.string().min(1),
  op: z.enum(['count', 'sum', 'avg', 'min', 'max']),
  field: z.string().optional(),
  filters: queryRecordsArgs.shape.filters,
});

async function aggregateRecords(args, scope) {
  const pool = getPool();
  const entity = await resolveEntity(pool, args.entity);
  if (!entity) {
    return { error: `No entity named "${args.entity}". Call list_entities first.` };
  }
  if (args.op !== 'count' && !args.field) {
    return { error: `op "${args.op}" needs a numeric \`field\`.` };
  }

  const params = [entity.id];
  const where = ['entity_id = $1'];
  if (scope.mode === SCOPE_CHAT) {
    if (!scope.contactPhone) {
      return { error: 'This conversation is not linked to a contact, so no records are visible.' };
    }
    params.push(scope.contactPhone);
    where.push(`contact_id = $${params.length}`);
  }
  applyFilters(args.filters, params, where);

  let selectSql = 'count(*)::numeric AS value';
  if (args.op !== 'count') {
    params.push(args.field);
    // The function name comes from the zod enum, never raw model text.
    selectSql = `${args.op}(NULLIF(data->>$${params.length}, '')::numeric) AS value`;
  }

  const r = await pool.query(
    `SELECT ${selectSql} FROM entity_records WHERE ${where.join(' AND ')}`,
    params
  );
  const raw = r.rows[0] && r.rows[0].value;
  return {
    entity: entity.name,
    scope: scope.mode,
    op: args.op,
    field: args.field || null,
    value: raw === null || raw === undefined ? null : Number(raw),
  };
}

// ---------------------------------------------------------------------------
const listChatsArgs = z.object({
  aiMode: z.enum(['ai', 'human', 'human_pending_flag']).optional(),
  needsHuman: z.boolean().optional(),
  limit: z.number().int().optional(),
});

async function listChats(args) {
  const pool = getPool();
  const account = currentAccountId() || '';
  const params = [account];
  const where = ['account_jid = $1'];

  const mode = args.needsHuman ? 'human_pending_flag' : args.aiMode;
  if (mode) {
    params.push(mode);
    where.push(`ai_mode = $${params.length}`);
  }
  const limit = clampLimit(args.limit);
  params.push(limit);

  const r = await pool.query(
    `SELECT id, phone, ai_mode, last_message_preview, last_message_at,
            unread_count, escalation_reason, escalation_at,
            (SELECT count(*)::int FROM messages m
              WHERE m.chat_id = c.id AND m.account_jid = c.account_jid) AS message_count
       FROM chats c
      WHERE ${where.join(' AND ')}
      ORDER BY last_message_at DESC NULLS LAST
      LIMIT $${params.length}`,
    params
  );
  return {
    account: account || null,
    rowCount: r.rows.length,
    chats: r.rows.map((row) => ({
      chatId: row.id,
      phone: row.phone,
      aiMode: row.ai_mode,
      lastMessage: truncate(row.last_message_preview, 160),
      lastMessageAt: Number(row.last_message_at || 0),
      unread: row.unread_count,
      messageCount: row.message_count,
      escalationReason: row.escalation_reason,
      escalatedAt: Number(row.escalation_at || 0) || null,
    })),
  };
}

// ---------------------------------------------------------------------------
const searchMessagesArgs = z.object({
  query: z.string().optional(),
  chatId: z.string().optional(),
  direction: z.enum(['in', 'out']).optional(),
  limit: z.number().int().optional(),
});

async function searchMessages(args, scope) {
  const pool = getPool();
  const account = currentAccountId() || '';
  const params = [account];
  const where = ['account_jid = $1'];

  // Chat scope pins the conversation to THIS one, ignoring any chatId the
  // model passed. Internal scope may target a chat or search across all.
  const chatId = scope.mode === SCOPE_CHAT ? scope.chatId : args.chatId;
  if (chatId) {
    params.push(chatId);
    where.push(`chat_id = $${params.length}`);
  }
  if (args.query) {
    params.push(`%${args.query}%`);
    where.push(`body ILIKE $${params.length}`);
  }
  if (args.direction) {
    params.push(args.direction);
    where.push(`direction = $${params.length}`);
  }
  const limit = clampLimit(args.limit);
  params.push(limit);

  const r = await pool.query(
    `SELECT chat_id, direction, body, sender_name, timestamp
       FROM messages
      WHERE ${where.join(' AND ')}
      ORDER BY timestamp DESC
      LIMIT $${params.length}`,
    params
  );
  return {
    scope: scope.mode,
    chatId: chatId || null,
    rowCount: r.rows.length,
    messages: r.rows.map((row) => ({
      chatId: row.chat_id,
      direction: row.direction,
      sender: row.sender_name,
      body: truncate(row.body),
      timestamp: Number(row.timestamp || 0),
    })),
  };
}

// ---------------------------------------------------------------------------
const searchKnowledgeArgs = z.object({
  query: z.string().min(1),
  topK: z.number().int().optional(),
});

async function searchKnowledge(args, scope) {
  // Reuse the retrieval layer's own scoping: 'whatsapp' + chatId restricts to
  // this chat's chunks plus globally-visible ones, which is exactly the
  // envelope the auto-reply already had.
  const isChat = scope.mode === SCOPE_CHAT;
  const { chunks, retrievalScore } = await hybridRetrieval({
    query: args.query,
    scope: isChat ? 'whatsapp' : 'team',
    chatId: isChat ? scope.chatId : null,
    contactPhone: isChat ? scope.contactPhone : undefined,
    topK: clampLimit(args.topK, 6),
  });
  return {
    scope: scope.mode,
    retrievalScore,
    rowCount: chunks.length,
    results: chunks.map((c) => ({
      id: c.chunk && c.chunk.id,
      source: c.chunk && c.chunk.recordId ? 'crm_record' : 'knowledge_file',
      text: truncate(c.chunk && c.chunk.text),
      score: c.score,
    })),
  };
}

// ---------------------------------------------------------------------------
const listKnowledgeFilesArgs = z.object({ limit: z.number().int().optional() });

async function listKnowledgeFiles(args) {
  const pool = getPool();
  const limit = clampLimit(args.limit);
  const r = await pool.query(
    `SELECT filename, mime_type, status, chunks_count, last_error
       FROM knowledge_files
      ORDER BY created_at DESC
      LIMIT $1`,
    [limit]
  );
  return {
    rowCount: r.rows.length,
    files: r.rows.map((row) => ({
      filename: row.filename,
      mimeType: row.mime_type,
      status: row.status,
      chunks: row.chunks_count,
      error: row.last_error,
    })),
  };
}

// ---------------------------------------------------------------------------
// Registry. `scopes` is the allowlist — a tool missing the caller's scope is
// refused by runTool before it can touch the database.
// ---------------------------------------------------------------------------
const TOOLS = Object.freeze({
  list_entities: {
    scopes: [SCOPE_INTERNAL, SCOPE_CHAT],
    args: listEntitiesArgs,
    run: listEntities,
    description:
      'List CRM entities and their fields. Call this first when a question involves CRM data but you do not know the entity name.',
  },
  query_records: {
    scopes: [SCOPE_INTERNAL, SCOPE_CHAT],
    args: queryRecordsArgs,
    run: queryRecords,
    description:
      'Fetch rows of one CRM entity. args: {entity, filters?:[{field,op,value}], limit?, orderBy?, direction?}. ops: eq, ne, gt, gte, lt, lte, contains.',
    chatNote: 'Only this contact\'s own records are returned.',
  },
  aggregate_records: {
    scopes: [SCOPE_INTERNAL, SCOPE_CHAT],
    args: aggregateRecordsArgs,
    run: aggregateRecords,
    description:
      'Count or do arithmetic over one CRM entity. args: {entity, op:count|sum|avg|min|max, field?, filters?}. Use this for "how many" and "total" rather than counting rows yourself.',
    chatNote: 'Computed over this contact\'s own records only.',
  },
  list_chats: {
    scopes: [SCOPE_INTERNAL],
    args: listChatsArgs,
    run: listChats,
    description:
      'List WhatsApp conversations for the connected account. args: {aiMode?, needsHuman?, limit?}. Use needsHuman:true for chats awaiting a human.',
  },
  search_messages: {
    scopes: [SCOPE_INTERNAL, SCOPE_CHAT],
    args: searchMessagesArgs,
    run: searchMessages,
    description:
      'Search WhatsApp message text. args: {query?, chatId?, direction?, limit?}.',
    chatNote: 'Restricted to THIS conversation; the chatId argument is ignored.',
  },
  search_knowledge: {
    scopes: [SCOPE_INTERNAL, SCOPE_CHAT],
    args: searchKnowledgeArgs,
    run: searchKnowledge,
    description:
      'Semantic + keyword search over knowledge documents and indexed CRM records. args: {query, topK?}.',
  },
  list_knowledge_files: {
    scopes: [SCOPE_INTERNAL],
    args: listKnowledgeFilesArgs,
    run: listKnowledgeFiles,
    description: 'List knowledge-base files and their ingest status. args: {limit?}.',
  },
});

/**
 * Normalise a caller-supplied scope into the shape the tools expect.
 *
 * @param {{mode:'internal'}|{mode:'chat', chatId:string}} scope
 */
function resolveScope(scope) {
  if (!scope || scope.mode !== SCOPE_CHAT) return { mode: SCOPE_INTERNAL };
  return {
    mode: SCOPE_CHAT,
    chatId: scope.chatId || null,
    contactPhone: scope.contactPhone || contactPhoneFromChatId(scope.chatId),
  };
}

/**
 * Run one tool after validating arguments and enforcing scope.
 *
 * Never throws: an unknown tool, a tool the scope forbids, bad arguments or a
 * failed query all come back as `{ error }`, so the model can correct itself
 * on its next turn instead of the whole request failing.
 */
async function runTool(name, rawArgs, rawScope) {
  const scope = resolveScope(rawScope);
  const tool = TOOLS[name];
  if (!tool) {
    return {
      error: `Unknown tool "${name}". Available: ${toolNamesFor(scope.mode).join(', ')}.`,
    };
  }
  if (!tool.scopes.includes(scope.mode)) {
    return {
      error: `Tool "${name}" is not available in ${scope.mode} scope. Available: ${toolNamesFor(
        scope.mode
      ).join(', ')}.`,
    };
  }
  const parsed = tool.args.safeParse(rawArgs || {});
  if (!parsed.success) {
    return {
      error: `Invalid arguments for ${name}: ${parsed.error.issues
        .map((i) => `${i.path.join('.')} ${i.message}`)
        .join('; ')}`,
    };
  }
  try {
    return await tool.run(parsed.data, scope);
  } catch (err) {
    return { error: `${name} failed: ${String((err && err.message) || err).slice(0, 300)}` };
  }
}

function toolNamesFor(mode) {
  return Object.entries(TOOLS)
    .filter(([, t]) => t.scopes.includes(mode))
    .map(([n]) => n);
}

/** Catalogue for the system prompt, listing only what this scope may call. */
function describeTools(mode = SCOPE_INTERNAL) {
  return Object.entries(TOOLS)
    .filter(([, t]) => t.scopes.includes(mode))
    .map(([name, t]) => {
      const note = mode === SCOPE_CHAT && t.chatNote ? ` ${t.chatNote}` : '';
      return `- ${name}: ${t.description}${note}`;
    })
    .join('\n');
}

module.exports = {
  TOOLS,
  runTool,
  describeTools,
  toolNamesFor,
  resolveScope,
  contactPhoneFromChatId,
  MAX_ROWS,
  SCOPE_INTERNAL,
  SCOPE_CHAT,
};
