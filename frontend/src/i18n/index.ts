import id from './id.json';
import en from './en.json';

export type Locale = 'id' | 'en';
export type Translations = typeof id;

const RESOURCES: Record<Locale, Translations> = {
  id,
  en,
};

let activeLocale: Locale = 'id';

/** Set the active locale (no locale-switcher UI yet; default is `id`). */
export function setLocale(locale: Locale): void {
  activeLocale = locale;
}

export function getLocale(): Locale {
  return activeLocale;
}

const TOKEN_RE = /\{(\w+)\}/g;

/**
 * Resolve a key path like `"chats.sidebar.retry"` against the active
 * locale. Supports `{name}` interpolation from the second argument.
 *
 * Falls back to the Indonesian bundle when the key is missing in the
 * active locale (currently both bundles are complete, so this branch
 * never triggers in practice).
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  const segments = key.split('.');
  const fromActive = dig(RESOURCES[activeLocale], segments);
  const fallback = dig(RESOURCES.id, segments);
  const raw = fromActive ?? fallback ?? key;
  if (!vars) return raw;
  return raw.replace(TOKEN_RE, (_, name: string) => String(vars[name] ?? `{${name}}`));
}

function dig(obj: unknown, segments: string[]): string | null {
  let cur: unknown = obj;
  for (const seg of segments) {
    if (cur && typeof cur === 'object' && seg in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return null;
    }
  }
  return typeof cur === 'string' ? cur : null;
}

export { id as idTranslations, en as enTranslations };