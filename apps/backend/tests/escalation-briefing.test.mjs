/**
 * Agent-facing escalation briefing.
 * Source: docs/superpowers/specs/2026-09-04-wa-crm-gap-closure-design.md (Gap B)
 *
 * The bug this guards against: before this module existed, a live
 * escalation left GET /api/crm/ai/handoff returning a zero-length summary,
 * because the only summariser was debounced to once per 10 minutes and ran
 * fire-and-forget. An agent taking over got a blank panel.
 *
 * The LLM is stubbed here so the assertions are deterministic; the live
 * MiniMax path is exercised manually.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const HAS_DB = !!process.env.DATABASE_URL;

const { getPool } = await import('../src/db/client.js');
const escalation = await import('../src/ai/settings/escalation.js');
const { parseBriefing, fallbackBriefing, generateEscalationBriefing, loadEscalationBriefing } = escalation;

const CHAT_ID = '6289999988888@s.whatsapp.net';

describe('parseBriefing', () => {
  it('parses bare JSON', () => {
    expect(parseBriefing('{"headline":"x"}')).toEqual({ headline: 'x' });
  });

  it('strips markdown fencing the model sometimes adds', () => {
    expect(parseBriefing('```json\n{"headline":"y"}\n```')).toEqual({ headline: 'y' });
  });

  it('returns null rather than throwing on junk', () => {
    expect(parseBriefing('not json at all')).toBeNull();
    expect(parseBriefing('')).toBeNull();
  });

  it('rejects a bare array, which would break property access downstream', () => {
    expect(parseBriefing('[1,2,3]')).toBeNull();
  });
});

describe('fallbackBriefing', () => {
  it('is still useful when the LLM is unavailable', () => {
    const b = fallbackBriefing({ reason: 'confidence_low', reasoning: 'not enough context', confidence: 0.3 });
    expect(b.degraded).toBe(true);
    expect(b.headline).toBeTruthy();
    expect(b.suggested_next_action).toBeTruthy();
    // The model's own reasoning survives even on the degraded path.
    expect(b.ai_attempted).toBe('not enough context');
  });
});

describe.skipIf(!HAS_DB)('generateEscalationBriefing', () => {
  const originalFetch = globalThis.fetch;

  beforeAll(async () => {
    await getPool().query(
      `INSERT INTO chats (id, jid, phone, last_message_preview, last_message_at, unread_count, ai_mode)
       VALUES ($1, $1, '6289999988888', '', 0, 0, 'ai')
       ON CONFLICT (id) DO UPDATE SET ai_mode = 'ai'`,
      [CHAT_ID]
    );
    await getPool().query('DELETE FROM messages WHERE chat_id = $1', [CHAT_ID]);
  });

  afterAll(async () => {
    globalThis.fetch = originalFetch;
    await getPool().query('DELETE FROM messages WHERE chat_id = $1', [CHAT_ID]);
    await getPool().query('DELETE FROM chats WHERE id = $1', [CHAT_ID]);
  });

  function stubLlm(payloadText) {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => '',
      json: async () => ({
        output: [{ content: [{ type: 'output_text', text: payloadText }] }],
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      }),
    }));
  }

  it('persists the briefing, reason and timestamp', async () => {
    stubLlm(JSON.stringify({
      headline: 'Pelanggan menanyakan refund',
      customer_wants: 'refund penuh',
      ai_attempted: 'fallback',
      blocking_gap: 'tidak ada kebijakan refund di KB',
      suggested_next_action: 'cek kebijakan refund',
      sentiment: 'frustrated',
    }));

    const b = await generateEscalationBriefing({
      chatId: CHAT_ID, tenantId: 'default', reason: 'confidence_low',
      reasoning: 'KB tidak memuat kebijakan refund', confidence: 0.31,
    });
    expect(b.headline).toBe('Pelanggan menanyakan refund');
    // Machine-known facts are attached regardless of what the model said.
    expect(b.reason).toBe('confidence_low');
    expect(b.confidence).toBe(0.31);
    expect(b.ai_reasoning).toBe('KB tidak memuat kebijakan refund');

    const loaded = await loadEscalationBriefing(CHAT_ID);
    expect(loaded.reason).toBe('confidence_low');
    expect(loaded.at).toBeGreaterThan(0);
    expect(loaded.briefing.headline).toBe('Pelanggan menanyakan refund');
  });

  it('includes the triggering message even when the DB write has not landed', async () => {
    // Reproduces the race: the trigger persists the inbound fire-and-forget,
    // so `messages` can still be empty when the briefing is generated. The
    // message that caused the escalation must not be the one line missing.
    let seenPrompt = '';
    globalThis.fetch = vi.fn(async (_url, init) => {
      seenPrompt = JSON.parse(init.body).input;
      return {
        ok: true, status: 200, text: async () => '',
        json: async () => ({
          output: [{ content: [{ type: 'output_text', text: '{"headline":"ok"}' }] }],
          usage: {},
        }),
      };
    });

    await generateEscalationBriefing({
      chatId: CHAT_ID, tenantId: 'default', reason: 'turbo_cutoff',
      currentMessage: 'Pesanan XR-7741 belum sampai',
    });
    expect(seenPrompt).toContain('XR-7741');
  });

  it('stores a degraded briefing instead of throwing when the LLM fails', async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error('network down'); });

    const b = await generateEscalationBriefing({
      chatId: CHAT_ID, tenantId: 'default', reason: 'parse_failure', reasoning: 'bad json',
    });
    expect(b.degraded).toBe(true);
    expect(b.reason).toBe('parse_failure');

    // Crucially it is still persisted — the agent panel is never blank.
    const loaded = await loadEscalationBriefing(CHAT_ID);
    expect(loaded.briefing.degraded).toBe(true);
    expect(loaded.reason).toBe('parse_failure');
  });
});
