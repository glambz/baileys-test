import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { KnowledgeFileStatus } from '@/types/crm';

/**
 * Ingest-status chip.
 *
 * Keys match the backend's knowledge_files.status CHECK constraint
 * (queued / ingesting / indexed / failed). They previously did not, and an
 * unmapped status made `COPY[status]` undefined — reading `.className` off
 * that threw and took the entire Knowledge route down with it.
 *
 * `status` is typed loosely and resolved through a fallback on purpose: a
 * status the frontend has not been taught about should render as an unknown
 * chip, never crash the page it appears on.
 */
const COPY: Record<KnowledgeFileStatus, { label: string; className: string }> = {
  queued: {
    label: 'Menunggu',
    className: 'bg-muted text-muted-foreground',
  },
  ingesting: {
    label: 'Diproses',
    className: 'bg-warning/15 text-warning',
  },
  indexed: {
    label: 'Siap',
    className: 'bg-success/15 text-success',
  },
  failed: {
    label: 'Gagal',
    className: 'bg-destructive/15 text-destructive',
  },
};

function metaFor(status: string) {
  return (
    COPY[status as KnowledgeFileStatus] ?? {
      // Show the raw value rather than a generic "unknown" so an unexpected
      // backend state is diagnosable from the UI.
      label: status || 'Tidak diketahui',
      className: 'bg-muted text-muted-foreground',
    }
  );
}

interface StatusChipProps {
  status: KnowledgeFileStatus | string;
  errorMessage?: string | null;
}

export function StatusChip({ status, errorMessage }: StatusChipProps) {
  const meta = metaFor(status);
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
