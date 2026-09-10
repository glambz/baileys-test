/**
 * WebSocket endpoint tests (BUG-PUSH-EVENTS feature, 2026-08-03).
 *
 * Spins up a real http.Server + ws server in-process and connects two
 * test clients to verify the typing-echo fan-out behavior.
 */
import { describe, it, expect, afterAll } from 'vitest';
import http from 'node:http';
import { WebSocket } from 'ws';
import { setupWebSocket } from '../src/api/ws.js';

let httpServer;
let baseUrl;

async function setup() {
  return new Promise((resolve) => {
    httpServer = http.createServer((req, res) => {
      res.statusCode = 200;
      res.end('ok');
    });
    setupWebSocket(httpServer);
    httpServer.listen(0, '127.0.0.1', () => {
      const { port } = httpServer.address();
      baseUrl = `ws://127.0.0.1:${port}/ws/chat`;
      resolve();
    });
  });
}

afterAll(async () => {
  if (httpServer) {
    await new Promise((r) => httpServer.close(r));
  }
});

function openWs(chatId) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${baseUrl}?chatId=${encodeURIComponent(chatId)}`);
    const messages = [];
    ws.on('open', () => resolve(Object.assign(ws, { messages })));
    ws.on('message', (raw) => {
      try { messages.push(JSON.parse(raw.toString())); } catch { /* */ }
    });
    ws.on('error', reject);
  });
}

const waitFor = (cond, ms = 500) => new Promise((resolve, reject) => {
  const start = Date.now();
  const t = setInterval(() => {
    if (cond()) { clearInterval(t); resolve(); }
    else if (Date.now() - start > ms) { clearInterval(t); reject(new Error('timeout')); }
  }, 20);
});

describe('WS chat endpoint (BUG-PUSH-EVENTS feature)', () => {
  it('rejects connection without a chatId', async () => {
    await setup();
    const ws = new WebSocket(baseUrl);
    const code = await new Promise((resolve) => {
      ws.on('close', (c) => resolve(c));
      ws.on('error', () => resolve(1008));
    });
    expect(code).toBe(1008);
  });

  it('accepts connection with chatId and sends a hello', async () => {
    await setup();
    const cid = `ws-test-hello-${Date.now()}`;
    const ws = await openWs(cid);
    await waitFor(() => ws.messages.some((m) => m.type === 'hello'));
    expect(ws.messages.some((m) => m.type === 'hello' && m.chatId === cid)).toBe(true);
    ws.close();
  });

  it('typing from one client echoes to other clients on the same chatId', async () => {
    await setup();
    const cid = `ws-test-typing-${Date.now()}`;
    const wsA = await openWs(cid);
    const wsB = await openWs(cid);
    await waitFor(() => wsA.messages.some((m) => m.type === 'hello') && wsB.messages.some((m) => m.type === 'hello'));
    wsA.send(JSON.stringify({ type: 'typing', from: 'A', at: 12345 }));
    await waitFor(() => wsB.messages.some((m) => m.type === 'typing'));
    expect(wsB.messages.some((m) => m.type === 'typing' && m.from === 'A')).toBe(true);
    // A should NOT receive its own echo.
    expect(wsA.messages.some((m) => m.type === 'typing')).toBe(false);
    wsA.close();
    wsB.close();
  });

  it('typing from A does NOT echo to B on a different chatId', async () => {
    await setup();
    const cidA = `ws-test-X-${Date.now()}`;
    const cidB = `ws-test-Y-${Date.now()}`;
    const wsA = await openWs(cidA);
    const wsB = await openWs(cidB);
    await waitFor(() => wsA.messages.some((m) => m.type === 'hello') && wsB.messages.some((m) => m.type === 'hello'));
    wsA.send(JSON.stringify({ type: 'typing', from: 'A' }));
    await new Promise((r) => setTimeout(r, 300));
    expect(wsB.messages.some((m) => m.type === 'typing')).toBe(false);
    wsA.close();
    wsB.close();
  });
});
