import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useUiStore } from '@/stores/ui';

export interface UseShortcutsOptions {
  focusSearch?: () => void;
  focusComposer?: () => void;
  focusCrmSearch?: () => void;
  openNewRecord?: () => void;
  openKnowledgeUpload?: () => void;
  onShowHelp: () => void;
}

const isInputFocused = (): boolean => {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || (el as HTMLElement).isContentEditable;
};

/**
 * Global keyboard shortcut dispatcher.
 *
 * Existing shortcut set (preserved from the WhatsApp module):
 *   `/`   - focus the sidebar search box (Chats) or AI composer.
 *   `?`   - open the shortcut help dialog.
 *   `g c` - navigate to /chats.
 *   `g a` - navigate to /ai-chat.
 *
 * New shortcut set (this run, Plan 08 task 2):
 *   `Alt+1` / `Alt+2` / `Alt+3` / `Alt+4` - switch `pane1Selection`
 *     to chats / crm / ai / settings and navigate to the matching route.
 *   `c` (on /crm) - focus the data-viewer search input.
 *   `n` (on /crm/:entityName) - open the + New record modal.
 *   `u` (on /crm/_knowledge) - focus the upload dropzone.
 *
 * Shortcuts are no-ops when the user is typing in an `<input>` or
 * `<textarea>` (except `Esc`). `Alt+1/2/3` are accepted even when
 * typing because they are menu switches.
 */
export function useShortcuts(opts: UseShortcutsOptions) {
  const [pendingG, setPendingG] = useState<{ at: number; key: string } | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const setPane1Selection = useUiStore((s) => s.setPane1Selection);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      // Menu alt-shortcuts pass through typing state.
      if (event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
        if (event.key === '1') {
          event.preventDefault();
          setPane1Selection('chats');
          navigate('/chats');
          return;
        }
        if (event.key === '2') {
          event.preventDefault();
          setPane1Selection('crm');
          navigate('/crm');
          return;
        }
        if (event.key === '3') {
          event.preventDefault();
          setPane1Selection('ai');
          navigate('/ai');
          return;
        }
        if (event.key === '4') {
          event.preventDefault();
          setPane1Selection('settings');
          navigate('/ai-settings');
          return;
        }
      }

      // `c` focuses CRM search when on /crm* and not typing.
      if (
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !isInputFocused() &&
        (event.key === 'c' || event.key === 'C') &&
        location.pathname.startsWith('/crm')
      ) {
        const el = document.querySelector<HTMLInputElement>('input[data-shortcut="crm-search"]');
        if (el) {
          event.preventDefault();
          el.focus();
          return;
        }
      }

      // `n` opens new record modal.
      if (
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !isInputFocused() &&
        (event.key === 'n' || event.key === 'N') &&
        /^\/crm\/[^/]+$/.test(location.pathname)
      ) {
        const btn = document.querySelector<HTMLButtonElement>('button[data-shortcut="new-record"]');
        if (btn) {
          event.preventDefault();
          btn.click();
          return;
        }
      }

      // `u` focuses knowledge upload.
      if (
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !isInputFocused() &&
        (event.key === 'u' || event.key === 'U') &&
        location.pathname === '/crm/_knowledge'
      ) {
        const el = document.querySelector<HTMLLabelElement>('label[data-shortcut="upload"]');
        if (el) {
          event.preventDefault();
          el.click();
          return;
        }
      }

      if (isInputFocused()) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === '?') {
        event.preventDefault();
        opts.onShowHelp();
        return;
      }
      if (event.key === '/') {
        event.preventDefault();
        if (location.pathname.startsWith('/ai') || location.pathname.startsWith('/ai-chat')) {
          opts.focusComposer?.();
        } else {
          opts.focusSearch?.();
        }
        return;
      }
      if (event.key === 'g') {
        setPendingG({ at: Date.now(), key: 'g' });
        return;
      }
      if (pendingG && Date.now() - pendingG.at < 1500) {
        if (event.key === 'c') {
          event.preventDefault();
          navigate('/chats');
          setPendingG(null);
          return;
        }
        if (event.key === 'a') {
          event.preventDefault();
          navigate('/ai-chat');
          setPendingG(null);
          return;
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [opts, location.pathname, navigate, pendingG, setPane1Selection]);
}
