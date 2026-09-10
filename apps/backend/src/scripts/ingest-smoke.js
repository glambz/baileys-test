'use strict';
/**
 * Manual smoke: ingest a sample PDF against a live DB.
 * Gated by RUN_SMOKE=1.
 */
const fs = require('fs');
const path = require('path');
const { ingestFile } = require('../ai/store/ingest');
const { closeDb } = require('../db/client');

async function main() {
  if (!process.env.RUN_SMOKE) {
    console.log('set RUN_SMOKE=1 to run');
    return;
  }
  const samplePath = path.join(__dirname, '..', '..', '__fixtures__', 'kb', 'sample.txt');
  if (!fs.existsSync(samplePath)) {
    console.error('no sample fixture at', samplePath);
    process.exit(1);
  }
  const buffer = fs.readFileSync(samplePath);
  const r = await ingestFile({
    tenantId: 'default',
    filename: 'sample.txt',
    mimeType: 'text/plain',
    buffer,
  });
  console.log(JSON.stringify(r, null, 2));
}

main()
  .then(() => closeDb())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    closeDb().finally(() => process.exit(1));
  });