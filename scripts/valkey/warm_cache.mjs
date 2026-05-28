import Redis from 'ioredis';
import process from 'process';
import fs from 'fs/promises';
import path from 'path';

const VALKEY_URL = process.env.VALKEY_URL || 'redis://127.0.0.1:6379';
const client = new Redis(VALKEY_URL);

async function main() {
  const args = process.argv.slice(2);
  const smoke = args.includes('--smoke');
  const reportDir = path.join(process.cwd(), '.tmp');
  const reportPath = path.join(reportDir, 'valkey-warm-cache-report.json');
  const report = { host: VALKEY_URL, connected: false, setex: null, get: null, json: null, bloom: null, search: null, errors: [] };

  try {
    await fs.mkdir(reportDir, { recursive: true });
  } catch {}

  console.log('Valkey warm-cache smoke test connecting to', VALKEY_URL);
  try {
    // test connection
    await client.ping();
    report.connected = true;

    // 2. SETEX ace:packet:{queryHash}
    const key = 'ace:packet:sampleQueryHash';
    const sample = { packetId: 'sampleQueryHash', createdAt: new Date().toISOString(), cards: [{ id: 'sample-card', summary: 'sample' }] };
    try {
      await client.setEx(key, 3600, JSON.stringify(sample));
      report.setex = true;
    } catch (e) {
      report.setex = false;
      report.errors.push({ step: 'SETEX', error: String(e) });
    }

    // 3. GET ace:packet:{queryHash}
    try {
      const got = await client.get(key);
      report.get = got ? JSON.parse(got) : null;
    } catch (e) {
      report.get = null;
      report.errors.push({ step: 'GET', error: String(e) });
    }

    // 4. optional JSON.SET scenario card
    try {
      await client.call('JSON.SET', key + ':json', '.', JSON.stringify(sample));
      const j = await client.call('JSON.GET', key + ':json', '.');
      report.json = j ? JSON.parse(j) : null;
    } catch (e) {
      report.json = null;
      report.errors.push({ step: 'JSON', error: 'JSON module not present or JSON.SET failed' });
    }

    // 5. optional Bloom BF.ADD content_hash
    try {
      const bloomKey = 'dedupe:bloom:content_hash';
      const added = await client.call('BF.ADD', bloomKey, 'samplehash');
      const exists = await client.call('BF.EXISTS', bloomKey, 'samplehash');
      report.bloom = { added, exists };
    } catch (e) {
      report.bloom = null;
      report.errors.push({ step: 'BLOOM', error: 'Bloom module not present or BF.* failed' });
    }

    // 6. optional vector/search probe — SKIPPED (search module not probed)
    report.search = { supported: false, note: 'vector/search probe skipped; no generic command executed' };

    // cleanup sample key
    try { await client.del(key); } catch {}

    // write report
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');

    // compact summary print
    console.log('Valkey warm-cache summary:');
    console.log('-', 'connected:', report.connected);
    console.log('-', 'SETEX:', report.setex ? 'ok' : 'fail');
    console.log('-', 'GET:', report.get ? 'ok' : 'missing');
    console.log('-', 'JSON module:', report.json ? 'ok' : 'missing');
    console.log('-', 'Bloom module:', report.bloom ? 'ok' : 'missing');
    console.log('-', 'Search support:', report.search.supported ? 'present' : 'absent/skipped');
    console.log('Report written to', reportPath);

    if (smoke) process.exit(0);
  } catch (err) {
    report.connected = false;
    report.errors.push({ step: 'connect', error: String(err) });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
    console.error('Warm-cache error:', err);
    console.log('Report written to', reportPath);
    process.exit(1);
  } finally {
    try { await client.quit(); } catch {}
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
