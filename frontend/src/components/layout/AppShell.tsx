import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useUiStore, type Pane1Selection, type ThemeMode } from '@/stores/ui';
import { ThemeToggle } from './ThemeToggle';
import { ShortcutHelpDialog } from './ShortcutHelpDialog';
import { useShortcuts } from '@/hooks/useShortcuts';
import { AuthStatusBanner } from './AuthStatusBanner';
import { Pane1Rail } from './Pane1Rail';
import { ChatSidebar } from '@/components/chats/ChatSidebar';
import { CrmSecondaryNav } from '@/components/crm/CrmSecondaryNav';
import { useAuthStatus } from '@/hooks/useAuthStatus';

/**
 * Top-level chrome — Pane 1 (icon-only left rail) + menu-driven Pane 2
 * (chat sidebar for chats/ai, CRM secondary nav for crm) + Pane 3
 * (routed `<Outlet />`). Hoisted `<AuthStatusBanner />` shows above the row.
 *
 * v6: per-pane scroll isolation — the outer container is fixed-height
 * (`h-screen overflow-hidden`) so the page itself never scrolls; each
 * pane owns its own internal `overflow-y-auto`. On mobile, Pane 1 +
 * Pane 2 are hidden behind a burger button (`md:hidden`); tapping the
 * burger slides them in from the left as a drawer with a backdrop.
 * On desktop (`md:flex`), the rail + Pane 2 remain permanently visible
 * exactly as in v5.
 *
 * See `docs/crm/features/navigation/spec.md` section 1.
 */
export function AppShell() {
  const theme = useUiStore((s) => s.theme);
  const pane1Selection = useUiStore((s) => s.pane1Selection);
  const mobileSidebarOpen = useUiStore((s) => s.mobileSidebarOpen);
  const setMobileSidebarOpen = useUiStore((s) => s.setMobileSidebarOpen);
  const location = useLocation();
  const navigate = useNavigate();
  const [helpOpen, setHelpOpen] = useState(false);
  const { data: authStatus } = useAuthStatus();

  // Auth gate: when WhatsApp is not yet open, redirect to the init page
  // (unless we're already on an auth-flow page). Skipped when status
  // hasn't loaded yet to avoid an infinite redirect loop on first paint.
  useEffect(() => {
    if (!authStatus) return;
    const onAuthFlow = location.pathname === '/auth-init' || location.pathname === '/qr';
    if (authStatus.state !== 'open' && !onAuthFlow) {
      navigate('/auth-init', { replace: true });
    }
  }, [authStatus?.state, location.pathname, navigate]);

  // Pane 2 is ALWAYS visible whenever the user is on a known menu
  // (chats / ai / crm / settings). Content depends on the menu: CRM
  // shows the CRM secondary nav; everything else (including AI
  // Settings) defaults to the chat list, per the user's
  // "default = chats list" directive.
  const isKnownMenu =
    pane1Selection === 'chats' ||
    pane1Selection === 'ai' ||
    pane1Selection === 'crm' ||
    pane1Selection === 'settings';
  const showPane2 = isKnownMenu;
  const pane2Content: 'chats' | 'crm' = pane1Selection === 'crm' ? 'crm' : 'chats';

  // Sync pane1Selection from the route so the rail highlight stays in
  // sync with the URL on deep-link, browser-back, and direct-URL nav.
  useEffect(() => {
    const path = location.pathname;
    let next: Pane1Selection;
    if (path.startsWith('/crm')) next = 'crm';
    else if (path.startsWith('/ai-settings')) next = 'settings';
    else if (path.startsWith('/ai')) next = 'ai';
    else next = 'chats';
    if (useUiStore.getState().pane1Selection !== next) {
      useUiStore.getState().setPane1Selection(next);
    }
  }, [location.pathname]);

  // v6: auto-close the mobile drawer whenever the route changes so
  // selecting a chat / nav item collapses the overlay.
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname, setMobileSidebarOpen]);

  useEffect(() => {
    const apply = (mode: ThemeMode) => {
      const root = document.documentElement;
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const effective = mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;
      root.classList.toggle('dark', effective === 'dark');
      root.lang = 'id';
    };
    apply(theme);
    if (theme !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply('system');
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [theme]);

  useShortcuts({
    onShowHelp: () => setHelpOpen(true),
    focusSearch: () => {
      document
        .querySelector<HTMLInputElement>('input[data-shortcut="sidebar-search"]')
        ?.focus();
    },
    focusComposer: () => {
      document
        .querySelector<HTMLTextAreaElement>('textarea[data-shortcut="ai-composer"]')
        ?.focus();
    },
  });

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className={cn(
          'flex h-screen flex-col overflow-hidden bg-background text-foreground',
          theme === 'dark' && 'dark'
        )}
      >
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-background focus:px-3 focus:py-1 focus:text-sm focus:shadow"
        >
          Skip to main content
        </a>
        <header className="z-40 flex h-14 shrink-0 items-center border-b bg-background/80 px-4 backdrop-blur">
          {/* LEFT — burger (mobile only) */}
          <div className="flex flex-1 items-center justify-start gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Buka menu"
              aria-expanded={mobileSidebarOpen}
              aria-controls="mobile-nav-drawer"
              onClick={() => setMobileSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" aria-hidden />
            </Button>
          </div>

          {/* CENTER — logo */}
          <div className="flex shrink-0 items-center justify-center px-4">
            <span className="text-sm font-semibold tracking-tight">Baileys Studio</span>
          </div>

          {/* RIGHT — auth + theme */}
          <div className="flex flex-1 items-center justify-end gap-2">
            <AuthStatusBanner />
            <ThemeToggle />
          </div>
        </header>
        {/* Row container: desktop gets Pane 1 + Pane 2 inline; main is always present. */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="hidden md:flex">
            <Pane1Rail />
            {showPane2 && (pane2Content === 'crm' ? <CrmSecondaryNav /> : <ChatSidebar />)}
          </div>
          <main id="main" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <Outlet />
          </main>
        </div>
        {/* v6: mobile drawer — rail + Pane 2 slide in from the left over a backdrop. */}
        {mobileSidebarOpen && (
          <>
            <button
              type="button"
              aria-label="Tutup menu"
              className="fixed inset-0 z-40 bg-black/50 md:hidden"
              onClick={() => setMobileSidebarOpen(false)}
            />
            <div
              id="mobile-nav-drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Menu navigasi"
              className="fixed inset-y-0 left-0 z-50 flex max-w-[85vw] animate-in slide-in-from-left duration-200 md:hidden"
            >
              <Pane1Rail />
              {showPane2 && (pane2Content === 'crm' ? <CrmSecondaryNav /> : <ChatSidebar />)}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-2 top-2 z-10"
                aria-label="Tutup menu"
                onClick={() => setMobileSidebarOpen(false)}
              >
                <X className="h-5 w-5" aria-hidden />
              </Button>
            </div>
          </>
        )}
        <Toaster richColors position="top-right" />
        <ShortcutHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
      </div>
    </TooltipProvider>
  );
}