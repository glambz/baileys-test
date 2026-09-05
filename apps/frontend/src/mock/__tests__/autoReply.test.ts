import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crmMock } from '../crmStore';
import { routeMockRequest } from '../handler';
import { CRM_CONFIDENCE_THRESHOLD } from '@/lib/crm/zodFromSchema';
import { AI_FALLBACK_MESSAGE_ID } from '@/lib/ai/fallbackMessage';
import type { CrmRecord, EntityDefinition } from '@/types/crm';

/**
 * Plan 04 task 5 — the cross-contact leak guard.
 *
 * Spec source-of-truth: `docs/crm/features/ai-autoreply/spec.md` §5.2.
 * The mock handler must apply `r.contact_id = chat.contact_id` at the
 * data layer; this test asserts that contract directly by seeding two
 * contacts (C-A, C-B) and their respective records, then asking a
 * question that would match a record in either set.
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

async function callReplyPreview(chatId: string) {
  return routeMockRequest(
    'POST',
    '/crm/ai/reply-preview',
    new URL('http://mock.local/crm/ai/reply-preview'),
    { chatId, message: 'Berapa total invoice bulan ini?' }
  );
}

describe('cross-contact leak guard (plan 04 / spec §5.2)', () => {
  beforeEach(() => {
    crmMock.reset();
  });

  it('email-style; the mock handler applies the r.contact_id == chat.contact_id predicate', () => {
    // Assert the handler source explicitly contains the predicate.
    // (Source-level guard; mirrors the gate the spec requires.)
    const here = dirname(fileURLToPath(import.meta.url));
    const file = readFileSync(resolve(here, '..', 'crm.ts'), 'utf8');
    expect(file).toContain('r.contactId === senderPn');
  });

  it('chats with C-A never see R-B values in the evidence / answer body', async () => {
    const ent = entity();
    crmMock.addEntity(ent);
    const recA: CrmRecord = {
      id: 'rec-A',
      entityId: ent.id,
      entityName: 'customer',
      contactId: '6285179652486',
      data: { name: 'Pak Hendro', description: 'Invoice bulanan juni 2026 total Rp 1.500.000' },
      createdAt: ISO,
      updatedAt: ISO,
    };
    const recB: CrmRecord = {
      id: 'rec-B',
      entityId: ent.id,
      entityName: 'customer',
      contactId: '6281234567891',
      data: { name: 'Bu Sinta', description: 'Invoice bulanan mei 2026 total Rp 4.500.000' },
      createdAt: ISO,
      updatedAt: ISO,
    };
    crmMock.addRecord(recA);
    crmMock.addRecord(recB);

    const resp = await callReplyPreview('mock-chat-01' /* C-A */);
    expect(resp).not.toBeNull();
    expect(resp!.status).toBe(200);
    const body = (await resp!.json()) as {
      answer: string;
      confidence: number;
      evidence: Array<{ recordId?: string; contactId?: string | null }>;
      would_send: boolean;
    };
    // Hard-contact filter enforced: every evidence row belongs to C-A.
    for (const ev of body.evidence) {
      expect(ev.contactId).toBe('6285179652486');
    }
    // Answer body must not contain R-B's identifying values.
    expect(body.answer).not.toContain('Sinta');
    expect(body.answer).not.toContain('4.500.000');
    // Confidence-vs-threshold reporting matches the locked CRM threshold.
    expect(body.would_send === (body.confidence >= CRM_CONFIDENCE_THRESHOLD)).toBe(true);
  });

  it('chats with an unknown contactId return the locked Indonesian fallback', async () => {
    crmMock.reset();
    const resp = await callReplyPreview('mock-chat-01');
    expect(resp).not.toBeNull();
    const body = (await resp!.json()) as {
      answer: string;
      evidence: unknown[];
      would_send: boolean;
    };
    expect(body.evidence).toEqual([]);
    expect(body.would_send).toBe(false);
    // The fallback is the locked Indonesian sentence (or its i18n id).
    expect([
      AI_FALLBACK_MESSAGE_ID,
      'Maaf, saya tidak memiliki informasi yang cukup yakin untuk menjawab itu. Mungkin yang Anda maksud adalah ini: …',
    ]).toContain(body.answer);
  });
});

describe('AI-mode state machine: forbidden human → human_pending_flag transition', () => {
  beforeEach(() => {
    crmMock.reset();
  });

  it('rejects toggle to human_pending_flag with 400 and does NOT auto-flag the chat', async () => {
    // mock-chat-02 is seeded as 'human' by the crmMock store; using it
    // exercises the forbidden `human → human_pending_flag` transition
    // contract from `docs/tech/ai-reply-state-machine.md` §2.1.
    expect(crmMock.getState().chatModes['mock-chat-02']).toBe('human');

    // Call the auto-reply mock handler (the toggle-mode endpoint is the
    // single state-mutating endpoint in the mock layer) attempting to
    // transition the chat into `human_pending_flag`.
    const resp = await routeMockRequest(
      'POST',
      '/crm/ai/toggle-mode',
      new URL('http://mock.local/crm/ai/toggle-mode'),
      { chatId: 'mock-chat-02', mode: 'human_pending_flag' }
    );
    expect(resp).not.toBeNull();
    expect(resp!.status).toBe(400);

    // The response is NOT a successful transition (no body reassigns
    // the mode; the chat's aiMode must remain 'human', NOT
    // 'human_pending_flag'). This is the runtime enforcement point at
    // `frontend/src/mock/crm.ts:428-429` — the contract under test.
    expect(crmMock.getState().chatModes['mock-chat-02']).toBe('human');

    // Sanity: an inbound reply-preview on a chat in `human` mode does
    // NOT auto-flag it either (the human-mode path is silent: no
    // `human_pending_flag` side-effect on the store).
    const preview = await callReplyPreview('mock-chat-02');
    expect(preview).not.toBeNull();
    expect(preview!.status).toBe(200);
    expect(crmMock.getState().chatModes['mock-chat-02']).toBe('human');

    // And: the canonical chat-modes projection still reports 'human'.
    const modesResp = await routeMockRequest(
      'GET',
      '/crm/chats/modes',
      new URL('http://mock.local/crm/chats/modes'),
      {}
    );
    expect(modesResp).not.toBeNull();
    const modesBody = (await modesResp!.json()) as { modes: Record<string, string> };
    expect(modesBody.modes['mock-chat-02']).toBe('human');
  });
});
