import dayjs from 'dayjs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useAuthStatus } from '@/hooks/useAuthStatus';

const COLORS = {
  open: 'bg-emerald-500 dark:bg-emerald-400',
  qr: 'bg-amber-500 dark:bg-amber-400',
  connecting: 'bg-amber-500 dark:bg-amber-400',
  close: 'bg-red-500 dark:bg-red-400',
} as const;

const LABELS = {
  open: 'Terhubung',
  qr: 'Menghubungkan',
  connecting: 'Menghubungkan',
  close: 'Tidak terhubung',
} as const;

/**
 * Top-right pill that surfaces the WhatsApp connection state.
 *
 * Plan 03 ships a minimal version driven by `useAuthStatus()`. Plan 04
 * refines the loading/error states.
 */
export function AuthStatusBanner() {
  const { data, isLoading, isError } = useAuthStatus();

  if (isLoading) {
    return (
      <Skeleton className="h-7 w-28 rounded-full" role="status" aria-label="Memuat status" />
    );
  }

  if (isError || !data) {
    return (
      <span
        className="inline-flex items-center gap-2 rounded-full bg-destructive/15 px-3 py-1 text-xs font-medium text-destructive"
        role="status"
        aria-label="Status tidak tersedia"
      >
        <span className="h-2 w-2 rounded-full bg-destructive" aria-hidden />
        Error
      </span>
    );
  }

  const color = COLORS[data.state] ?? COLORS.close;
  const label = LABELS[data.state] ?? data.state;
  const tooltip = data.lastUpdatedAt
    ? dayjs.unix(data.lastUpdatedAt).format('YYYY-MM-DD HH:mm')
    : 'waktu tidak diketahui';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="status"
          aria-label={`Status koneksi: ${label}`}
          className={cn(
            'inline-flex cursor-default items-center gap-2 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground'
          )}
        >
          <span className={cn('h-2 w-2 rounded-full', color)} aria-hidden />
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}