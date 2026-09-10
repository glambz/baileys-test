import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ConfidenceBadge } from './ConfidenceBadge';
import { EvidencePanel } from './EvidencePanel';
import { cn } from '@/lib/utils';
import type { AskAiResponse, Evidence } from '@/types';

export type TranscriptItem =
  | { id: string; role: 'user'; question: string }
  | { id: string; role: 'ai'; payload: Extract<AskAiResponse, { kind: 'answered' }> }
  | { id: string; role: 'fallback'; payload: Extract<AskAiResponse, { kind: 'fallback' }> };

interface TranscriptProps {
  items: TranscriptItem[];
}

/**
 * AI Chat transcript. User bubbles right; AI answered bubbles left with
 * confidence badge + evidence; fallback bubbles left with the byte-
 * identical Indonesian sentence and (when present) a suggestion card.
 */
export function Transcript({ items }: TranscriptProps) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-3" role="log" aria-live="polite" aria-relevant="additions">
      {items.map((item) => {
        if (item.role === 'user') {
          return (
            <div key={item.id} className="flex justify-end">
              <Bubble align="right" variant="primary">
                {item.question}
              </Bubble>
            </div>
          );
        }
        if (item.role === 'ai') {
          return (
            <div key={item.id} className="flex justify-start">
              <div className="max-w-[80%] space-y-1">
                <Bubble align="left" variant="muted">
                  {item.payload.answer}
                </Bubble>
                <div className="flex items-center gap-2 px-1">
                  <ConfidenceBadge value={item.payload.confidence} />
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(item.payload.generatedAt * 1000).toLocaleTimeString('id-ID', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <EvidencePanel evidence={item.payload.evidence as Evidence[]} />
              </div>
            </div>
          );
        }
        // fallback
        return (
          <div key={item.id} className="flex justify-start">
            <div className="max-w-[80%] space-y-2">
              <Bubble align="left" variant="muted-soft">
                {item.payload.message}
              </Bubble>
              {item.payload.suggestion && <SuggestionCard suggestion={item.payload.suggestion} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Bubble({
  align,
  variant,
  children,
}: {
  align: 'left' | 'right';
  variant: 'primary' | 'muted' | 'muted-soft';
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl px-3 py-2 text-sm shadow-sm',
        align === 'right' ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm',
        variant === 'muted' && 'bg-muted text-foreground',
        variant === 'muted-soft' && 'bg-muted/60 text-muted-foreground italic'
      )}
    >
      {children}
    </div>
  );
}

interface SuggestionCardData {
  entryId: string;
  question: string;
  source: string;
}

function SuggestionCard({ suggestion }: { suggestion: SuggestionCardData }) {
  return (
    <Card className="border-dashed bg-muted/30">
      <CardContent className="space-y-1 p-3 text-xs">
        <p className="font-medium text-foreground">Mungkin yang Anda maksud:</p>
        <p className="text-sm">{suggestion.question}</p>
        <p className="text-muted-foreground">Sumber: {suggestion.source}</p>
      </CardContent>
    </Card>
  );
}