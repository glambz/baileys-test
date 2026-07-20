'use strict';
/**
 * Tenant middleware (single-tenant for MVP).
 * Source: docs/crm/plans/21-rest-endpoints.md.
 */
function requireTenant(req, res, next) {
  req.tenantId = process.env.DEFAULT_TENANT_ID || 'default';
  next();
}

module.exports = { requireTenant };