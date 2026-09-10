import dayjs from 'dayjs';
import type {
  AIReplyMode,
  CrmRecord,
  EntityDefinition,
  KnowledgeFile,
} from '@/types/crm';

/**
 * In-memory mock CRM store. Persists across hot-reload via
 * `sessionStorage` under the key `crm.mock.state.v1` (per Plan 02
 * task 3). Seeded with `customer` and `deal` entities plus a few
 * records and a sample knowledge file.
 */

interface CrmMockState {
  entities: EntityDefinition[];
  entityHistory: Record<string, EntityDefinition[]>;
  records: CrmRecord[];
  knowledge: KnowledgeFile[];
  /** Chat-level aiMode map (mock-store side car; seed-driven). */
  chatModes: Record<string, AIReplyMode>;
}

const STORAGE_KEY = 'crm.mock.state.v1';

function seed(): CrmMockState {
  const now = dayjs().unix();
  const customer: EntityDefinition = {
    id: 'ent-customer-1',
    name: 'customer',
    label: 'Customer',
    icon: 'User',
    description: 'Orang yang membeli atau tertarik dengan layanan kami.',
    schemaJson: {
      fields: [
        { name: 'name', label: 'Nama', type: 'text', required: true, indexable: true },
        { name: 'phone', label: 'Telepon', type: 'phone', required: false, indexable: true },
        { name: 'email', label: 'Email', type: 'email', required: false, indexable: false },
        {
          name: 'tier',
          label: 'Tier',
          type: 'enum',
          required: true,
          default: 'lead',
          validation: { enumValues: ['lead', 'qualified', 'customer', 'churned'] },
          indexable: true,
        },
        { name: 'notes', label: 'Catatan', type: 'longtext', required: false },
      ],
      relations: [],
    },
    version: 1,
    createdAt: now - 86400 * 7,
    updatedAt: now - 86400 * 1,
    archivedAt: null,
  };
  const deal: EntityDefinition = {
    id: 'ent-deal-1',
    name: 'deal',
    label: 'Deal',
    icon: 'Briefcase',
    description: 'Kesempatan penjualan di pipeline.',
    schemaJson: {
      fields: [
        { name: 'title', label: 'Judul', type: 'text', required: true, indexable: true },
        {
          name: 'amount',
          label: 'Nominal',
          type: 'number',
          required: false,
          validation: { min: 0, max: 1_000_000_000 },
          indexable: false,
        },
        {
          name: 'stage',
          label: 'Tahap',
          type: 'enum',
          required: true,
          default: 'lead',
          validation: { enumValues: ['lead', 'qualified', 'won', 'lost'] },
          indexable: true,
        },
        {
          name: 'relatedContact',
          label: 'Kontak',
          type: 'relation',
          required: false,
          targetEntity: 'customer',
          targetField: 'id',
          cardinality: 'one-to-one',
        },
        { name: 'closeDate', label: 'Tanggal tutup', type: 'date', required: false },
      ],
      relations: [
        {
          id: 'rel-1',
          fromEntity: 'deal',
          fromField: 'relatedContact',
          toEntity: 'customer',
          toField: 'id',
          cardinality: 'one-to-one',
        },
      ],
    },
    version: 1,
    createdAt: now - 86400 * 7,
    updatedAt: now - 86400 * 1,
    archivedAt: null,
  };

  const records: CrmRecord[] = [
    {
      id: 'rec-cust-1',
      entityId: customer.id,
      entityName: 'customer',
      contactId: '6285179652486',
      data: { name: 'Pak Hendro', phone: '6285179652486', email: 'hendro@makmur.id', tier: 'qualified', notes: 'Deal campaign Senin.' },
      createdAt: now - 86400 * 5,
      updatedAt: now - 86400,
    },
    {
      id: 'rec-cust-2',
      entityId: customer.id,
      entityName: 'customer',
      contactId: '6281234567891',
      data: { name: 'Bu Sinta', phone: '6281234567891', tier: 'lead', notes: 'Tertarik paket Bulanan.' },
      createdAt: now - 86400 * 4,
      updatedAt: now - 86400 * 2,
    },
    {
      id: 'rec-deal-1',
      entityId: deal.id,
      entityName: 'deal',
      contactId: '6285179652486',
      data: { title: 'Paket Mingguan Makmur', amount: 1500000, stage: 'won', relatedContact: 'rec-cust-1', closeDate: dayjs('2026-07-01').format('YYYY-MM-DD') },
      createdAt: now - 86400 * 3,
      updatedAt: now - 86400,
    },
    {
      id: 'rec-deal-2',
      entityId: deal.id,
      entityName: 'deal',
      contactId: '6281234567891',
      data: { title: 'Paket Bulanan Sinta', amount: 4500000, stage: 'qualified', relatedContact: 'rec-cust-2' },
      createdAt: now - 86400 * 2,
      updatedAt: now - 86400,
    },
  ];

  const knowledge: KnowledgeFile[] = [
    {
      id: 'kf-1',
      filename: 'pricing-2026Q3.md',
      mimeType: 'text/markdown',
      size: 2048,
      status: 'indexed',
      chunksCount: 4,
      ingestedAt: now - 3600 * 12,
      entityId: null,
      uploadedAt: now - 3600 * 12,
    },
    {
      id: 'kf-2',
      filename: 'campaign-extras.md',
      mimeType: 'text/markdown',
      size: 1024,
      status: 'queued',
      chunksCount: 0,
      ingestedAt: null,
      entityId: null,
      uploadedAt: now - 600,
    },
  ];

  return {
    entities: [customer, deal],
    entityHistory: { [customer.id]: [customer], [deal.id]: [deal] },
    records,
    knowledge,
    // Map chat id -> aiMode; mirror the Plan 06 seed requirement.
    chatModes: {
      'mock-chat-01': 'ai',
      'mock-chat-02': 'human',
      'mock-chat-03': 'human_pending_flag',
      'mock-chat-04': 'ai',
      'mock-chat-05': 'ai',
      'mock-chat-06': 'human_pending_flag',
    },
  };
}

let state: CrmMockState = loadOrSeed();

function loadOrSeed(): CrmMockState {
  if (typeof window === 'undefined') return seed();
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CrmMockState;
      if (parsed?.entities && parsed?.records && parsed?.knowledge) return parsed;
    }
  } catch {
    /* ignore */
  }
  const fresh = seed();
  persist(fresh);
  return fresh;
}

function persist(s: CrmMockState): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export const crmMock = {
  getState(): CrmMockState {
    return state;
  },
  reset(): CrmMockState {
    state = seed();
    persist(state);
    return state;
  },
  addEntity(entity: EntityDefinition): EntityDefinition {
    state.entities.push(entity);
    state.entityHistory[entity.id] = [entity];
    persist(state);
    return entity;
  },
  updateEntity(updated: EntityDefinition): EntityDefinition {
    const idx = state.entities.findIndex((e) => e.id === updated.id);
    if (idx >= 0) state.entities[idx] = updated;
    if (!state.entityHistory[updated.id]) state.entityHistory[updated.id] = [];
    state.entityHistory[updated.id].push(updated);
    persist(state);
    return updated;
  },
  archiveEntity(id: string): void {
    const e = state.entities.find((x) => x.id === id);
    if (e) e.archivedAt = dayjs().unix();
    persist(state);
  },
  addRecord(record: CrmRecord): CrmRecord {
    state.records.push(record);
    persist(state);
    return record;
  },
  updateRecord(updated: CrmRecord): CrmRecord {
    const idx = state.records.findIndex((r) => r.id === updated.id);
    if (idx >= 0) state.records[idx] = updated;
    persist(state);
    return updated;
  },
  deleteRecord(id: string): void {
    const r = state.records.find((x) => x.id === id);
    if (r) (r as CrmRecord & { archivedAt?: number }).archivedAt = dayjs().unix();
    persist(state);
  },
  addKnowledgeFile(file: KnowledgeFile): KnowledgeFile {
    state.knowledge.unshift(file);
    persist(state);
    return file;
  },
  updateKnowledgeFile(id: string, patch: Partial<KnowledgeFile>): KnowledgeFile | undefined {
    const f = state.knowledge.find((x) => x.id === id);
    if (f) Object.assign(f, patch);
    persist(state);
    return f;
  },
  removeKnowledgeFile(id: string): void {
    state.knowledge = state.knowledge.filter((x) => x.id !== id);
    persist(state);
  },
  setChatMode(chatId: string, mode: AIReplyMode): void {
    state.chatModes[chatId] = mode;
    persist(state);
  },
};

// expose for debug
if (typeof window !== 'undefined') {
  (window as unknown as { __crmMock: typeof crmMock }).__crmMock = crmMock;
}
