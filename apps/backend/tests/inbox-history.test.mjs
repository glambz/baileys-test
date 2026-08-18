/**
 * Tests for inbox.getRecentHistory — parses chat markdown into chat history
 * entries suitable for the LLM user prompt. Source: cycle be-ai-auto-reply,
 * post-cycle follow-up: "auto-reply has no context of the ongoing conversation".
 */
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let tmpDir;
let writer;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inbox-hist-'));
  process.env.INBOX_LOG_DIR = tmpDir;
  // Clear require cache so writer picks up the new env var.
  delete require.cache[require.resolve('../src/inbox/writer.js')];
  delete require.cache[require.resolve('../src/config/index.js')];
  writer = require('../src/inbox/writer.js');
});

function writeChat(chatId, content) {
  const p = writer.pathFor(chatId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
}

describe('inbox.getRecentHistory', () => {
  it('returns [] when the chat file does not exist', () => {
    const h = writer.getRecentHistory('6280000000000@s.whatsapp.net', 6);
    expect(h).toEqual([]);
  });

  it('returns [] for status/group/LID jids', () => {
    expect(writer.getRecentHistory('status@broadcast', 6)).toEqual([]);
    expect(writer.getRecentHistory('120363012345@g.us', 6)).toEqual([]);
    expect(writer.getRecentHistory('12345@lid', 6)).toEqual([]);
  });

  it('parses the canonical chat markdown format into user/assistant entries', () => {
    const chatId = '6281111111111@s.whatsapp.net';
    writeChat(
      chatId,
      [
        '# WhatsApp chat with 6281111111111',
        '',
        '**[2026-07-09 00:50:00] [in ] Muh Adi P**',
        'saya mau bikin landing page',
        '',
        '**[2026-07-09 00:50:05] [out] me**',
        'Tentu, berikut paketnya [1][2]...',
        '',
        '**[2026-07-09 00:50:10] [in ] Muh Adi P**',
        'berapa lama pengerjaannya?',
        '',
      ].join('\n')
    );
    const h = writer.getRecentHistory(chatId, 6);
    // The last (most recent) entry — the current inbound — must be excluded.
    expect(h.length).toBe(2);
    expect(h[0].role).toBe('user');
    expect(h[0].content).toBe('saya mau bikin landing page');
    expect(h[0].ts).toBe('2026-07-09 00:50:00');
    expect(h[1].role).toBe('assistant');
    expect(h[1].content).toBe('Tentu, berikut paketnya [1][2]...');
  });

  it('respects the limit and returns only the most recent N-1 previous messages', () => {
    const chatId = '6282222222222@s.whatsapp.net';
    const lines = ['# Chat', ''];
    for (let i = 0; i < 10; i += 1) {
      const dir = i % 2 === 0 ? 'in ' : 'out';
      const who = i % 2 === 0 ? 'Muh Adi P' : 'me';
      lines.push(`**[2026-07-09 00:0${i}:00] [${dir}] ${who}**`);
      lines.push(`message ${i}`);
      lines.push('');
    }
    writeChat(chatId, lines.join('\n'));
    const h = writer.getRecentHistory(chatId, 3);
    // 10 messages, drop the last (current inbound), take 3 most recent of the 9
    // (indices 6, 7, 8).
    expect(h.length).toBe(3);
    expect(h[0].content).toBe('message 6');
    expect(h[1].content).toBe('message 7');
    expect(h[2].content).toBe('message 8');
  });

  it('handles multi-line message bodies', () => {
    const chatId = '6283333333333@s.whatsapp.net';
    writeChat(
      chatId,
      [
        '**[2026-07-09 00:50:00] [in ] Muh Adi P**',
        'line one',
        'line two',
        'line three',
        '',
        '**[2026-07-09 00:50:10] [in ] Muh Adi P**',
        'next question',
        '',
      ].join('\n')
    );
    const h = writer.getRecentHistory(chatId, 6);
    expect(h.length).toBe(1);
    expect(h[0].content).toBe('line one\nline two\nline three');
  });
});
