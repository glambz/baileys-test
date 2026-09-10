/**
 * MarkdownAnswer — minimal markdown renderer for AI chat responses.
 * Source: docs/specs/2026-08-18-in-app-ai-chat-polish.md
 *
 * Avoids the react-markdown + remark-gfm + shiki dependency stack for
 * now (Task 10 is a separate later strip). Renders the small subset of
 * markdown the AI text actually uses: inline code, code blocks, bold,
 * italic, line breaks. Anything else is passed through as plain text.
 */
import { cn } from '@/lib/utils';

interface MarkdownAnswerProps {
  text: string;
  className?: string;
}

function renderInline(text: string): React.ReactNode {
  // Inline code: `code`
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, i) => {
    const m = part.match(/^`([^`]+)`$/);
    if (m) {
      return (
        <code
          key={i}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]"
        >
          {m[1]}
        </code>
      );
    }
    // Bold: **text**
    const boldSplit = part.split(/(\*\*[^*]+\*\*)/g);
    return boldSplit.map((sub, j) => {
      const bm = sub.match(/^\*\*([^*]+)\*\*$/);
      if (bm) return <strong key={`${i}-${j}`}>{bm[1]}</strong>;
      return <span key={`${i}-${j}`}>{sub}</span>;
    });
  });
}

export function MarkdownAnswer({ text, className }: MarkdownAnswerProps) {
  if (!text) return null;
  const blocks = text.split(/\n{2,}/);
  return (
    <div className={cn('space-y-2 leading-relaxed', className)}>
      {blocks.map((block, i) => {
        const lines = block.split('\n');
        // Code block: ``` lines ...
        if (lines[0].startsWith('```')) {
          const inner = lines.slice(1, lines[lines.length - 1]?.startsWith('```') ? -1 : lines.length).join('\n');
          return (
            <pre
              key={i}
              className="overflow-x-auto rounded bg-muted p-2 text-[11px] leading-relaxed"
            >
              <code>{inner}</code>
            </pre>
          );
        }
        // Bullet list: lines starting with -
        if (lines.every((l) => /^[-*]\s+/.test(l))) {
          return (
            <ul key={i} className="ml-4 list-disc space-y-1">
              {lines.map((l, j) => (
                <li key={j}>{renderInline(l.replace(/^[-*]\s+/, ''))}</li>
              ))}
            </ul>
          );
        }
        // Default: paragraph
        return (
          <p key={i} className="whitespace-pre-wrap">
            {lines.map((l, j) => (
              <span key={j}>
                {renderInline(l)}
                {j < lines.length - 1 && <br />}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
