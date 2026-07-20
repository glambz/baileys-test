import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface ConfidenceBadgeProps {
  value: number;
}

const HIGH_THRESHOLD = 0.85;
const MEDIUM_THRESHOLD = 0.65;

/**
 * Confidence badge — emerald (high ≥ 0.85), amber (medium 0.65–0.85),
 * rose (low < 0.65). Color rule from
 * `docs/frontend/features/ai-chat/spec.md` §6.
 */
export function ConfidenceBadge({ value }: ConfidenceBadgeProps) {
  const bucket = bucketFor(value);
  const label = bucket === 'high' ? 'Tinggi' : bucket === 'medium' ? 'Sedang' : 'Rendah';
  const tooltip =
    bucket === 'high'
      ? 'Tinggi — jawaban diambil dari sumber yang jelas.'
      : bucket === 'medium'
        ? 'Sedang — jawaban diambil dari sumber yang relevan tetapi tidak identik.'
        : 'Rendah — tidak yakin; tampilkan fallback.';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex cursor-default items-center rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors',
            badgeClasses(bucket)
          )}
          aria-label={`Keyakinan ${label}, skor ${value.toFixed(2)}`}
        >
          {label} · {value.toFixed(2)}
        </span>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

export function bucketFor(value: number): 'high' | 'medium' | 'low' {
  if (value >= HIGH_THRESHOLD) return 'high';
  if (value >= MEDIUM_THRESHOLD) return 'medium';
  return 'low';
}

function badgeClasses(bucket: 'high' | 'medium' | 'low'): string {
  switch (bucket) {
    case 'high':
      return 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200';
    case 'medium':
      return 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200';
    case 'low':
      return 'bg-rose-100 text-rose-900 dark:bg-rose-900/30 dark:text-rose-200';
  }
}