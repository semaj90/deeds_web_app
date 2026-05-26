import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const { getAuthorityForContext } = await import('../../src/lib/server/graph/karpathy-authority.ts');
  const { buildAceContextPack, setAceContextPackPointer, getAceContextPackSnapshotPath, readAceContextPackSnapshot } = await import('../../src/lib/server/cache/ace-context-pack-cache.js');

  const ctx = {
    codebaseContext: [ { filePath: 'src/lib/server/cache/ace-context-pack-cache.ts' } ],
  };

  const authority = await getAuthorityForContext(ctx).catch(() => ({ score: 0, source: 'gpu' }));
  console.log('Computed authority:', authority);

  const packId = `test-pack:${Date.now()}:${Math.random().toString(36).slice(2,8)}`;
  const cacheKey = `ace:context:persist-authority-test:v1`;
  const pack = buildAceContextPack({
    id: packId,
    contextId: 'persist-authority-test',
    createdAt: new Date().toISOString(),
    summary: 'Test persistence of authority',
    chunkIds: [ 'chunk:1' ],
    sourceRefs: [ 'scripts/ace/persist-authority-test.mjs' ],
    graphPaths: [],
    metadata: {},
    authority,
  });

  await setAceContextPackPointer(cacheKey, pack);
  console.log('Wrote pack via setAceContextPackPointer, cacheKey=', cacheKey);

  const snapshotPath = getAceContextPackSnapshotPath(cacheKey);
  console.log('Expected snapshot path:', snapshotPath);

  const read = await readAceContextPackSnapshot(cacheKey);
  console.log('Read snapshot authority:', (read && read.authority) ? read.authority : null);
}

main().catch(err => { console.error(err); process.exit(1); });
