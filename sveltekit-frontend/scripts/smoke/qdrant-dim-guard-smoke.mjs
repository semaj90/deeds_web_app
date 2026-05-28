import fs from 'node:fs';
import path from 'node:path';
const __dirname = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(__dirname, '../..');

async function run() {
  console.log('=== Qdrant Dim Guard Smoke Test ===');

  // Build test batches
  const goodVec = new Array(768).fill(0).map((_,i)=> Math.sin(i+1));
  const badVec = new Array(8).fill(0).map((_,i)=> i);

  const goodPoints = [ { id: 'good_1', vector: goodVec } ];
  const badPoints = [ { id: 'bad_1', vector: badVec } ];

  // Try importing the qdrant manager and call client.upsert (which we wrapped)
  try {
    const { qdrant } = await import('../src/lib/server/vector/qdrant-manager.js');

    console.log('\n- Testing bad (8-dim) upsert -> expect abort and report file');
    let badThrew = false;
    try {
      await qdrant.client.upsert('test_collection', { wait: false, points: badPoints });
    } catch (e) {
      badThrew = true;
      console.log('  ✓ bad upsert threw as expected:', e.message.split('\n')[0]);
    }

    const reportPath = path.join(ROOT, '.tmp', 'qdrant-upsert-dim-report.json');
    const badReportExists = fs.existsSync(reportPath);
    if (!badThrew || !badReportExists) {
      console.error('❌ Smoke failed: bad upsert did not abort correctly or report missing');
      process.exit(2);
    }
    console.log('  ✓ report written to .tmp/qdrant-upsert-dim-report.json');

    console.log('\n- Testing good (768-dim) upsert -> expect success (no throw)');
    try {
      await qdrant.client.upsert('test_collection', { wait: false, points: goodPoints });
      console.log('  ✓ good upsert completed (no validation error)');
    } catch (e) {
      console.error('❌ Good upsert unexpectedly failed:', e.message);
      process.exit(3);
    }

    console.log('\n✅ Qdrant dim guard smoke test passed.');
    process.exit(0);
  } catch (e) {
    console.error('Fatal: could not import qdrant manager or run smoke test', e);
    process.exit(1);
  }
}

run();
