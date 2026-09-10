/**
 * EscalationBriefing unit tests.
 * Source: docs/superpowers/specs/2026-09-04-wa-crm-gap-closure-design.md (Gap B)
 *
 * The suite runs in a `node` environment with no DOM, so these render the
 * component to a JSX tree and walk it — matching the convention in
 * `components/ai/__tests__/MarkdownAnswer.test.tsx`.
 */
import { describe, it, expect } from 'vitest';
import { EscalationBriefing } from '../EscalationBriefing';
import type { EscalationBriefingDto } from '@/lib/contract';

/** Collect every string rendered anywhere in the tree. */
function textOf(node: unknown): string {
  if (node == null || node === false) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  const el = node as { props?: { children?: unknown }; type?: unknown };
  if (el.props && 'children' in el.props) return textOf(el.props.children);
  return '';
}

/** Render, resolving one level of function components so nested text is reachable. */
function render(briefing: EscalationBriefingDto): string {
  const tree = EscalationBriefing({ briefing });
  const seen = new Set<unknown>();
  function deep(node: unknown, depth: number): string {
    if (depth > 12 || node == null || node === false) return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map((n) => deep(n, depth + 1)).join(' ');
    const el = node as { type?: unknown; props?: Record<string, unknown> };
    if (typeof el.type === 'function' && !seen.has(el)) {
      seen.add(el);
      try {
        return deep((el.type as (p: unknown) => unknown)(el.props ?? {}), depth + 1);
      } catch {
        return '';
      }
    }
    if (el.props && 'children' in el.props) return deep(el.props.children, depth + 1);
    return '';
  }
  return deep(tree, 0) || textOf(tree);
}

const FULL: EscalationBriefingDto = {
  headline: 'Pelanggan menanyakan status pesanan XR-7741',
  customer_wants: 'Cek status pengiriman',
  ai_attempted: 'Mencari di knowledge base',
  blocking_gap: 'Tidak ada data pesanan',
  suggested_next_action: 'Cek sistem internal lalu hubungi pelanggan',
  sentiment: 'urgent',
  reason: 'fallback_handoff',
  confidence: 0.2,
  ai_reasoning: 'Tidak ada entri CONTEXT yang cocok',
};

describe('EscalationBriefing', () => {
  it('renders the headline, next action and reason label', () => {
    const out = render(FULL);
    expect(out).toContain('XR-7741');
    expect(out).toContain('Cek sistem internal lalu hubungi pelanggan');
    // The raw enum is mapped to Indonesian, not shown verbatim.
    expect(out).toContain('AI pakai fallback');
    expect(out).not.toContain('fallback_handoff');
  });

  it('surfaces sentiment as text, not colour alone', () => {
    expect(render(FULL)).toContain('Mendesak');
    expect(render({ ...FULL, sentiment: 'frustrated' })).toContain('Kecewa');
    expect(render({ ...FULL, sentiment: 'neutral' })).toContain('Netral');
  });

  it('defaults to neutral sentiment when the model omits it', () => {
    const rest = { ...FULL };
    delete rest.sentiment;
    expect(render(rest)).toContain('Netral');
  });

  it('shows a fallback headline rather than an empty heading', () => {
    const out = render({ ...FULL, headline: '   ' });
    expect(out).toContain('Chat dialihkan ke agent');
  });

  it('omits empty supporting fields instead of rendering blank labels', () => {
    const out = render({
      headline: 'Hanya headline',
      customer_wants: '',
      ai_attempted: '   ',
      reason: 'confidence_low',
    });
    expect(out).toContain('Hanya headline');
    expect(out).not.toContain('Pelanggan minta');
    expect(out).not.toContain('Yang AI coba');
  });

  it('renders an unmapped reason verbatim rather than dropping it', () => {
    expect(render({ ...FULL, reason: 'some_new_reason' })).toContain('some_new_reason');
  });

  it('notes when the briefing is degraded', () => {
    expect(render({ ...FULL, degraded: true })).toContain(
      'Ringkasan otomatis tidak tersedia'
    );
  });

  it('does not throw on a completely empty briefing', () => {
    expect(() => render({})).not.toThrow();
  });
});
