#!/usr/bin/env node
import { ingestMinioObject } from '../src/lib/ingest/worker.mjs';

const [, , bucket, key] = process.argv;
if (!bucket || !key) {
  console.error('Usage: node scripts/ingest-file.js <bucket> <key>');
  process.exit(2);
}

(async () => {
  try {
    const r = await ingestMinioObject(bucket, key);
    console.log('Ingest result:', r);
  } catch (err) {
    console.error('Ingest failed:', err.message || err);
    process.exit(3);
  }
})();
