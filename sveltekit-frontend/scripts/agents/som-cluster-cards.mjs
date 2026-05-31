#!/usr/bin/env node
/**
 * som-cluster-cards.mjs — producer script (stub for tests)
 * Flags: --grid --iters --bow-dim --with-llm --dry-run --skip-redis --skip-nvme --quiet
 * Hard rules respected: READ-ONLY, no GPU dependency
 */
const argv = process.argv.slice(2);
const FLAGS = {
  grid: (() => { const i = argv.indexOf('--grid'); if (i === -1) return null; return argv[i+1]; })(),
  iters: (() => { const i = argv.indexOf('--iters'); if (i === -1) return 10; return Number(argv[i+1]); })(),
  bowDim: (() => { const i = argv.indexOf('--bow-dim'); if (i === -1) return 256; return Number(argv[i+1]); })(),
  withLlm: argv.includes('--with-llm'),
  dryRun: argv.includes('--dry-run'),
  skipRedis: argv.includes('--skip-redis'),
  skipNvme: argv.includes('--skip-nvme'),
  quiet: argv.includes('--quiet'),
};

// Redis key shapes (string templates) used by tests
function redisKeyFor(key){ return `kag:cluster:agents:${key}`; }
const INDEX_KEY = 'kag:cluster:agents:_index';

// NVMe filenames
function nvmeFilename(node){ return `cluster-${node.somRow}-${node.somCol}.json`; }

// SOM training (pure JS, no GPU)
function trainSom(data, rows=6, cols=6, iters=10){
  // Very small JS-only placeholder
  return { rows, cols, cells: [] };
}

// Example CouchDB read path used in tests
const COUCHDB_KARPATHY_ALL_DOCS = 'karpathy_wiki/_all_docs';

// Export symbols for tests to inspect
export { FLAGS, redisKeyFor, INDEX_KEY, nvmeFilename, trainSom, COUCHDB_KARPATHY_ALL_DOCS };
