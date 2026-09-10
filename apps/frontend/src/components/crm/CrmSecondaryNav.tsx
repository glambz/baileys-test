import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { useEntities } from '@/hooks/crm/useEntities';
import {
  LayoutGrid,
  Database,
  Table2,
  BookOpen,
  Search,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type NavItem = { label: string; to: string; icon: LucideIcon };

const NAV_ITEMS: NavItem[] = [
  { label: 'Beranda', to: '/crm', icon: LayoutGrid },
  { label: 'Schema', to: '/crm/_schema', icon: Database },
  { label: 'Data', to: '/crm', icon: Table2 },
  { label: 'Knowledge', to: '/crm/_knowledge', icon: BookOpen },
];

/**
 * Pane 2 quick-navigation surface for the CRM menu. Styled like
 * `ChatSidebar`; renders a vertical nav to the CRM destinations. The
 * `CrmWorkspacePage` keeps its own Tabs — this is a parallel nav.
 *
 * v5: like `ChatSidebar`, this is permanently visible at every viewport
 * width — no mobile drawer, no close-X button, no `mobileSidebarOpen`
 * toggle.
 */
export function CrmSecondaryNav() {
  const entitiesQuery = useEntities();
  const [query, setQuery] = useState('');

  return (
    <aside
      className="flex h-full min-h-0 w-80 shrink-0 flex-col border-r bg-background"
      aria-label="Navigasi CRM"
    >
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          CRM
        </span>
      </div>

      <div className="border-b p-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            placeholder="Cari entitas..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Cari entitas"
            className="pl-8"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {entitiesQuery.isLoading ? (
          <NavSkeleton />
        ) : entitiesQuery.isError ? (
          <NavError
            message={
              (entitiesQuery.error as Error | null)?.message ?? 'Tidak dapat memuat entitas'
            }
            onRetry={() => void entitiesQuery.refetch()}
          />
        ) : (entitiesQuery.data?.length ?? 0) === 0 ? (
          <NavEmpty />
        ) : (
          <ul role="list" className="space-y-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.label}>
                <NavLink
                  to={item.to}
                  end={item.to === '/crm'}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium',
                      isActive
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                    )
                  }
                >
                  <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function NavSkeleton() {
  return (
    <div className="space-y-1">
      {Array.from({ length: 5 }).map((_, idx) => (
        <div key={idx} className="flex h-9 items-center gap-3 px-3">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

function NavEmpty() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-12 text-center text-sm text-muted-foreground">
      <LayoutGrid className="h-10 w-10 opacity-40" aria-hidden />
      <p>Belum ada entitas. Buat entitas pertama Anda di tab Schema.</p>
    </div>
  );
}

function NavError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex h-full items-center justify-center p-4">
      <Card className="w-full max-w-sm border-destructive/40 bg-destructive/5 p-4">
        <p className="text-sm font-medium text-destructive">{message}</p>
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          <RefreshCw className="mr-2 h-4 w-4" /> Coba lagi
        </Button>
      </Card>
    </div>
  );
}
