'use strict';
/**
 * Vitest config.
 * Source: docs/crm/plans/23-defense-in-depth-tests.md step 13.
 */
const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/test/**/*.test.{js,mjs}'],
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});