import path from 'path';
import { pathToFileURL } from 'url';

async function run() {
  try {
    const modPath = path.resolve(
      process.cwd(),
      'src',
      'lib',
      'server',
      'services',
      'qdrant-client.ts'
    );
    const modUrl = pathToFileURL(modPath).href;
    const mod = await import(modUrl);
    if (!mod) throw new Error('Failed to import qdrant client');

    if (typeof mod.initQdrantIndexes === 'function') {
      const init = await mod.initQdrantIndexes('documents');
      console.log('initQdrantIndexes ->', init);
    } else {
      console.warn('initQdrantIndexes not available on module');
    }

    if (mod.qdrant && typeof mod.qdrant.getCollections === 'function') {
      const cols = await mod.qdrant.getCollections();
      console.log('getCollections ->', JSON.stringify(cols));
    } else {
      console.warn('qdrant.getCollections not available');
    }

    process.exit(0);
  } catch (e) {
    console.error('Smoke test error:', e);
    process.exit(2);
  }
}

run();
