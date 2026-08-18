'use strict';
/**
 * Postgres-backed ai_settings store (single-tenant for MVP).
 * Source: docs/crm/plans/16-settings-store-composer-hardened.md step 6.
 */
const { getPool } = require('../../db/client');
const { DEFAULT_AI_SETTINGS } = require('./defaults');
const { AiSettingsSchema, SettingsValidationError } = require('./schema');

const SINGLE_TENANT_ID = 'default';
const SINGLE_SETTINGS_ID = 1;

function rowToSettings(row) {
  return {
    identity: row.identity,
    tone: row.tone,
    language: row.language,
    scope: row.scope,
    rules: row.rules || [],
    whatsappAutoReply: row.whatsapp_auto_reply,
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : row.updated_at,
  };
}

async function getSettings() {
  const pool = getPool();
  const r = await pool.query(
    'SELECT id, identity, tone, language, scope, rules, whatsapp_auto_reply, updated_at FROM ai_settings WHERE id = $1',
    [SINGLE_SETTINGS_ID]
  );
  if (r.rows.length === 0) {
    return DEFAULT_AI_SETTINGS;
  }
  return rowToSettings(r.rows[0]);
}

// Deep-merge nested object patches (identity / scope / whatsappAutoReply).
// Top-level primitives/arrays (tone / language / rules) replace.
// Required so PUT with {whatsappAutoReply:{enabled:true}} preserves
// the existing confidenceThreshold, satisfying the locked AiSettingsSchema.
function mergePatch(current, patch) {
  const out = { ...current };
  for (const k of Object.keys(patch || {})) {
    const pv = patch[k];
    const cv = current[k];
    if (
      pv &&
      typeof pv === 'object' &&
      !Array.isArray(pv) &&
      cv &&
      typeof cv === 'object' &&
      !Array.isArray(cv)
    ) {
      out[k] = { ...cv, ...pv };
    } else {
      out[k] = pv;
    }
  }
  return out;
}

async function updateSettings(patch) {
  const current = await getSettings();
  const merged = { ...mergePatch(current, patch), updatedAt: new Date().toISOString() };
  const parsed = AiSettingsSchema.safeParse(merged);
  if (!parsed.success) throw new SettingsValidationError(parsed.error);

  const pool = getPool();
  await pool.query(
    `UPDATE ai_settings
     SET identity = $1::jsonb, tone = $2, language = $3, scope = $4::jsonb,
         rules = $5, whatsapp_auto_reply = $6::jsonb, updated_at = now()
     WHERE id = $7`,
    [
      JSON.stringify(parsed.data.identity),
      parsed.data.tone,
      parsed.data.language,
      JSON.stringify(parsed.data.scope),
      parsed.data.rules,
      JSON.stringify(parsed.data.whatsappAutoReply),
      SINGLE_SETTINGS_ID,
    ]
  );
  return getSettings();
}

async function resetSettings() {
  const pool = getPool();
  await pool.query(
    `UPDATE ai_settings
     SET identity = $1::jsonb, tone = $2, language = $3, scope = $4::jsonb,
         rules = $5, whatsapp_auto_reply = $6::jsonb, updated_at = now()
     WHERE id = $7`,
    [
      JSON.stringify(DEFAULT_AI_SETTINGS.identity),
      DEFAULT_AI_SETTINGS.tone,
      DEFAULT_AI_SETTINGS.language,
      JSON.stringify(DEFAULT_AI_SETTINGS.scope),
      DEFAULT_AI_SETTINGS.rules,
      JSON.stringify(DEFAULT_AI_SETTINGS.whatsappAutoReply),
      SINGLE_SETTINGS_ID,
    ]
  );
  return getSettings();
}

module.exports = {
  getSettings,
  updateSettings,
  resetSettings,
  SINGLE_TENANT_ID,
};