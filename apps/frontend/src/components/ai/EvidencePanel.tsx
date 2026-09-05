import { ExternalLink, FileText } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Evidence } from '@/types';

interface EvidencePanelProps {
  evidence: Evidence[];
}

/**
 * Collapsible "Lihat sumber" panel. Per
 * `docs/frontend/features/ai-chat/spec.md` §9.
 */
export function EvidencePanel({ evidence }: EvidencePanelProps) {
  if (evidence.length === 0) return null;
  return (
    <Collapsible className="mt-2 rounded-md border bg-card/40 text-xs">
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start rounded-b-none text-muted-foreground"
        >
          <FileText className="mr-2 h-3.5 w-3.5" />
          Lihat sumber ({evidence.length})
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 p-3 pt-0">
        {evidence.map((ev, idx) => (
          <EvidenceRow key={`${ev.entryId}-${idx}`} evidence={ev} index={idx + 1} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

function EvidenceRow({ evidence, index }: { evidence: Evidence; index: number }) {
  const inner = (
    <>
      <span className="font-mono text-[10px] text-muted-foreground">[{index}]</span>
      <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px]">
        {evidence.entryId}
      </span>
      <span className="flex-1 truncate">"{trimExcerpt(evidence.excerpt)}"</span>
      <span className="hidden text-muted-foreground sm:inline">Sumber: {evidence.source}</span>
      {evidence.sourceUrl && (
        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      )}
    </>
  );

  if (evidence.sourceUrl) {
    return (
      <a
        href={evidence.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'flex w-full items-center gap-2 rounded p-2 text-left hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
        )}
      >
        {inner}
      </a>
    );
  }
  return <div className="flex items-center gap-2 rounded p-2">{inner}</div>;
}

function trimExcerpt(s: string): string {
  const one = s.replace(/\s+/g, ' ').trim();
  if (one.length <= 120) return one;
  return one.slice(0, 117) + '…';
}