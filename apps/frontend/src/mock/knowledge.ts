import dayjs from 'dayjs';
import type { KnowledgeEntry } from '@/types';

/**
 * Mock knowledge base for the AI Chat page.
 *
 * Seeded with 14 entries: pricing, FAQ, campaign guidance, plus three
 * deliberately off-topic entries (`k-099`, `k-100`, `k-101`) so the
 * `confidence < 0.65` fallback path can be exercised.
 *
 * Entry ids:
 *   k-014 → Bulanan (high confidence target).
 *   k-007 → Mingguan (medium confidence target).
 *   k-001 … k-006, k-008 … k-013 → additional pricing/FAQ/campaign.
 *   k-099, k-100, k-101 → off-topic negatives (low lexical overlap).
 */
const T_UPDATED = dayjs('2026-06-15T00:00:00Z').unix();

export const knowledge: KnowledgeEntry[] = [
  {
    id: 'k-001',
    question: 'Apa saja paket layanan yang tersedia?',
    answer:
      'Kami menyediakan tiga paket utama: Mingguan, Bulanan, dan Tahunan. Paket Mingguan cocok untuk campaign singkat; Bulanan untuk运营 rutin; Tahunan untuk diskon hingga 20%.',
    tags: ['paket', 'pricing', 'layanan'],
    source: 'internal/pricing-2026Q3.md',
    sourceUrl: 'https://docs.internal/pricing-2026Q3',
    updatedAt: T_UPDATED,
  },
  {
    id: 'k-002',
    question: 'Bagaimana cara berlangganan paket Mingguan?',
    answer:
      'Untuk paket Mingguan, transfer Rp 1.500.000 ke rekening BCA 123-456-7890 atas nama PT Indocyber, lalu kirim bukti transfer via WhatsApp ke admin. Aktivasi dalam 1x24 jam.',
    tags: ['paket', 'mingguan', 'berlangganan'],
    source: 'internal/subscription-flow.md',
    sourceUrl: 'https://docs.internal/subscription-flow',
    updatedAt: T_UPDATED,
  },
  {
    id: 'k-003',
    question: 'Apakah paket Bulanan sudah termasuk report mingguan?',
    answer:
      'Ya, paket Bulanan sudah termasuk report mingguan yang dikirim setiap Jumat via WhatsApp dan email.',
    tags: ['paket', 'bulanan', 'report'],
    source: 'internal/pricing-2026Q3.md',
    sourceUrl: 'https://docs.internal/pricing-2026Q3',
    updatedAt: T_UPDATED,
  },
  {
    id: 'k-004',
    question: 'Berapa harga paket Tahunan?',
    answer:
      'Paket Tahunan Rp 45.000.000 untuk 12 bulan, sudah termasuk 144 posting dan 12 campaign.',
    tags: ['paket', 'tahunan', 'pricing'],
    source: 'internal/pricing-2026Q3.md',
    sourceUrl: 'https://docs.internal/pricing-2026Q3',
    updatedAt: T_UPDATED,
  },
  {
    id: 'k-005',
    question: 'Bagaimana cara tambah campaign dadakan?',
    answer:
      'Campaign dadakan dikenai biaya tambahan Rp 750.000 per campaign, sudah termasuk desain + publishing. Hubungi admin minimal H-2.',
    tags: ['campaign', 'dadakan', 'biaya'],
    source: 'internal/campaign-extras.md',
    sourceUrl: 'https://docs.internal/campaign-extras',
    updatedAt: T_UPDATED,
  },
  {
    id: 'k-006',
    question: 'Kapan jadwal posting Mingguan?',
    answer:
      'Paket Mingguan: 3 posting per minggu, dijadwalkan Senin, Rabu, dan Jumat pukul 10:00 WIB.',
    tags: ['jadwal', 'mingguan', 'posting'],
    source: 'internal/schedule-2026Q3.md',
    sourceUrl: 'https://docs.internal/schedule-2026Q3',
    updatedAt: T_UPDATED,
  },
  {
    id: 'k-007',
    question: 'Berapa harga paket campaign Mingguan?',
    answer:
      'Paket Mingguan Rp 1.500.000 include 3 posting + 1 desain.',
    tags: ['paket', 'mingguan', 'pricing'],
    source: 'internal/pricing-2026Q3.md',
    sourceUrl: 'https://docs.internal/pricing-2026Q3',
    updatedAt: T_UPDATED,
  },
  {
    id: 'k-008',
    question: 'Bagaimana cara melihat laporan performa?',
    answer:
      'Laporan performa tersedia di dashboard Mingguan dan Bulanan. Bulanan mendapat laporan mingguan otomatis via WhatsApp & email setiap Jumat.',
    tags: ['report', 'performa', 'dashboard'],
    source: 'internal/reporting.md',
    sourceUrl: 'https://docs.internal/reporting',
    updatedAt: T_UPDATED,
  },
  {
    id: 'k-009',
    question: 'Apakah bisa custom jumlah posting di paket Bulanan?',
    answer:
      'Paket Bulanan standar 12 posting + 1 campaign. Custom jumlah posting dapat dinegosiasi, hubungi admin untuk quotation.',
    tags: ['paket', 'bulanan', 'custom'],
    source: 'internal/pricing-2026Q3.md',
    sourceUrl: 'https://docs.internal/pricing-2026Q3',
    updatedAt: T_UPDATED,
  },
  {
    id: 'k-010',
    question: 'Platform sosial media apa saja yang didukung?',
    answer:
      'Saat ini kami mendukung Instagram, Facebook, TikTok, dan Twitter/X. YouTube dan LinkedIn masuk roadmap 2026 Q4.',
    tags: ['platform', 'sosial-media'],
    source: 'internal/platforms.md',
    sourceUrl: 'https://docs.internal/platforms',
    updatedAt: T_UPDATED,
  },
  {
    id: 'k-011',
    question: 'Bagaimana cara hubungi customer service?',
    answer:
      'Customer service tersedia via WhatsApp di +62 811-2222-3333 pada jam kerja (Senin-Jumat, 09:00-17:00 WIB).',
    tags: ['cs', 'kontak', 'support'],
    source: 'internal/contact.md',
    sourceUrl: 'https://docs.internal/contact',
    updatedAt: T_UPDATED,
  },
  {
    id: 'k-012',
    question: 'Apakah ada masa percobaan gratis?',
    answer:
      'Kami menyediakan trial 7 hari untuk paket Bulanan dengan cakupan 3 posting tanpa desain custom.',
    tags: ['trial', 'gratis', 'paket'],
    source: 'internal/trial.md',
    sourceUrl: 'https://docs.internal/trial',
    updatedAt: T_UPDATED,
  },
  {
    id: 'k-013',
    question: 'Bagaimana sistem pembayaran?',
    answer:
      'Pembayaran via transfer bank (BCA, Mandiri, BNI) atau QRIS. Invoice diterbitkan otomatis setelah pembayaran diterima.',
    tags: ['pembayaran', 'invoice'],
    source: 'internal/billing.md',
    sourceUrl: 'https://docs.internal/billing',
    updatedAt: T_UPDATED,
  },
  {
    id: 'k-014',
    question: 'Berapa harga paket Bulanan?',
    answer:
      'Paket Bulanan Rp 4.500.000 include 12 posting + 1 campaign. Sudah termasuk report mingguan dan dedicated account manager.',
    tags: ['paket', 'bulanan', 'pricing'],
    source: 'internal/pricing-2026Q3.md',
    sourceUrl: 'https://docs.internal/pricing-2026Q3',
    updatedAt: T_UPDATED,
  },
  // Off-topic negatives — no Indonesian pricing/FAQ keywords.
  {
    id: 'k-099',
    question: 'Bagaimana cara reset password admin?',
    answer:
      'Buka halaman login, klik "Lupa password", masukkan email admin, lalu cek inbox untuk tautan reset.',
    tags: ['admin', 'password'],
    source: 'internal/admin-help.md',
    updatedAt: T_UPDATED,
  },
  {
    id: 'k-100',
    question: 'Apa beda HTML dan CSS?',
    answer:
      'HTML adalah bahasa markup untuk struktur halaman; CSS adalah bahasa stylesheet untuk presentasi visual.',
    tags: ['web', 'frontend'],
    source: 'external/web-basics.md',
    updatedAt: T_UPDATED,
  },
  {
    id: 'k-101',
    question: 'Jadwal libur kantor 2026?',
    answer:
      'Libur nasional 2026: Tahun Baru, Imlek, Idul Fitri, Hari Buruh, Waisak, Idul Adha, Kemerdekaan, Natal.',
    tags: ['libur', 'kantor'],
    source: 'internal/holidays-2026.md',
    updatedAt: T_UPDATED,
  },
];