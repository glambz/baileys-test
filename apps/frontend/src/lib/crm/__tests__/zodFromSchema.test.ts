/**
 * Unit tests for the zod validator builder.
 *
 * Acceptance for Plan 02 task 2: builds a schema with text, number,
 * enum, phone, email, required, min/max and verifies it rejects an
 * out-of-range number and an invalid phone; `getCachedValidator`
 * returns the same instance for the same `entityId` and a new
 * instance after a version bump.
 *
 * Run with vitest (added in Plan 08's polish). The type signatures
 * are kept module-private so the test does not need a runtime.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { buildZodSchema, getCachedValidator, invalidateValidator } from '../zodFromSchema';
import type { EntityDefinition } from '@/types/crm';

function makeEntity(overrides: Partial<EntityDefinition['schemaJson']> = {}): EntityDefinition {
  const base: EntityDefinition = {
    id: 'ent-test',
    name: 'test_entity',
    label: 'Test',
    icon: 'Database',
    description: null,
    schemaJson: {
      fields: [
        { name: 'name', label: 'Nama', type: 'text', required: true, indexable: true },
        { name: 'amount', label: 'Nominal', type: 'number', required: false, validation: { min: 0, max: 1000 } },
        {
          name: 'stage',
          label: 'Tahap',
          type: 'enum',
          required: true,
          validation: { enumValues: ['lead', 'qualified', 'won', 'lost'] },
        },
        { name: 'phone', label: 'Phone', type: 'phone', required: false },
        { name: 'email', label: 'Email', type: 'email', required: false },
      ],
      relations: [],
    },
    version: 1,
    createdAt: 0,
    updatedAt: 0,
  };
  base.schemaJson = { ...base.schemaJson, ...overrides };
  return base;
}

describe('zodFromSchema', () => {
  beforeEach(() => invalidateValidator('ent-test'));

  it('accepts a valid record', () => {
    const schema = buildZodSchema(makeEntity());
    const ok = schema.safeParse({
      name: 'Pak Hendro',
      amount: 500,
      stage: 'qualified',
      phone: '6281234567890',
      email: 'a@b.co',
    });
    expect(ok.success).toBe(true);
  });

  it('rejects an out-of-range number', () => {
    const schema = buildZodSchema(makeEntity());
    const bad = schema.safeParse({ name: 'x', stage: 'lead', amount: 9999 });
    expect(bad.success).toBe(false);
  });

  it('rejects an invalid phone', () => {
    const schema = buildZodSchema(makeEntity());
    const bad = schema.safeParse({ name: 'x', stage: 'lead', phone: 'not-a-phone' });
    expect(bad.success).toBe(false);
  });

  it('rejects an invalid email', () => {
    const schema = buildZodSchema(makeEntity());
    const bad = schema.safeParse({ name: 'x', stage: 'lead', email: 'no-at-sign' });
    expect(bad.success).toBe(false);
  });

  it('caches the validator and re-builds on version bump', () => {
    const a = makeEntity();
    const schemaA1 = getCachedValidator(a);
    const schemaA1again = getCachedValidator(a);
    expect(schemaA1).toBe(schemaA1again);

    const bumped: EntityDefinition = { ...a, version: 2 };
    const schemaA2 = getCachedValidator(bumped);
    expect(schemaA2).not.toBe(schemaA1);
  });
});
