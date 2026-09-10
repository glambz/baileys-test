'use strict';
/**
 * KB ingest worker (background queue).
 * Source: docs/crm/plans/18-kb-ingestion.md + Plan 24 wiring.
 */
const { ingestFile } = require('./ingest');

const queue = [];
let running = false;

function enqueue(job) {
  return new Promise((resolve, reject) => {
    queue.push({ job, resolve, reject });
    drain();
  });
}

async function drain() {
  if (running) return;
  running = true;
  try {
    while (queue.length > 0) {
      const { job, resolve, reject } = queue.shift();
      try {
        const r = await ingestFile(job);
        resolve(r);
      } catch (err) {
        reject(err);
      }
    }
  } finally {
    running = false;
  }
}

function queueSize() {
  return queue.length;
}

module.exports = { enqueue, drain, queueSize };