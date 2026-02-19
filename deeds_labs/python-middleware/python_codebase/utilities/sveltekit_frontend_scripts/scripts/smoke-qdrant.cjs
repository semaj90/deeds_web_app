const path = require('path');
const { pathToFileURL } = require('url');

(async () => {
  try {
    const modPath = path.resolve(process.cwd(), 'src', 'lib', 'server', 'services', 'qdrant-client.ts');
    // Use dynamic import with file URL (Node ESM will accept .ts if loaders present); try direct require of transpiled JS first
    let mod;
    try {
      // If repository builds to .js, this will work; otherwise fall back to using ts-node/tsx when available
      const jsPath = modPath.replace(/\.ts$/, '.js');
      mod = require(jsPath);
    } catch (e) {
      // fallback to dynamic import of file URL (may fail without tsx/loader)
      mod = await import(pathToFileURL(modPath).href);
    }

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
})();
