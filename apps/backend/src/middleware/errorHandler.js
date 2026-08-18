'use strict';

const logger = require('../utils/logger');

function notFound(req, res) {
  res.status(404).json({
    error: 'NotFound',
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  const status = err.statusCode || 500;
  if (status >= 500) {
    logger.error({ err }, 'Unhandled error');
  } else {
    logger.warn({ err: err.message }, 'Request error');
  }
  res.status(status).json({
    error: err.name || 'InternalServerError',
    message: err.message || 'Internal server error',
  });
}

module.exports = { notFound, errorHandler };