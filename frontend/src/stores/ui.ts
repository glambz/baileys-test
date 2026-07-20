import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'system';

/**
 * Pane 1 (left rail) selection in the new three-pane layout per
 * `docs/crm/features/navigation/spec.md` §1.1.
 */
export type Pane1Selection = 'chats' | 'crm' | 'ai' | 'settings';

interface UiState {
  lastOpenedChatId: string | null;
  setLastOpenedChatId: (id: string | null) => void;
  authBannerDismissed: boolean;
  dismissAuthBanner: () => void;
  showArchived: boolean;
  setShowArchived: (show: boolean) => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  mobileSidebarOpen: boolean;
  setMobileSidebarOpen: (open: boolean) => void;
  pane1Selection: Pane1Selection;
  setPane1Selection: (sel: Pane1Selection) => void;
  pane1Collapsed: boolean;
  setPane1Collapsed: (collapsed: boolean) => void;
}

const STORAGE_KEY = 'baileys-frontend:ui';
const PANE_KEY = 'baileys-frontend:pane1';

/**
 * Cross-route UI state — owned by Zustand per
 * `docs/tech/frontend-stack.md` §2.
 */
export const useUiStore = create<UiState>((set) => ({
  lastOpenedChatId: null,
  setLastOpenedChatId: (id) => set({ lastOpenedChatId: id }),
  authBannerDismissed: false,
  dismissAuthBanner: () => set({ authBannerDismissed: true }),
  showArchived: false,
  setShowArchived: (show) => set({ showArchived: show }),
  theme: 'system',
  setTheme: (theme) => {
    set({ theme });
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme }));
    } catch {
      /* ignore storage failures */
    }
  },
  mobileSidebarOpen: false,
  setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
  pane1Selection: 'chats',
  setPane1Selection: (sel) => {
    set({ pane1Selection: sel });
    try {
      window.localStorage.setItem(PANE_KEY, JSON.stringify({ selection: sel }));
    } catch {
      /* ignore */
    }
  },
  pane1Collapsed: false,
  setPane1Collapsed: (collapsed) => {
    set({ pane1Collapsed: collapsed });
    try {
      window.localStorage.setItem(PANE_KEY, JSON.stringify({ collapsed }));
    } catch {
      /* ignore */
    }
  },
}));

export const selectPane1Selection = (s: UiState): Pane1Selection => s.pane1Selection;
export const selectPane1Collapsed = (s: UiState): boolean => s.pane1Collapsed;

/**
 * One-shot hydration of the persisted theme. Called from `main.tsx`
 * before the first render so the initial paint matches the user's
 * previous selection.
 */
export function hydrateUiFromStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { theme?: ThemeMode };
    if (parsed.theme === 'light' || parsed.theme === 'dark' || parsed.theme === 'system') {
      useUiStore.setState({ theme: parsed.theme });
    }
  } catch {
    /* ignore corrupt storage */
  }
  try {
    const rawPane = window.localStorage.getItem(PANE_KEY);
    if (!rawPane) return;
    const parsed = JSON.parse(rawPane) as { collapsed?: boolean; selection?: Pane1Selection };
    if (typeof parsed.collapsed === 'boolean') {
      useUiStore.setState({ pane1Collapsed: parsed.collapsed });
    }
    // Hydrate selection only as a best-effort hint; the AppShell effect
    // is authoritative and will overwrite on first pathname change.
    if (
      parsed.selection === 'chats' ||
      parsed.selection === 'crm' ||
      parsed.selection === 'ai' ||
      parsed.selection === 'settings'
    ) {
      useUiStore.setState({ pane1Selection: parsed.selection });
    }
  } catch {
    /* ignore corrupt storage */
  }
}