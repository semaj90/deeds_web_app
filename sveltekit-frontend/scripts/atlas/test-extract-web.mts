import { loadRuntimeEnv } from '../../src/lib/server/config/load-runtime-env.js';
async function main() {
  loadRuntimeEnv({ cwd: process.cwd(), mode: 'development' });
  const { extractWebDocument } = await import('../../src/lib/server/web/web-crawl.js');
  const doc = await extractWebDocument('https://example.com');
  console.log(JSON.stringify(doc, null, 2));
}
main().catch(e => { console.error('FAILED:', e); process.exit(1); });
