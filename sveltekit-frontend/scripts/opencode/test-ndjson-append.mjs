import { appendNdjson, appendLedger, listPipelineFiles } from '../../src/lib/server/ndjson-store.js';

async function run() {
  const pipeline = 'parents-atlas-test';
  const runId = `test-${Date.now()}`;
  const payload = { message: 'hello ndjson', runId, sample: true };
  const file = await appendNdjson(pipeline, payload, runId);
  console.log('Appended to', file);

  const ledgerEntry = { file, pipeline, summary: 'test append' };
  const ledgerFile = await appendLedger(pipeline, ledgerEntry);
  console.log('Ledger appended to', ledgerFile);

  const files = await listPipelineFiles(pipeline);
  console.log('Pipeline files:', files);
}

run().catch(err => { console.error(err); process.exit(1); });
