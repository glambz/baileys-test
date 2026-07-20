import dayjs from 'dayjs';
import type { Message } from '@/types';

/**
 * Mock messages — keyed by `Chat.id`. Conversations are taken verbatim
 * from `docs/frontend/features/chats/spec.md` §8.1–§8.4.
 *
 * Timestamps are Unix **seconds** (not ms) per
 * `docs/tech/chat-data-model.md` §1.
 *
 * Every inbound 1:1 `Message` includes `key.senderPn`. Status broadcast
 * chat is intentionally omitted from the seeded mock.
 */
const base = '2026-06-30T';

const T = (hhmmss: string) => dayjs(`${base}${hhmmss}`).unix();

export const messages: Map<string, Message[]> = new Map([
  [
    'mock-chat-01', // Pak Hendro — 7 turns
    [
      {
        id: 'mock-msg-01-01',
        chatId: 'mock-chat-01',
        direction: 'in',
        key: {
          remoteJid: '6285179652486@s.whatsapp.net',
          fromMe: false,
          senderPn: '6285179652486',
        },
        senderName: 'Pak Hendro',
        body: 'Halo kak, saya Hendro dari Toko Makmur. Mau konfirmasi campaign Senin ya?',
        kind: 'text',
        caption: null,
        mime: null,
        timestamp: T('09:12:00'),
      },
      {
        id: 'mock-msg-01-02',
        chatId: 'mock-chat-01',
        direction: 'out',
        key: {
          remoteJid: '6285179652486@s.whatsapp.net',
          fromMe: true,
        },
        senderName: null,
        body: 'Siap kak, saya kirim draft konsepnya siang ini sebelum jam 2.',
        kind: 'text',
        caption: null,
        mime: null,
        timestamp: T('09:14:00'),
      },
      {
        id: 'mock-msg-01-03',
        chatId: 'mock-chat-01',
        direction: 'in',
        key: {
          remoteJid: '6285179652486@s.whatsapp.net',
          fromMe: false,
          senderPn: '6285179652486',
        },
        senderName: 'Pak Hendro',
        body: 'Ini mockup banner yang kemarin kita bahas. Tolong dicek dulu ya.',
        kind: 'image',
        caption: 'Mockup banner campaign',
        mime: 'image/jpeg',
        timestamp: T('13:42:00'),
      },
      {
        id: 'mock-msg-01-04',
        chatId: 'mock-chat-01',
        direction: 'out',
        key: {
          remoteJid: '6285179652486@s.whatsapp.net',
          fromMe: true,
        },
        senderName: null,
        body: 'Noted kak. Headline-nya sudah disesuaikan, warna sudah masuk brand guide.',
        kind: 'text',
        caption: null,
        mime: null,
        timestamp: T('13:50:00'),
      },
      {
        id: 'mock-msg-01-05',
        chatId: 'mock-chat-01',
        direction: 'in',
        key: {
          remoteJid: '6285179652486@s.whatsapp.net',
          fromMe: false,
          senderPn: '6285179652486',
        },
        senderName: 'Pak Hendro',
        body: 'Berapa sih kak total untuk 1 minggu running? Sama desainnya.',
        kind: 'text',
        caption: null,
        mime: null,
        timestamp: T('16:05:00'),
      },
      {
        id: 'mock-msg-01-06',
        chatId: 'mock-chat-01',
        direction: 'out',
        key: {
          remoteJid: '6285179652486@s.whatsapp.net',
          fromMe: true,
        },
        senderName: null,
        body: 'Paket Mingguan Rp 1.500.000 include 3 posting + 1 desain kak. Saya kirim invoice-nya sekarang.',
        kind: 'text',
        caption: null,
        mime: null,
        timestamp: T('16:08:00'),
      },
      {
        id: 'mock-msg-01-07',
        chatId: 'mock-chat-01',
        direction: 'in',
        key: {
          remoteJid: '6285179652486@s.whatsapp.net',
          fromMe: false,
          senderPn: '6285179652486',
        },
        senderName: 'Pak Hendro',
        body: 'Oke kak, deal. Kita mulai Senin 1 Juli. Thanks ya.',
        kind: 'text',
        caption: null,
        mime: null,
        timestamp: T('10:11:00'),
      },
    ],
  ],
  [
    'mock-chat-02', // Bu Sinta — 4 turns
    [
      {
        id: 'mock-msg-02-01',
        chatId: 'mock-chat-02',
        direction: 'in',
        key: {
          remoteJid: '6281234567891@s.whatsapp.net',
          fromMe: false,
          senderPn: '6281234567891',
        },
        senderName: 'Bu Sinta',
        body: 'Mbak, untuk paket Bulanan sudah termasuk report mingguan juga?',
        kind: 'text',
        caption: null,
        mime: null,
        timestamp: T('19:45:00'),
      },
      {
        id: 'mock-msg-02-02',
        chatId: 'mock-chat-02',
        direction: 'out',
        key: {
          remoteJid: '6281234567891@s.whatsapp.net',
          fromMe: true,
        },
        senderName: null,
        body: 'Iya kak, setiap Jumat kami kirim ringkasan performa via WhatsApp & email.',
        kind: 'text',
        caption: null,
        mime: null,
        timestamp: T('19:50:00'),
      },
      {
        id: 'mock-msg-02-03',
        chatId: 'mock-chat-02',
        direction: 'in',
        key: {
          remoteJid: '6281234567891@s.whatsapp.net',
          fromMe: false,
          senderPn: '6281234567891',
        },
        senderName: 'Bu Sinta',
        body: 'Kalau saya tambah 1 campaign dadakan di tengah bulan, kena biaya berapa?',
        kind: 'text',
        caption: null,
        mime: null,
        timestamp: T('08:15:00'),
      },
      {
        id: 'mock-msg-02-04',
        chatId: 'mock-chat-02',
        direction: 'out',
        key: {
          remoteJid: '6281234567891@s.whatsapp.net',
          fromMe: true,
        },
        senderName: null,
        body: 'Tambahan Rp 750.000 per campaign kak, sudah termasuk desain + publishing.',
        kind: 'text',
        caption: null,
        mime: null,
        timestamp: T('08:20:00'),
      },
    ],
  ],
  [
    'mock-chat-03', // Reza — 3 turns
    [
      {
        id: 'mock-msg-03-01',
        chatId: 'mock-chat-03',
        direction: 'in',
        key: {
          remoteJid: '6281398765432@s.whatsapp.net',
          fromMe: false,
          senderPn: '6281398765432',
        },
        senderName: 'Reza',
        body: 'Bro, follow-up meeting besok jadi jam berapa?',
        kind: 'text',
        caption: null,
        mime: null,
        timestamp: T('14:02:00'),
      },
      {
        id: 'mock-msg-03-02',
        chatId: 'mock-chat-03',
        direction: 'out',
        key: {
          remoteJid: '6281398765432@s.whatsapp.net',
          fromMe: true,
        },
        senderName: null,
        body: 'Jam 14:00 ya bro, saya share link Zoom 15 menit sebelum mulai.',
        kind: 'text',
        caption: null,
        mime: null,
        timestamp: T('14:07:00'),
      },
      {
        id: 'mock-msg-03-03',
        chatId: 'mock-chat-03',
        direction: 'in',
        key: {
          remoteJid: '6281398765432@s.whatsapp.net',
          fromMe: false,
          senderPn: '6281398765432',
        },
        senderName: 'Reza',
        body: 'Siap. Tolong siapin deck untuk klien baru ya, thank you.',
        kind: 'text',
        caption: null,
        mime: null,
        timestamp: T('11:33:00'),
      },
    ],
  ],
  [
    'mock-chat-04', // Anonymous 1:1 — 2 turns
    [
      {
        id: 'mock-msg-04-01',
        chatId: 'mock-chat-04',
        direction: 'in',
        key: {
          remoteJid: '6281234567890@s.whatsapp.net',
          fromMe: false,
          senderPn: '6281234567890',
        },
        senderName: null, // unknown contact
        body: 'Halo, saya tertarik dengan paket kerja sama tahunan. Bisa info lengkap?',
        kind: 'text',
        caption: null,
        mime: null,
        timestamp: T('09:00:00'),
      },
      {
        id: 'mock-msg-04-02',
        chatId: 'mock-chat-04',
        direction: 'out',
        key: {
          remoteJid: '6281234567890@s.whatsapp.net',
          fromMe: true,
        },
        senderName: null,
        body: 'Halo kak, siap. Saya kirim pricelist & portofolio terbaru dalam 5 menit ya.',
        kind: 'text',
        caption: null,
        mime: null,
        timestamp: T('09:05:00'),
      },
    ],
  ],
  [
    'mock-chat-05', // Tim Marketing Q3 — named group, 3 turns
    [
      {
        id: 'mock-msg-05-01',
        chatId: 'mock-chat-05',
        direction: 'in',
        key: {
          remoteJid: '120363012345@g.us',
          fromMe: false,
          participantPn: '6285179652486',
        },
        senderName: 'Pak Hendro',
        body: 'Selamat pagi tim, update progress campaign ya.',
        kind: 'text',
        caption: null,
        mime: null,
        timestamp: T('09:00:00'),
      },
      {
        id: 'mock-msg-05-02',
        chatId: 'mock-chat-05',
        direction: 'out',
        key: {
          remoteJid: '120363012345@g.us',
          fromMe: true,
        },
        senderName: null,
        body: 'Pagi pak. Draft konsep sudah 80%, sore ini saya share.',
        kind: 'text',
        caption: null,
        mime: null,
        timestamp: T('09:15:00'),
      },
      {
        id: 'mock-msg-05-03',
        chatId: 'mock-chat-05',
        direction: 'in',
        key: {
          remoteJid: '120363012345@g.us',
          fromMe: false,
          participantPn: '6281234567891',
        },
        senderName: 'Bu Sinta',
        body: 'besok kita review materi jam 10 ya',
        kind: 'text',
        caption: null,
        mime: null,
        timestamp: T('09:30:00'),
      },
    ],
  ],
  [
    'mock-chat-06', // Unnamed group — 1 turn, no extractable phone
    [
      {
        id: 'mock-msg-06-01',
        chatId: 'mock-chat-06',
        direction: 'in',
        key: {
          remoteJid: '120363045678@g.us',
          fromMe: false,
          // No participantPn → group has no extractable phone.
        },
        senderName: null,
        body: 'Pesan terakhir di grup tanpa nama.',
        kind: 'text',
        caption: null,
        mime: null,
        timestamp: T('08:45:00'),
      },
    ],
  ],
]);