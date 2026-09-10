'use strict';

/**
 * WebSocket server for high-frequency chat events (typing,
 * presence — future cycle).
 *
 * Path: /ws/chat?chatId=X
 *
 * Currently a thin echo for {type: 'typing'} messages to other clients
 * on the same chatId. The room logic is in-memory (per-process); for
 * multi-instance scale, route via Redis Pub/Sub.
 *
 * Future enhancements:
 *  - presence (online/offline + who's typing)
 *  - typing debounce (coalesce multiple typing events)
 *  - per-user auth (currently the endpoint is open)
 */
const { WebSocketServer } = require('ws');
const logger = require('../utils/logger');

let wss = null;

function setupWebSocket(httpServer) {
  if (!httpServer) throw new Error('setupWebSocket requires an http.Server');
  wss = new WebSocketServer({ server: httpServer, path: '/ws/chat' });
  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
    const chatId = url.searchParams.get('chatId');
    if (!chatId) {
      ws.close(1008, 'chatId required');
      return;
    }
    ws.chatId = chatId;
    logger.info({ chatId }, 'WS connected');

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (!msg || typeof msg !== 'object') return;
      // Echo to other clients on the same chatId.
      if (msg.type === 'typing') {
        for (const client of wss.clients) {
          if (client.chatId === chatId && client !== ws && client.readyState === 1) {
            try {
              client.send(JSON.stringify({ type: 'typing', from: msg.from, at: msg.at }));
            } catch (_) { /* skip dead client */ }
          }
        }
      }
    });

    ws.on('close', () => logger.info({ chatId }, 'WS disconnected'));
    ws.on('error', (err) => logger.warn({ err: err.message }, 'WS error'));

    // Send a hello on connect so the client knows it's online.
    try { ws.send(JSON.stringify({ type: 'hello', chatId })); } catch { /* */ }
  });
  return wss;
}

function getWss() {
  return wss;
}

function stats() {
  return { clients: wss ? wss.clients.size : 0 };
}

module.exports = { setupWebSocket, getWss, stats };
