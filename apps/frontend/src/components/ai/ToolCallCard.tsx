/**
 * ToolCallCard — collapsible chip showing one AI tool invocation.
 * Source: docs/specs/2026-08-18-in-app-ai-chat-polish.md
 */
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

export interface ToolCallProps {
  name: string;
  input: unknown;
  resultCount: number;
  retrievalScore?: number;
}

export function ToolCallCard({ name, input, resultCount, retrievalScore }: ToolCallProps) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded border border-border bg-muted/40 text-xs"
    >
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-muted/60">
        {open ? (
          <ChevronDown className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" />
        )}
        <Badge variant="outline" className="font-mono text-[10px]">
          {name}
        </Badge>
        <span className="text-muted-foreground">
          {resultCount} result{resultCount === 1 ? '' : 's'}
          {typeof retrievalScore === 'number' && ` · score ${retrievalScore.toFixed(2)}`}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="overflow-x-auto border-t border-border bg-background/50 p-2 text-[10px] leading-relaxed">
          {JSON.stringify(input, null, 2)}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}
