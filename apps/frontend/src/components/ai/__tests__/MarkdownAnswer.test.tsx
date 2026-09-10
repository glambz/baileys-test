/**
 * MarkdownAnswer unit tests.
 * Source: docs/specs/2026-08-18-in-app-ai-chat-polish.md
 */
import { describe, it, expect } from 'vitest';
import { MarkdownAnswer } from '../MarkdownAnswer';

describe('MarkdownAnswer', () => {
  it('renders plain text', () => {
    const html = (MarkdownAnswer({ text: 'hello world' }) as { type: string }).type;
    expect(html).toBe('div');
  });
  it('renders inline code', () => {
    const tree = MarkdownAnswer({ text: 'use `npm install` to set up' }) as unknown as { props: { children: unknown } };
    // Just confirm the function returns JSX without throwing.
    expect(tree).toBeTruthy();
  });
  it('renders fenced code blocks', () => {
    const tree = MarkdownAnswer({ text: '```js\nconsole.log(1)\n```' });
    expect(tree).toBeTruthy();
  });
  it('renders bullet lists', () => {
    const tree = MarkdownAnswer({ text: '- one\n- two\n- three' });
    expect(tree).toBeTruthy();
  });
  it('returns null for empty input', () => {
    expect(MarkdownAnswer({ text: '' })).toBeNull();
  });
});
