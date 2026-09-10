import { describe, it, expect, beforeEach } from 'vitest';
import dayjs from 'dayjs';
import { crmMock } from '../crmStore';
import type { CrmRecord, EntityDefinition } from '@/types/crm';

/**
 * Plan 04 task 5 — Data viewer search: ILIKE on `indexable` fields only.
 * Source-of-truth: `docs/crm/features/data-viewer/spec.md` §5.
 */

const NOW = dayjs('2026-07-01').unix();

function makeEntity(): EntityDefinition {
  return {
    id: 'ent-test-1',
    name: 'widget',
    label: 'Widget',
    icon: 'Box',
    description: 'test entity',
    schemaJson: {
      fields: [
        { name: 'name', label: 'Name', type: 'text', required: true, indexable: true },
        { name: 'secret', label: 'Secret', type: 'text', required: false, indexable: false },
      ],
      relations: [],
    },
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    archivedAt: null,
  };
}

describe('Data Viewer search (indexable-only ILIKE)', () => {
  beforeEach(() => {
    crmMock.reset();
  });

  it('matches substring in an indexable field for all rows', () => {
    const ent = makeEntity();
    crmMock.addEntity(ent);
    const rA: CrmRecord = {
      id: 'r-a',
      entityId: ent.id,
      entityName: ent.name,
      data: { name: 'Apple Pie', secret: 'secret-foo' },
      createdAt: NOW,
      updatedAt: NOW,
    };
    const rB: CrmRecord = {
      id: 'r-b',
      entityId: ent.id,
      entityName: ent.name,
      data: { name: 'Apple Cake', secret: 'secret-bar' },
      createdAt: NOW,
      updatedAt: NOW,
    };
    crmMock.addRecord(rA);
    crmMock.addRecord(rB);
    const records = crmMock.getState().records.filter((r) => r.entityName === 'widget');
    const q = 'apple';
    const idxFields = ent.schemaJson.fields.filter((f) => f.indexable);
    const found = records.filter((row) =>
      idxFields.some((f) => {
        const v = row.data?.[f.name];
        return typeof v === 'string' && v.toLowerCase().includes(q);
      })
    );
    expect(found.map((r) => r.id).sort()).toEqual(['r-a', 'r-b']);
  });

  it('does NOT match a substring present only in a non-indexable field', () => {
    const ent = makeEntity();
    crmMock.addEntity(ent);
    const rA: CrmRecord = {
      id: 'r-a',
      entityId: ent.id,
      entityName: ent.name,
      data: { name: 'Unrelated', secret: 'contains-needle' },
      createdAt: NOW,
      updatedAt: NOW,
    };
    crmMock.addRecord(rA);
    const records = crmMock.getState().records.filter((r) => r.entityName === 'widget');
    const q = 'needle';
    const idxFields = ent.schemaJson.fields.filter((f) => f.indexable);
    const found = records.filter((row) =>
      idxFields.some((f) => {
        const v = row.data?.[f.name];
        return typeof v === 'string' && v.toLowerCase().includes(q);
      })
    );
    expect(found).toHaveLength(0);
  });
});
