'use strict';
/**
 * Mount all AI routers on the Express app.
 */
const ai = require('./ai');
const crm = require('./crm');
const knowledge = require('./knowledge');
const settings = require('./settings');
const history = require('./history');

function mountAiRoutes(app) {
  app.use('/api/crm/ai', ai);
  app.use('/api/crm/ai', settings);
  app.use('/api/crm/ai', history);
  app.use('/api/crm', crm);
  app.use('/api/crm/knowledge', knowledge);

  // 404 fallback for unmatched /api/crm/* paths.
  app.use('/api/crm/*', (req, res) => {
    res.status(404).json({ error: 'NotFound', path: req.originalUrl });
  });
}

module.exports = { mountAiRoutes };