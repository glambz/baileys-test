import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Lock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAiSettingsStore, selectAiSettings } from '@/stores/useAiSettingsStore';
import {
  CHAT_PERSONALITY_DESCRIPTIONS,
  CHAT_PERSONALITY_EXAMPLES,
  DEFAULT_AI_SETTINGS,
  TONE_DESCRIPTION_FE,
  WHATSAPP_PERSONALITY_DESCRIPTIONS,
  WHATSAPP_PERSONALITY_EXAMPLES,
  type AiChatPersonality,
  type AiLanguage,
  type AiSettings,
  type AiTone,
  type AiWhatsappPersonality,
} from '@/types/aiSettings';
import { getHardenedRulesBlock } from '@/lib/ai/systemPrompt';

/**
 * AI Settings page — `/ai-settings`.
 *
 * Plan 11 of the AI Settings cycle. Renders the seven form cards
 * (Identity, Tone, Language, Scope, Rules, WhatsApp Auto-reply,
 * Hardened read-only) in the canonical order, plus Save + Reset
 * buttons and a confirmation `<AlertDialog>` for the Reset action.
 *
 * Persistence is handled entirely by `useAiSettingsStore` (Plan 09).
 * The page owns a local `draft` so the operator can stage changes
 * before clicking Save; the draft is reset to the stored settings
 * after a successful save.
 */

const TONE_OPTIONS: Array<{ value: AiTone; label: string }> = [
  { value: 'formal', label: 'Formal' },
  { value: 'casual', label: 'Santai' },
  { value: 'friendly', label: 'Ramah' },
  { value: 'concise', label: 'Ringkas' },
  { value: 'enthusiastic', label: 'Antusias' },
  { value: 'warm-casual-indo', label: 'Warm Casual Indo' },
];

const LANGUAGE_OPTIONS: Array<{ value: AiLanguage; label: string }> = [
  { value: 'id', label: 'Indonesia' },
  { value: 'en', label: 'English' },
  { value: 'id-mod', label: 'Modern Indonesia' },
];

const WHATSAPP_PERSONALITY_OPTIONS: Array<{
  value: AiWhatsappPersonality;
  label: string;
  description: string;
}> = [
  {
    value: 'friendly-polite',
    label: 'Ramah & Sopan',
    description: WHATSAPP_PERSONALITY_DESCRIPTIONS['friendly-polite'],
  },
  {
    value: 'professional',
    label: 'Profesional & Ringkas',
    description: WHATSAPP_PERSONALITY_DESCRIPTIONS.professional,
  },
];

const CHAT_PERSONALITY_OPTIONS: Array<{
  value: AiChatPersonality;
  label: string;
  description: string;
}> = [
  {
    value: 'professional',
    label: 'Profesional',
    description: CHAT_PERSONALITY_DESCRIPTIONS.professional,
  },
  {
    value: 'casual',
    label: 'Santai',
    description: CHAT_PERSONALITY_DESCRIPTIONS.casual,
  },
];

const TONE_DESCRIPTIONS: Record<AiTone, string> = TONE_DESCRIPTION_FE;

const LANGUAGE_DESCRIPTIONS: Record<AiLanguage, string> = {
  id: 'Bahasa Indonesia formal. Output AI menggunakan bahasa baku.',
  en: 'English. Output AI menggunakan bahasa Inggris.',
  'id-mod': 'Bahasa Indonesia modern/kolokial. Output AI lebih santai dan natural.',
};

const HARDENED_NOTE =
  'Aturan ini dikunci demi keamanan data tenant dan tidak dapat diubah.';

const EXAMPLE_RULES: string[] = [
  'Jika kontak meminta barter atau hal di luar transaksi langsung, minta bantuan tim (escalate ke manusia).',
  'Selalu konfirmasi ulang sebelum menjanjikan diskon di luar paket standar.',
  'Jika pertanyaan di luar jam operasional, balas dengan sopan dan jelaskan kapan tim akan kembali.',
  'Jangan pernah meminta atau menyimpan data sensitif (KTP, nomor kartu) dari pelanggan.',
];

const CONFIDENCE_MIN = 0.5;
const CONFIDENCE_MAX = 0.95;
const CONFIDENCE_STEP = 0.05;
const CONFIDENCE_DEFAULT = DEFAULT_AI_SETTINGS.whatsappAutoReply.confidenceThreshold;

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function isStep(value: number): boolean {
  // 0.05 grid; allow tiny FP drift.
  const k = Math.round(value / CONFIDENCE_STEP);
  return Math.abs(k * CONFIDENCE_STEP - value) < 1e-9;
}

function validate(draft: AiSettings): {
  ok: boolean;
  errors: Partial<Record<string, string>>;
} {
  const errors: Partial<Record<string, string>> = {};
  if (!draft.identity.name.trim() || draft.identity.name.length < 2) {
    errors.name = 'Nama minimal 2 karakter.';
  }
  if (draft.identity.name.length > 80) {
    errors.name = 'Nama maksimal 80 karakter.';
  }
  if (!draft.identity.role.trim()) {
    errors.role = 'Peran wajib diisi.';
  }
  if (draft.identity.role.length > 120) {
    errors.role = 'Peran maksimal 120 karakter.';
  }
  if (draft.identity.description.length > 500) {
    errors.description = 'Deskripsi maksimal 500 karakter.';
  }
  const ct = draft.whatsappAutoReply.confidenceThreshold;
  if (typeof ct !== 'number' || Number.isNaN(ct)) {
    errors.confidenceThreshold = 'Nilai threshold tidak valid.';
  } else if (ct < CONFIDENCE_MIN || ct > CONFIDENCE_MAX) {
    errors.confidenceThreshold = `Threshold harus di antara ${CONFIDENCE_MIN} dan ${CONFIDENCE_MAX}.`;
  } else if (!isStep(ct)) {
    errors.confidenceThreshold = `Threshold harus kelipatan ${CONFIDENCE_STEP}.`;
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

function DraftFromSettings(s: AiSettings): AiSettings {
  return {
    identity: { ...s.identity },
    tone: s.tone,
    language: s.language,
    scope: {
      topics: [...s.scope.topics],
      excludedTopics: [...s.scope.excludedTopics],
      bannedPhrases: [...(s.scope.bannedPhrases ?? [])],
    },
    rules: [...s.rules],
    styleExamples: {
      positive: [...(s.styleExamples?.positive ?? [])],
      negative: [...(s.styleExamples?.negative ?? [])],
    },
    whatsappAutoReply: { ...s.whatsappAutoReply },
    fallbackEnabled: s.fallbackEnabled,
    whatsappPersonality: s.whatsappPersonality,
    chatPersonality: s.chatPersonality,
    updatedAt: s.updatedAt,
  };
}

export default function AiSettingsPage() {
  const settings = useAiSettingsStore(selectAiSettings);
  const save = useAiSettingsStore((s) => s.save);
  const reset = useAiSettingsStore((s) => s.reset);
  const hydrate = useAiSettingsStore((s) => s.hydrate);

  const [draft, setDraft] = useState<AiSettings>(() => DraftFromSettings(settings));
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [rulesBuffer, setRulesBuffer] = useState<string>(() =>
    settings.rules.join('\n')
  );
  const [topicsBuffer, setTopicsBuffer] = useState<string>(() =>
    settings.scope.topics.join('\n')
  );
  const [excludedBuffer, setExcludedBuffer] = useState<string>(() =>
    settings.scope.excludedTopics.join('\n')
  );
  const [greetingBuffer, setGreetingBuffer] = useState<string>(
    () => settings.identity.greeting ?? ''
  );
  const [closingBuffer, setClosingBuffer] = useState<string>(
    () => settings.identity.closing ?? ''
  );
  const [bannedBuffer, setBannedBuffer] = useState<string>(() =>
    (settings.scope.bannedPhrases ?? []).join('\n')
  );
  const [positiveBuffer, setPositiveBuffer] = useState<string>(() =>
    (settings.styleExamples?.positive ?? []).join('\n')
  );
  const [negativeBuffer, setNegativeBuffer] = useState<string>(() =>
    (settings.styleExamples?.negative ?? []).join('\n')
  );

  // Hydrate once on mount — defensive for SSR / first-paint.
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Re-sync the draft whenever the stored settings change externally.
  useEffect(() => {
    setDraft(DraftFromSettings(settings));
    setRulesBuffer(settings.rules.join('\n'));
    setTopicsBuffer(settings.scope.topics.join('\n'));
    setExcludedBuffer(settings.scope.excludedTopics.join('\n'));
    setGreetingBuffer(settings.identity.greeting ?? '');
    setClosingBuffer(settings.identity.closing ?? '');
    setBannedBuffer((settings.scope.bannedPhrases ?? []).join('\n'));
    setPositiveBuffer((settings.styleExamples?.positive ?? []).join('\n'));
    setNegativeBuffer((settings.styleExamples?.negative ?? []).join('\n'));
  }, [settings]);

  const hardened = useMemo(() => getHardenedRulesBlock(), []);

  const validation = useMemo(() => validate(draft), [draft]);
  const isValid = validation.ok;

  const onSave = () => {
    if (!isValid) {
      toast.error('Periksa kembali isian formulir.');
      return;
    }
    const bannedList = splitLines(bannedBuffer);
    const positiveList = splitLines(positiveBuffer);
    const negativeList = splitLines(negativeBuffer);
    const greeting = greetingBuffer.trim();
    const closing = closingBuffer.trim();
    const next: AiSettings = {
      ...draft,
      identity: {
        ...draft.identity,
        greeting: greeting.length > 0 ? greeting : undefined,
        closing: closing.length > 0 ? closing : undefined,
      },
      scope: {
        topics: splitLines(topicsBuffer),
        excludedTopics: splitLines(excludedBuffer),
        bannedPhrases: bannedList.length > 0 ? bannedList : undefined,
      },
      rules: splitLines(rulesBuffer),
      styleExamples:
        positiveList.length > 0 || negativeList.length > 0
          ? {
              positive: positiveList.length > 0 ? positiveList : undefined,
              negative: negativeList.length > 0 ? negativeList : undefined,
            }
          : undefined,
    };
    save(next);
    toast.success('Pengaturan AI disimpan');
  };

  const onReset = () => {
    reset();
    setConfirmResetOpen(false);
    toast.success('Pengaturan AI direset ke default.');
  };

  const onInsertExample = (rule: string) => {
    const next = rulesBuffer.length > 0 ? `${rulesBuffer}\n${rule}` : rule;
    setRulesBuffer(next);
    toast.success('Contoh aturan disisipkan ke kolom (klik Simpan untuk menyimpan).');
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">AI Settings</h1>
          <p className="text-sm text-muted-foreground">
            Sesuaikan identitas, nada, bahasa, cakupan, aturan, dan perilaku auto-reply
            WhatsApp AI tenant ini.
          </p>
          <p className="text-xs text-muted-foreground">
            Terakhir disimpan: <span className="font-mono">{draft.updatedAt}</span>
          </p>
        </header>

        {/* Card 1 — Identity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Identitas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="ai-settings-name">Nama</Label>
              <Input
                id="ai-settings-name"
                value={draft.identity.name}
                maxLength={80}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, identity: { ...d.identity, name: e.target.value } }))
                }
                aria-invalid={Boolean(validation.errors.name)}
              />
              {validation.errors.name && (
                <p className="text-xs text-destructive" role="alert">
                  {validation.errors.name}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="ai-settings-role">Peran</Label>
              <Input
                id="ai-settings-role"
                value={draft.identity.role}
                maxLength={120}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, identity: { ...d.identity, role: e.target.value } }))
                }
                aria-invalid={Boolean(validation.errors.role)}
              />
              {validation.errors.role && (
                <p className="text-xs text-destructive" role="alert">
                  {validation.errors.role}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="ai-settings-description">Deskripsi (opsional)</Label>
              <Textarea
                id="ai-settings-description"
                value={draft.identity.description}
                maxLength={500}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    identity: { ...d.identity, description: e.target.value },
                  }))
                }
                aria-invalid={Boolean(validation.errors.description)}
              />
              {validation.errors.description && (
                <p className="text-xs text-destructive" role="alert">
                  {validation.errors.description}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Card 2 — Tone (now also carries per-surface persona) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nada</CardTitle>
            <p className="text-xs text-muted-foreground">
              Atur gaya bicara AI: nada umum, persona untuk WhatsApp, dan persona
              untuk chat internal tim. Contoh di bawah tiap dropdown berubah
              mengikuti bahasa output yang dipilih di kartu Bahasa.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="ai-settings-tone">Pilih nada bicara AI</Label>
              <Select
                value={draft.tone}
                onValueChange={(v: AiTone) => setDraft((d) => ({ ...d, tone: v }))}
              >
                <SelectTrigger id="ai-settings-tone" className="w-full sm:w-72">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TONE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex flex-col gap-0.5">
                        <span>{opt.label}</span>
                        <span className="text-[10px] font-normal text-muted-foreground">
                          {TONE_DESCRIPTIONS[opt.value]}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {TONE_DESCRIPTIONS[draft.tone]}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ai-settings-whatsapp-personality">
                Pilih nada bicara AI WhatsApp
              </Label>
              <Select
                value={draft.whatsappPersonality}
                onValueChange={(v: AiWhatsappPersonality) =>
                  setDraft((d) => ({ ...d, whatsappPersonality: v }))
                }
              >
                <SelectTrigger
                  id="ai-settings-whatsapp-personality"
                  className="w-full sm:w-72"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WHATSAPP_PERSONALITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex flex-col gap-0.5">
                        <span>{opt.label}</span>
                        <span className="text-[10px] font-normal text-muted-foreground">
                          {opt.description}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {WHATSAPP_PERSONALITY_DESCRIPTIONS[draft.whatsappPersonality]}
              </p>
              <blockquote className="rounded-md border-l-4 border-primary/40 bg-muted/30 px-3 py-2 text-xs italic text-muted-foreground">
                “{WHATSAPP_PERSONALITY_EXAMPLES[draft.whatsappPersonality][draft.language]}”
              </blockquote>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ai-settings-chat-personality">
                Pilih nada bicara AI Chat Internal
              </Label>
              <Select
                value={draft.chatPersonality}
                onValueChange={(v: AiChatPersonality) =>
                  setDraft((d) => ({ ...d, chatPersonality: v }))
                }
              >
                <SelectTrigger
                  id="ai-settings-chat-personality"
                  className="w-full sm:w-72"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHAT_PERSONALITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex flex-col gap-0.5">
                        <span>{opt.label}</span>
                        <span className="text-[10px] font-normal text-muted-foreground">
                          {opt.description}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {CHAT_PERSONALITY_DESCRIPTIONS[draft.chatPersonality]}
              </p>
              <blockquote className="rounded-md border-l-4 border-primary/40 bg-muted/30 px-3 py-2 text-xs italic text-muted-foreground">
                “{CHAT_PERSONALITY_EXAMPLES[draft.chatPersonality][draft.language]}”
              </blockquote>
            </div>
          </CardContent>
        </Card>

        {/* Card 2a — Salam Pembuka */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Salam pembuka (opsional)</CardTitle>
            <p className="text-xs text-muted-foreground">
              Template salam pembuka yang dipakai AI di awal balasan saat tone Warm
              Casual Indo atau Friendly dipilih. Kosongkan untuk menonaktifkan.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="ai-settings-greeting">Salam pembuka</Label>
            <Textarea
              id="ai-settings-greeting"
              value={greetingBuffer}
              onChange={(e) => setGreetingBuffer(e.target.value)}
              placeholder={'Halo kak! Ada yang bisa dibantu hari ini? 🙏'}
              rows={2}
            />
            <p className="text-xs text-muted-foreground">
              Salam pembuka akan dirender ke system prompt sebagai bagian{' '}
              <span className="font-mono">## Salam pembuka</span> saat tidak kosong.
            </p>
          </CardContent>
        </Card>

        {/* Card 2b — Penutup */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Penutup (opsional)</CardTitle>
            <p className="text-xs text-muted-foreground">
              Template penutup yang dipakai AI di akhir balasan. Kosongkan untuk
              menonaktifkan.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="ai-settings-closing">Penutup</Label>
            <Textarea
              id="ai-settings-closing"
              value={closingBuffer}
              onChange={(e) => setClosingBuffer(e.target.value)}
              placeholder={'Kalau ada lagi, bilang aja ya kak 🙏'}
              rows={2}
            />
          </CardContent>
        </Card>

        {/* Card 2c — Frasa yang Dilarang */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Frasa yang dilarang (opsional)</CardTitle>
            <p className="text-xs text-muted-foreground">
              Satu frasa per baris. AI tidak akan menggunakan frasa-frasa ini di
              jawabannya. Contoh:{' '}
              <span className="font-mono">Berdasarkan informasi</span>,{' '}
              <span className="font-mono">kami menyediakan</span>,{' '}
              <span className="font-mono">mohon maaf sebelumnya</span>.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="ai-settings-banned">Frasa yang dilarang (satu per baris)</Label>
            <Textarea
              id="ai-settings-banned"
              value={bannedBuffer}
              onChange={(e) => setBannedBuffer(e.target.value)}
              rows={3}
              placeholder={'Berdasarkan informasi\nkami menyediakan\nmohon maaf'}
            />
          </CardContent>
        </Card>

        {/* Card 2d — Contoh Jawaban */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contoh jawaban (opsional)</CardTitle>
            <p className="text-xs text-muted-foreground">
              Beri satu contoh jawaban yang bagus dan satu yang harus dihindari
              (satu per baris). AI akan mengikuti pola ini di respons berikutnya.
            </p>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ai-settings-positive">Jawaban yang bagus</Label>
              <Textarea
                id="ai-settings-positive"
                value={positiveBuffer}
                onChange={(e) => setPositiveBuffer(e.target.value)}
                rows={4}
                placeholder={'Halo kak, lagi cek ya, ditunggu 🙏'}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ai-settings-negative">Jawaban yang harus dihindari</Label>
              <Textarea
                id="ai-settings-negative"
                value={negativeBuffer}
                onChange={(e) => setNegativeBuffer(e.target.value)}
                rows={4}
                placeholder={'Berdasarkan informasi yang kami terima…'}
              />
            </div>
          </CardContent>
        </Card>

        {/* Card 3 — Language */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bahasa</CardTitle>
            <p className="text-xs text-muted-foreground">
              Bahasa yang dipakai AI untuk menjawab. Contoh persona di kartu Nada
              akan otomatis berubah mengikuti bahasa yang dipilih di sini.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="ai-settings-language">Pilih bahasa output</Label>
            <Select
              value={draft.language}
              onValueChange={(v: AiLanguage) => setDraft((d) => ({ ...d, language: v }))}
            >
              <SelectTrigger id="ai-settings-language" className="w-full sm:w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div className="flex flex-col gap-0.5">
                      <span>{opt.label}</span>
                      <span className="text-[10px] font-normal text-muted-foreground">
                        {LANGUAGE_DESCRIPTIONS[opt.value]}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {LANGUAGE_DESCRIPTIONS[draft.language]}
            </p>
          </CardContent>
        </Card>

        {/* Card 4 — Scope */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cakupan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="ai-settings-topics">Topik (satu per baris)</Label>
              <Textarea
                id="ai-settings-topics"
                value={topicsBuffer}
                onChange={(e) => setTopicsBuffer(e.target.value)}
                rows={3}
                placeholder={'harga paket\njadwal campaign'}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ai-settings-excluded">Topik yang dikecualikan (satu per baris)</Label>
              <Textarea
                id="ai-settings-excluded"
                value={excludedBuffer}
                onChange={(e) => setExcludedBuffer(e.target.value)}
                rows={3}
                placeholder={'topik A\ntopik B'}
              />
            </div>
          </CardContent>
        </Card>

        {/* Card 5 — Rules */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aturan tambahan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-xs font-medium">Contoh aturan (klik untuk menyisipkan):</p>
              <ul className="mt-2 space-y-1 text-xs">
                {EXAMPLE_RULES.map((ex) => (
                  <li key={ex}>
                    <button
                      type="button"
                      onClick={() => onInsertExample(ex)}
                      className="text-left text-primary underline-offset-2 hover:underline"
                    >
                      {ex}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <Label htmlFor="ai-settings-rules">Aturan (satu per baris)</Label>
            <Textarea
              id="ai-settings-rules"
              value={rulesBuffer}
              onChange={(e) => setRulesBuffer(e.target.value)}
              rows={4}
              placeholder={'Tulis aturan kustom di sini…'}
            />
            <p className="text-xs text-muted-foreground">
              Aturan yang disimpan kosong sampai Anda menekan Simpan.
            </p>
          </CardContent>
        </Card>

        {/* Card 6 — WhatsApp Auto-reply */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">WhatsApp auto-reply</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="ai-settings-wa-enabled">Aktifkan auto-reply</Label>
              <Switch
                id="ai-settings-wa-enabled"
                checked={draft.whatsappAutoReply.enabled}
                onCheckedChange={(checked) =>
                  setDraft((d) => ({
                    ...d,
                    whatsappAutoReply: { ...d.whatsappAutoReply, enabled: Boolean(checked) },
                  }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ai-settings-wa-threshold">Confidence threshold</Label>
              <Input
                id="ai-settings-wa-threshold"
                type="number"
                min={CONFIDENCE_MIN}
                max={CONFIDENCE_MAX}
                step={CONFIDENCE_STEP}
                value={draft.whatsappAutoReply.confidenceThreshold}
                placeholder={String(CONFIDENCE_DEFAULT)}
                onChange={(e) => {
                  const raw = e.target.value;
                  const parsed = raw === '' ? Number.NaN : Number(raw);
                  setDraft((d) => ({
                    ...d,
                    whatsappAutoReply: {
                      ...d.whatsappAutoReply,
                      confidenceThreshold: parsed,
                    },
                  }));
                }}
                aria-invalid={Boolean(validation.errors.confidenceThreshold)}
              />
              <p className="text-xs text-muted-foreground">
                Rentang {CONFIDENCE_MIN}–{CONFIDENCE_MAX} dengan kelipatan {CONFIDENCE_STEP}.
                Default: {CONFIDENCE_DEFAULT}.
              </p>
              {validation.errors.confidenceThreshold && (
                <p className="text-xs text-destructive" role="alert">
                  {validation.errors.confidenceThreshold}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Card 6b — Pesan Fallback */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pesan Fallback</CardTitle>
            <p className="text-xs text-muted-foreground">
              Kalau AI tidak bisa menjawab dari knowledge DB, kirim pesan fallback
              ke kontak. Kalau mati, AI hanya flag chat untuk dijawab manusia tanpa
              kirim pesan.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="ai-settings-fallback-enabled">
                Kirim pesan fallback ke kontak
              </Label>
              <Switch
                id="ai-settings-fallback-enabled"
                checked={draft.fallbackEnabled}
                onCheckedChange={(checked) =>
                  setDraft((d) => ({ ...d, fallbackEnabled: Boolean(checked) }))
                }
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Pesan fallback default:{' '}
              <span className="font-mono">
                Maaf kak, untuk hal itu belum ada di data kami ya 🙏
              </span>
              . Kalau dimatikan, AI tidak mengirim pesan ini; chat hanya ditandai
              untuk dijawab manusia.
            </p>
          </CardContent>
        </Card>

        {/* Card 7 — Hardened (read-only) */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">Aturan yang dikunci</CardTitle>
              <Lock className="h-4 w-4 text-muted-foreground" aria-hidden />
            </div>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal space-y-2 pl-5 text-sm">
              {hardened.split('\n').map((line, idx) => {
                // Strip the leading "N. " from the line for display in the <ol>.
                const trimmed = line.replace(/^\d+\.\s*/, '');
                return <li key={idx}>{trimmed}</li>;
              })}
            </ol>
            <p className="mt-3 text-xs text-muted-foreground">{HARDENED_NOTE}</p>
          </CardContent>
        </Card>

        {/* Action bar */}
        <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Button variant="secondary" onClick={() => setConfirmResetOpen(true)}>
            Reset ke default
          </Button>
          <Button onClick={onSave} disabled={!isValid}>
            Simpan pengaturan
          </Button>
        </div>

        <AlertDialog open={confirmResetOpen} onOpenChange={setConfirmResetOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Yakin reset ke pengaturan awal?</AlertDialogTitle>
              <AlertDialogDescription>
                Semua perubahan yang belum disimpan akan hilang dan pengaturan AI akan
                dikembalikan ke nilai default.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Batal</AlertDialogCancel>
              <AlertDialogAction onClick={onReset}>Reset</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}