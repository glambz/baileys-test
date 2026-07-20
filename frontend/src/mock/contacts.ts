import dayjs from 'dayjs';
import type { Contact } from '@/types';

/**
 * Mock address book. Mirrors the Indonesian chat samples in
 * `docs/frontend/features/chats/spec.md` §8.
 *
 * The "anonymous 1:1" sample (phone `6281234567890`) intentionally has
 * no Contact row — the contact-missing branch of the display rule must
 * be exercised.
 *
 * Note: the named group "Tim Marketing Q3" uses `groupName` rather than
 * `displayName` because it is a `@g.us` chat (see `Chat` JID suffix rule).
 */
const UPDATED_AT = dayjs('2026-06-30T08:00:00Z').unix();

export const contacts: Contact[] = [
  {
    id: 'mock-contact-01',
    phone: '6285179652486',
    displayName: 'Pak Hendro',
    groupName: null,
    tags: ['lead', 'vip'],
    notes: 'Pemilik Toko Makmur — konfirmasi campaign Senin.',
    updatedAt: UPDATED_AT,
  },
  {
    id: 'mock-contact-02',
    phone: '6281234567891',
    displayName: 'Bu Sinta',
    groupName: null,
    tags: ['lead'],
    notes: 'Tertarik paket Bulanan.',
    updatedAt: UPDATED_AT,
  },
  {
    id: 'mock-contact-03',
    phone: '6281398765432',
    displayName: 'Reza',
    groupName: null,
    tags: ['internal'],
    notes: 'Klien internal.',
    updatedAt: UPDATED_AT,
  },
  {
    id: 'mock-contact-04',
    phone: '0000000000004',
    displayName: '',
    groupName: 'Tim Marketing Q3',
    // jid is required for group chats to be resolvable from the sidebar
    // (group chats have no `phone`; lookup must fall through to jid).
    jid: '120363012345@g.us',
    tags: ['team'],
    notes: 'Grup marketing internal.',
    updatedAt: UPDATED_AT,
  },
  {
    id: 'mock-contact-05',
    phone: '0000000000005',
    displayName: '',
    groupName: 'Proyek Klien Baru',
    tags: ['team'],
    notes: 'Grup klien — sudah dinamai.',
    updatedAt: UPDATED_AT,
  },
];