import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { KnowledgeFileStatus } from '@/types/crm';

const COPY: Record<KnowledgeFileStatus, { label: string; className: string }> = {
  pending: { label: 'Menunggu', className: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200' },
  chunked: { label: 'Dipecah', className: 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200' },
  embedded: { label: 'Siap', className: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200' },
  failed: { label: 'Gagal', className: 'bg-rose-100 text-rose-900 dark:bg-rose-900/30 dark:text-rose-200' },
};

interface StatusChipProps {
  status: KnowledgeFileStatus;
  errorMessage?: string | null;
}

export function StatusChip({ status, errorMessage }: StatusChipProps) {
  const meta = COPY[status];
  const chip = (
    <Badge variant="outline" className={meta.className}>
      {meta.label}
    </Badge>
  );
  if (status !== 'failed' || !errorMessage) return chip;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{chip}</TooltipTrigger>
      <TooltipContent>{errorMessage}</TooltipContent>
    </Tooltip>
  );
}
