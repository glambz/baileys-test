import { create } from 'zustand';
import {
  AI_SETTINGS_STORAGE_KEY,
  AI_SETTINGS_STORAGE_VERSION,
  DEFAULT_AI_SETTINGS,
  type AiSettings,
  type AiSettingsStorageEnvelope,
} from '@/types/aiSettings';

/**
 * AI Settings — Zustand store with localStorage persistence.
 *
 * Source of truth: `docs/tech/ai-settings-data-model.md` §5.
 *
 * Separation of concerns: this store owns the AI domain
 * (`AiSettings`) and does NOT touch `useUiStore` (Pane 1 selection,
 * mobile drawer, theme, etc.). The store runs in both browser and
 * jsdom environments; it is defensive about `window` being undefined
 * and about `localStorage` quota / private-mode errors.
 *
 * The localStorage key is the byte-locked
 * `'baileys-frontend:ai-settings'`. The envelope shape is
 * `{ version: 1, value: AiSettings }` — the `version` field is
 * reserved for future migrations; the current reader no-ops on a
 * `version !== 1` row and falls back to `DEFAULT_AI_SETTINGS`.
 *
 * The store is a plain Zustand `create` (NOT `persist` middleware)
 * so we have full control over the envelope and the malformed-row
 * fallback. This is what the brief asked for in Plan 09 MT-2.
 */

export interface AiSettingsState {
  settings: AiSettings;
  save: (next: AiSettings) => void;
  reset: () => void;
  hydrate: () => void;
}

function readEnvelope(): AiSettingsStorageEnvelope | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(AI_SETTINGS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AiSettingsStorageEnvelope> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.version !== AI_SETTINGS_STORAGE_VERSION) return null;
    if (!parsed.value || typeof parsed.value !== 'object') return null;
    return parsed as AiSettingsStorageEnvelope;
  } catch {
    return null;
  }
}

function writeEnvelope(value: AiSettings): void {
  if (typeof window === 'undefined') return;
  try {
    const env: AiSettingsStorageEnvelope = {
      version: AI_SETTINGS_STORAGE_VERSION,
      value,
    };
    window.localStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(env));
  } catch {
    /* ignore quota / private-mode failures */
  }
}

function clearEnvelope(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(AI_SETTINGS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Initial state reads from localStorage; if missing or malformed, the
 * defaults are installed in-memory and the store stays ready for the
 * next `save()` call (which will then persist the defaults).
 */
const initialSettings: AiSettings = (() => {
  const env = readEnvelope();
  if (env) return env.value;
  return DEFAULT_AI_SETTINGS;
})();

export const useAiSettingsStore = create<AiSettingsState>((set, get) => ({
  settings: initialSettings,
  save: (next) => {
    const bumped: AiSettings = { ...next, updatedAt: new Date().toISOString() };
    set({ settings: bumped });
    writeEnvelope(bumped);
  },
  reset: () => {
    clearEnvelope();
    set({ settings: DEFAULT_AI_SETTINGS });
  },
  hydrate: () => {
    const env = readEnvelope();
    if (env) {
      set({ settings: env.value });
    } else {
      set({ settings: DEFAULT_AI_SETTINGS });
    }
    // Touch get() so lint flags no unused-vars in strict mode.
    void get();
  },
}));

export const selectAiSettings = (s: AiSettingsState): AiSettings => s.settings;