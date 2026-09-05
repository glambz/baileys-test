import { describe, it, expect, beforeEach } from 'vitest';
import { crmMock } from '../crmStore';
import { routeMockRequest } from '../handler';
import { getHardenedRulesBlock, buildSystemPrompt } from '@/lib/ai/systemPrompt';
import { DEFAULT_AI_SETTINGS } from '@/types/aiSettings';
import { AI_FALLBACK_MESSAGE_ID } from '@/lib/ai/fallbackMessage';
import type { CrmRecord, EntityDefinition } from '@/types/crm';

/**
 * Plan 13 — `/crm/ai/ask` honors the per-tenant `AiSettings.language`
 * and echoes the composed `systemPrompt` for test affordance.
 *
 * Spec source-of-truth: `docs/crm/features/ai-settings/spec.md` §6
 * (the language propagation requirement) and the hardened-rules
 * defense-in-depth layer from `docs/crm/features/ai-autoreply/spec.md`
 * §5.
 */

const ISO = 1700000000;

function entity(): EntityDefinition {
  return {
    id: 'ent-customer-x',
    name: 'customer',
    label: 'Customer',
    icon: 'User',
    description: null,
    schemaJson: {
      fields: [
        { name: 'name', label: 'Name', type: 'text', required: true, indexable: true },
        {
          name: 'description',
          label: 'Description',
          type: 'longtext',
          required: false,
          indexable: true,
        },
      ],
      relations: [],
    },
    version: 1,
    createdAt: ISO,
    updatedAt: ISO,
    archivedAt: null,
  };
}

async function callAsk(body: Record<string, unknown>): Promise<Response> {
  const resp = await routeMockRequest(
    'POST',
    '/crm/ai/ask',
    new URL('http://mock.local/crm/ai/ask'),
    body
  );
  if (!resp) throw new Error('no mock handler');
  return resp;
}

async function jsonBody(resp: Response): Promise<Record<string, unknown>> {
  return (await resp.json()) as Record<string, unknown>;
}

describe('mock /crm/ai/ask — language propagation (Plan 13)', () => {
  beforeEach(() => {
    crmMock.reset();
    const ent = entity();
    crmMock.addEntity(ent);
    const rec: CrmRecord = {
      id: 'rec-customer-1',
      entityId: ent.id,
      entityName: 'customer',
      contactId: null,
      data: { name: 'Pak Acme', description: 'paket harga juni 2026' },
      createdAt: ISO,
      updatedAt: ISO,
    };
    crmMock.addRecord(rec);
  });

  it("returns the English answer prefix when language === 'en'", async () => {
    const resp = await callAsk({
      question: 'paket harga',
      systemPrompt: 'irrelevant',
      settings: { ...DEFAULT_AI_SETTINGS, language: 'en' },
    });
    expect(resp.status).toBe(200);
    const body = await jsonBody(resp);
    expect(body.kind).toBe('answered');
    expect(String(body['answer'])).toMatch(/^Here is what I found in your CRM data:/);
  });

  it("returns the Indonesian answer prefix when language === 'id'", async () => {
    const resp = await callAsk({
      question: 'paket harga',
      systemPrompt: 'irrelevant',
      settings: { ...DEFAULT_AI_SETTINGS, language: 'id' },
    });
    expect(resp.status).toBe(200);
    const body = await jsonBody(resp);
    expect(body.kind).toBe('answered');
    expect(String(body['answer'])).toMatch(/^Berikut yang saya temukan di data CRM Anda:/);
  });

  it("returns the [Modern] Indonesian answer prefix when language === 'id-mod'", async () => {
    const resp = await callAsk({
      question: 'paket harga',
      systemPrompt: 'irrelevant',
      settings: { ...DEFAULT_AI_SETTINGS, language: 'id-mod' },
    });
    expect(resp.status).toBe(200);
    const body = await jsonBody(resp);
    expect(body.kind).toBe('answered');
    expect(String(body['answer'])).toMatch(/^\[Modern\] Berikut yang saya temukan di data CRM Anda:/);
  });

  it('returns the locked Indonesian fallback when language=id and no records match', async () => {
    crmMock.reset();
    const resp = await callAsk({
      question: 'zyxqvu nomatchanywhere tokenunique',
      systemPrompt: 'irrelevant',
      settings: { ...DEFAULT_AI_SETTINGS, language: 'id' },
    });
    const body = await jsonBody(resp);
    expect(body.kind).toBe('fallback');
    expect(body['message']).toBe(AI_FALLBACK_MESSAGE_ID);
  });

  it('returns the English fallback when language=en and no records match', async () => {
    crmMock.reset();
    const resp = await callAsk({
      question: 'zyxqvu nomatchanywhere tokenunique',
      systemPrompt: 'irrelevant',
      settings: { ...DEFAULT_AI_SETTINGS, language: 'en' },
    });
    const body = await jsonBody(resp);
    expect(body.kind).toBe('fallback');
    expect(String(body['message'])).toContain("Sorry, I don't have confident enough information");
  });

  it('echoes the systemPrompt byte-for-byte in systemPromptEcho', async () => {
    const composed = buildSystemPrompt({ settings: DEFAULT_AI_SETTINGS });
    const resp = await callAsk({
      question: 'paket harga',
      systemPrompt: composed,
      settings: DEFAULT_AI_SETTINGS,
    });
    const body = await jsonBody(resp);
    expect(body['systemPromptEcho']).toBe(composed);
    // The hardened block must be a suffix of the echoed systemPrompt.
    expect(String(body['systemPromptEcho']).endsWith(getHardenedRulesBlock())).toBe(true);
  });

  it('composed systemPrompt contains the per-tenant fragment with Bahasa line', async () => {
    const composed = buildSystemPrompt({
      language: 'en',
      settings: { ...DEFAULT_AI_SETTINGS, language: 'en' },
    });
    expect(composed).toContain('Bahasa yang digunakan: en.');
    expect(composed.endsWith(getHardenedRulesBlock())).toBe(true);
  });

  it('does not regress: the WhatsApp-scope r.contactId === senderPn predicate is still in crm.ts', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const here = dirname(fileURLToPath(import.meta.url));
    const file = readFileSync(resolve(here, '..', 'crm.ts'), 'utf8');
    // Defense-in-depth layer #1 (data-layer contact filter) is intact.
    expect(file).toContain('r.contactId === senderPn');
  });
});