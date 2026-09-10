import { describe, it, expect, beforeEach } from 'vitest';
import {
  AI_SETTINGS_STORAGE_KEY,
  AI_SETTINGS_STORAGE_VERSION,
  DEFAULT_AI_SETTINGS,
  type AiSettings,
} from '@/types/aiSettings';
import { useAiSettingsStore } from '@/stores/useAiSettingsStore';

/**
 * Minimal in-test `localStorage` polyfill. The project runs vitest in
 * `node` environment (no jsdom); the store tolerates a missing
 * `window` but tests want real assertions. We polyfill on `globalThis`
 * before each test runs.
 */
function installLocalStorageShim(): void {
  const store = new Map<string, string>();
  const shim = {
    getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).window = (globalThis as any).window ?? {};
  (globalThis as { window: { localStorage: typeof shim } }).window.localStorage = shim;
  // The store also tolerates `globalThis.localStorage` directly.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).localStorage = shim;
}

describe('stores/useAiSettingsStore — localStorage persistence', () => {
  beforeEach(() => {
    installLocalStorageShim();
    window.localStorage.clear();
    useAiSettingsStore.getState().reset();
  });

  it('initial state equals DEFAULT_AI_SETTINGS when localStorage is empty', () => {
    expect(useAiSettingsStore.getState().settings).toEqual(DEFAULT_AI_SETTINGS);
  });

  it('save() persists the envelope with version: 1 and bumps updatedAt', () => {
    const next: AiSettings = {
      ...DEFAULT_AI_SETTINGS,
      identity: { ...DEFAULT_AI_SETTINGS.identity, name: 'Acme Helper' },
      language: 'en',
    };
    useAiSettingsStore.getState().save(next);
    const raw = window.localStorage.getItem(AI_SETTINGS_STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string) as {
      version: number;
      value: AiSettings;
    };
    expect(parsed.version).toBe(AI_SETTINGS_STORAGE_VERSION);
    expect(parsed.value.identity.name).toBe('Acme Helper');
    expect(parsed.value.language).toBe('en');
    // updatedAt should be bumped to a fresh ISO timestamp.
    expect(parsed.value.updatedAt).not.toBe(DEFAULT_AI_SETTINGS.updatedAt);
    expect(new Date(parsed.value.updatedAt).toString()).not.toBe('Invalid Date');
  });

  it('reset() clears localStorage and reinstalls the defaults', () => {
    useAiSettingsStore.getState().save({
      ...DEFAULT_AI_SETTINGS,
      identity: { ...DEFAULT_AI_SETTINGS.identity, name: 'Should not persist' },
    });
    expect(window.localStorage.getItem(AI_SETTINGS_STORAGE_KEY)).toBeTruthy();
    useAiSettingsStore.getState().reset();
    expect(window.localStorage.getItem(AI_SETTINGS_STORAGE_KEY)).toBeNull();
    expect(useAiSettingsStore.getState().settings).toEqual(DEFAULT_AI_SETTINGS);
  });

  it('hydrate() falls back to defaults when JSON is malformed', () => {
    window.localStorage.setItem(AI_SETTINGS_STORAGE_KEY, '{ not json');
    useAiSettingsStore.getState().hydrate();
    expect(useAiSettingsStore.getState().settings).toEqual(DEFAULT_AI_SETTINGS);
  });

  it('hydrate() falls back to defaults when version !== 1', () => {
    window.localStorage.setItem(
      AI_SETTINGS_STORAGE_KEY,
      JSON.stringify({ version: 99, value: { identity: { name: 'wrong' } } })
    );
    useAiSettingsStore.getState().hydrate();
    expect(useAiSettingsStore.getState().settings).toEqual(DEFAULT_AI_SETTINGS);
  });

  it('hydrate() reads a well-formed envelope back into the store', () => {
    const saved: AiSettings = {
      ...DEFAULT_AI_SETTINGS,
      language: 'en',
      updatedAt: '2026-07-15T12:00:00.000Z',
    };
    window.localStorage.setItem(
      AI_SETTINGS_STORAGE_KEY,
      JSON.stringify({ version: AI_SETTINGS_STORAGE_VERSION, value: saved })
    );
    useAiSettingsStore.getState().hydrate();
    expect(useAiSettingsStore.getState().settings.language).toBe('en');
    expect(useAiSettingsStore.getState().settings.updatedAt).toBe('2026-07-15T12:00:00.000Z');
  });
});