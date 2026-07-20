import { Badge } from '@/components/ui/badge';
import type { AIReplyMode } from '@/types/crm';

interface AiModeBadgeProps {
  mode: AIReplyMode | undefined;
}

/**
 * Small chip rendered on the chat list row when `aiMode === 'human_pending_flag'`.
 * Hidden for all other states.
 */
export function AiModeBadge({ mode }: AiModeBadgeProps) {
  if (mode !== 'human_pending_flag') return null;
  return (
    <Badge
      variant="outline"
      className="border-amber-300 bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
      data-testid="ai-mode-badge"
    >
      Butuh manusia
    </Badge>
  );
}
