'use strict';

// Load .env BEFORE any other module reads process.env. The db/* entry
// points (check.js / migrate.js) must also load dotenv — this one is
// belt-and-braces for the dev server. dotenv is idempotent.
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const fs = require('fs');
const path = require('path');

const config = require('./config');
const logger = require('./utils/logger');
const instanceLock = require('./utils/instanceLock');
const authRoutes = require('./routes/auth');
const messageRoutes = require('./routes/messages');
const broadcastRoutes = require('./routes/broadcast');
const contactsRoutes = require('./routes/contacts');
const chatsRoutes = require('./routes/chats');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const wa = require('./whatsapp/client');
const broadcaster = require('./whatsapp/broadcaster');
const inbox = require('./inbox/writer');

// AI module (cycle: be-ai-auto-reply-2026-07-03)
const { mountAiRoutes } = require('./ai/routes');
const crmChatsModesRouter = require('./ai/routes/crm-chats-modes');
const audit = require('./ai/audit/log');

function buildApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.get('/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }));
  app.get('/api/inbox', (req, res) => res.json({ contacts: inbox.getStats() }));

  app.use('/api/auth', authRoutes);
  app.use('/api/messages', messageRoutes);
  app.use('/api/messages/broadcast', broadcastRoutes);
  app.use('/api/contacts', contactsRoutes);
  app.use('/api/chats', chatsRoutes);
  app.use('/api/crm/chats', crmChatsModesRouter);

  // AI module (cycle: be-ai-auto-reply-2026-07-03)
  mountAiRoutes(app);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

async function main() {
  // Refuse to start if another instance is already running.
  try {
    instanceLock.acquire();
  } catch (err) {
    if (err.code === 'EINSTANCERUNNING') {
      logger.fatal(err.message);
      process.exit(1);
    }
    throw err;
  }
  instanceLock.installSignalCleanup();

  // Ensure runtime dirs exist.
  try {
    fs.mkdirSync(process.env.AUDIT_DIR || './data/audit', { recursive: true });
    fs.mkdirSync(process.env.KB_DIR || './data/kb', { recursive: true });
  } catch (err) {
    logger.warn({ err }, 'mkdir for data dirs failed');
  }

  // Run DB migrations (idempotent).
  try {
    const { runMigrations } = require('./db/migrate');
    await runMigrations();
  } catch (err) {
    // No DB available (common in unit-test / offline dev). Log and continue.
    logger.warn({ err: err && err.message }, 'migrations skipped (DB unavailable?)');
  }

  const app = buildApp();
  const { port, host } = config.server;

  const server = app.listen(port, host, () => {
    logger.info(
      { host, port, env: config.server.env },
      `WhatsApp API listening on http://${host}:${port}`
    );
    logger.info('POST /api/auth/init   -> start authentication');
    logger.info('GET  /api/auth/qr     -> fetch the QR code (base64 PNG)');
    logger.info('GET  /api/auth/status -> connection state');
    logger.info('POST /api/messages/send -> { phone, message }');
    logger.info('POST /api/crm/ai/ask   -> team-scope RAG ask');
    logger.info('POST /api/crm/ai/reply-preview');
    logger.info('POST /api/crm/ai/toggle-mode');
    logger.info('GET  /api/crm/entities  + /records CRUD');
    logger.info('GET  /api/crm/knowledge/files');
    logger.info('POST /api/crm/knowledge/upload');
  });

  // Auto-init Baileys from saved session if creds.json exists.
  const credsPath = require('path').join(
    config.whatsapp.sessionDir,
    'creds.json'
  );
  if (require('fs').existsSync(credsPath)) {
    logger.info({ credsPath }, 'Saved credentials found, auto-initializing WhatsApp session');
    wa.initialize()
      .then(() => {
        // Wire the AI inbound trigger (Plan 20 + 24).
        const sock = wa.getSocket ? wa.getSocket() : null;
        if (sock && sock.ev) {
          const { processInboundMessage } = require('./ai/whatsapp/trigger');
          sock.ev.on('messages.upsert', ({ messages }) => {
            for (const m of messages || []) {
              // Defense in depth: skip self-echoes at the dispatcher level.
              // Baileys re-fires messages.upsert for our own outbound sends
              // (fromMe=true). The trigger also guards against this, but
              // filtering here avoids the LLM call entirely on the echo.
              if (m && m.key && m.key.fromMe === true) continue;
              // BUG-DISPATCHER-EPHEMERAL fix (2026-07-14): use the inbox
              // writer's extractText() so the AI trigger sees the real
              // body even when Baileys wraps it in ephemeralMessage /
              // viewOnce / viewOnceV2 / documentWithCaption. Without this
              // unwrap, chats with disappearing messages enabled silently
              // hit the trigger's empty_body guard and the auto-reply
              // never fires. See src/test/dispatcher-ephemeral.test.mjs.
              const { extractText } = require('./inbox/writer');
              const { body: rawBody } = extractText(m && m.message);
              processInboundMessage(
                {
                  chatId: m.key && m.key.remoteJid,
                  body: rawBody,
                  key: m.key,
                  senderPn: m.key && m.key.senderPn,
                },
                { sock }
              ).catch((err) => logger.error({ err }, 'ai_trigger_error'));
            }
          });
          logger.info('AI inbound trigger subscribed to messages.upsert');
        }
      })
      .catch((err) => logger.error({ err }, 'Auto-initialize failed; call POST /api/auth/init'));
  } else {
    logger.info('No saved credentials. POST /api/auth/init to start the QR flow.');
  }

  const shutdown = async (signal) => {
    logger.info({ signal }, 'Shutting down...');
    server.close(() => logger.info('HTTP server closed'));
    try {
      for (const j of broadcaster.jobs.values()) {
        if (j.status === 'running') j.signal.abort();
      }
    } catch (err) {
      logger.warn({ err }, 'Error cancelling broadcast jobs');
    }
    try {
      await wa.shutdown();
    } catch (err) {
      logger.warn({ err }, 'Error tearing down WhatsApp socket');
    }
    try {
      await inbox.flush();
    } catch (err) {
      logger.warn({ err }, 'Inbox flush failed');
    }
    try {
      const { closeDb } = require('./db/client');
      await closeDb();
    } catch (_) {}
    instanceLock.release();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception');
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled promise rejection');
  });
}

if (require.main === module) {
  main().catch((err) => {
    logger.fatal({ err }, 'Fatal startup error');
    process.exit(1);
  });
}

module.exports = { buildApp };
