import dayjs from 'dayjs';
import type { Chat } from '@/types';

/**
 * Mock chats — Indonesian samples seeded from
 * `docs/frontend/features/chats/spec.md` §8.1–§8.4 plus one unnamed
 * group (no `groupName`, no extractable phone) to exercise the
 * `"Grup belum dinamai"` branch.
 *
 * The "no-contact" anonymous 1:1 (`6281234567890`) is included with
 * `phone` set to the senderPn but **no** matching `Contact` row.
 *
 * `lastMessageAt` is the timestamp of the latest message in each thread
 * (in Unix seconds). `lastMessagePreview` is trimmed to ≤ 80 chars.
 *
 * Status broadcast is intentionally omitted from the default sidebar;
 * see `src/lib/contactLabel.ts` and `ChatSidebar` for how the
 * `"Status"` literal label is rendered when present.
 */
const T_PAK_HENDRO_LATEST = dayjs('2026-06-30T10:11:00Z').unix();
const T_BU_SINTA_LATEST = dayjs('2026-06-29T08:20:00Z').unix();
const T_REZA_LATEST = dayjs('2026-06-28T11:33:00Z').unix();
const T_ANON_LATEST = dayjs('2026-06-30T09:05:00Z').unix();
const T_GROUP_LATEST = dayjs('2026-06-30T09:30:00Z').unix();
const T_UNNAMED_LATEST = dayjs('2026-06-30T08:45:00Z').unix();

export const chats: Chat[] = [
  {
    id: 'mock-chat-01',
    jid: '6285179652486@s.whatsapp.net',
    phone: '6285179652486',
    lastMessagePreview: 'Oke kak, deal. Kita mulai Senin 1 Juli. Thanks ya.',
    lastMessageAt: T_PAK_HENDRO_LATEST,
    unreadCount: 0,
    pinned: true, // mock-only
    muted: false,
    archived: false,
  },
  {
    id: 'mock-chat-02',
    jid: '6281234567891@s.whatsapp.net',
    phone: '6281234567891',
    lastMessagePreview: 'Tambahan Rp 750.000 per campaign kak, sudah termasuk desain + publishing.',
    lastMessageAt: T_BU_SINTA_LATEST,
    unreadCount: 2,
    pinned: false,
    muted: false,
    archived: false,
  },
  {
    id: 'mock-chat-03',
    jid: '6281398765432@s.whatsapp.net',
    phone: '6281398765432',
    lastMessagePreview: 'Siap. Tolong siapin deck untuk klien baru ya, thank you.',
    lastMessageAt: T_REZA_LATEST,
    unreadCount: 0,
    pinned: false,
    muted: false,
    archived: false,
  },
  {
    id: 'mock-chat-04',
    jid: '6281234567890@s.whatsapp.net',
    phone: '6281234567890',
    lastMessagePreview: 'Halo kak, siap. Saya kirim pricelist & portofolio terbaru dalam 5 menit ya.',
    lastMessageAt: T_ANON_LATEST,
    unreadCount: 0,
    pinned: false,
    muted: false,
    archived: false,
  },
  {
    id: 'mock-chat-05',
    jid: '120363012345@g.us',
    phone: undefined, // group chats have no single phone
    lastMessagePreview: 'Rina: besok kita review materi jam 10 ya',
    lastMessageAt: T_GROUP_LATEST,
    unreadCount: 1,
    pinned: false,
    muted: false,
    archived: false,
  },
  {
    id: 'mock-chat-06',
    jid: '120363045678@g.us',
    // No groupName, no extractable phone — exercises "Grup belum dinamai".
    lastMessagePreview: 'Pesan terakhir di grup tanpa nama.',
    lastMessageAt: T_UNNAMED_LATEST,
    unreadCount: 0,
    pinned: false,
    muted: false,
    archived: false,
  },
];