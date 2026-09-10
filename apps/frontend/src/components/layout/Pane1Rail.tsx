import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, MessageSquare, SlidersHorizontal, Sparkles, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { selectPane1Selection, useUiStore, type Pane1Selection } from '@/stores/ui';

interface RailItem {
  id: Pane1Selection;
  label: string;
  ariaLabel: string;
  icon: typeof MessageSquare;
  href: string;
}

const ITEMS: RailItem[] = [
  { id: 'chats', label: 'Chats', ariaLabel: 'Buka Chats', icon: MessageSquare, href: '/chats' },
  { id: 'crm', label: 'CRM', ariaLabel: 'Buka CRM', icon: Briefcase, href: '/crm' },
  { id: 'ai', label: 'AI', ariaLabel: 'Buka AI', icon: Sparkles, href: '/ai' },
  { id: 'whatsapp', label: 'WhatsApp Connection', ariaLabel: 'Buka WhatsApp Connection', icon: Smartphone, href: '/whatsapp-connection' },
  { id: 'settings', label: 'AI Settings', ariaLabel: 'Buka AI Settings', icon: SlidersHorizontal, href: '/ai-settings' },
];

/**
 * Pane 1 — left rail with three vertically stacked icons (Chats / CRM / AI).
 *
 * v5: the rail is permanently icon-only (`w-16`). There is no collapse /
 * expand toggle. A one-shot `useEffect` below coerces any legacy
 * `pane1Collapsed: false` persisted in `localStorage` back to `true` so
 * the new behavior wins on the very first render after the upgrade.
 *
 * Tooltips are unconditional — the icon-only state is permanent, so the
 * label is never visible inline.
 *
 * See `docs/crm/features/navigation/spec.md` §1.1.
 */
export function Pane1Rail() {
  const selection = useUiStore(selectPane1Selection);
  const setCollapsed = useUiStore((s) => s.setPane1Collapsed);
  const navigate = useNavigate();

  // v5: coerce legacy `pane1Collapsed = false` storage values to `true`
  // so the rail renders icon-only on mount regardless of prior state.
  useEffect(() => {
    setCollapsed(true);
  }, [setCollapsed]);

  const choose = (item: RailItem) => {
    navigate(item.href);
  };

  return (
    <nav
      aria-label="Menu utama"
      className="flex w-16 shrink-0 flex-col items-stretch overflow-y-auto border-r bg-background"
    >
      <ul role="tablist" className="flex flex-1 flex-col py-2">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const active = selection === item.id;
          const body = (
            <button
              type="button"
              role="tab"
              aria-label={item.ariaLabel}
              aria-current={active ? 'page' : undefined}
              aria-selected={active}
              onClick={() => choose(item)}
              className={cn(
                'group relative flex w-full h-12 items-center justify-center text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'absolute right-0 top-0 h-full w-0.5 rounded-l-sm transition-opacity',
                  active ? 'bg-primary opacity-100' : 'opacity-0'
                )}
              />
              <Icon className="h-7 w-7 shrink-0" aria-hidden />
            </button>
          );
          return (
            <li key={item.id}>
              <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>{body}</TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}