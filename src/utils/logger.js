'use strict';

const pino = require('pino');
const config = require('../config');

const logger = pino({
  level: config.whatsapp.logLevel,
  transport:
    config.server.env === 'development'
      ? {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l' },
        }
      : undefined,
});

module.exports = logger;