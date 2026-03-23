import { readFileSync, writeFileSync, existsSync } from 'fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const scripts = pkg.scripts;
const removed = [];

// Dead file references found by audit
const deadScriptNames = [
  'rag:crawl', 'rag:index',
  'phase76:worker',
  'index:codebase', 'index:codebase-full', 'search:codebase', 'search:errors',
  'ace:tools', 'ace:interactive', 'ace:session',
  'phase6:core',
  'start', // build/index.js doesn't exist
  'ready', // scripts/is-ready.mjs doesn't exist
  'phase72:svelte-check:ingest',
  'phase78:check-results', // check-suggestions.mjs doesn't exist
  'test:phase52:pipeline', 'test:phase52:full',
  'test:e2e:setup', // ../seed-test-db.mjs doesn't exist
  'test:pg:setup',
  'ocr:service', 'ocr:test',
  'evidence:detect', 'evidence:setup', 'evidence:start', 'evidence:stop',
  'evidence:db', 'evidence:test', 'evidence:worker', 'evidence:demo',
  'bench:splitter',
  'autosolve:eventloop:start',
  'mcp:json-validation:start',
  'gpu:markdown:start', 'gpu:markdown:test:suite', 'gpu:markdown:test:quick',
  'migrate', 'migrate:init', 'migrate:status',
  'imports:test-comprehensive',
  'parse:svelte-errors', 'rank:svelte-errors', 'analyze:svelte-errors',
  'phase76:mcp',
  // Scripts referencing dead npm script aliases
  'phase76:pipeline', // references phase76:full-audit + phase76:couchdb-sync (both dead)
  'phase76:full', // references phase73:build, phase74:inventory, etc (all dead)
  'phase76:full-stack', // references dead phase76 scripts
  'phase76:report', 'phase76:json-report', // cat reports that don't exist
  'phase76:stack', // references phase76:mcp:new (dead)
  'phase77:merge', // training-data dir likely doesn't exist
  'errors:all', // references cpp:check:json, errors:consolidate, errors:monitor (dead)
  'errors:pipeline', // references errors:all + errors:cluster (dead)
  'setup:all', // references knowledge:setup + index:codebase + index:errors (dead)
  'phase76:kb:manifest', // references run-crawler-manifest.ps1 (missing)
  // Composite scripts that only call other dead scripts
  'test:e2e:full', // references test:e2e:setup + test:e2e:teardown (dead)
  'autosolve:eventloop:run-once', // references autosolve:eventloop:start (dead)
  'check:integration', // references install-and-check.ps1 (missing)
  'imports:resolve-all', 'imports:analyze', 'imports:context7', 'imports:webfetch',
  'imports:generate', 'imports:quick-fix',
  // start:* aliases to dead scripts
  'start:env', // ../start-dual-ports-with-env.cjs doesn't exist
  'dev:proxy', // ../start-port-5180.cjs doesn't exist
  'dev:dual', 'start:dual', // both reference start-port-5180.cjs
  'phase78:unblock', // UNBLOCK_PHASE78.ps1 doesn't exist
];

for (const name of deadScriptNames) {
  if (scripts[name]) {
    removed.push(name);
    delete scripts[name];
  }
}

writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');

console.log(`Removed ${removed.length} dead npm scripts:`);
removed.forEach(r => console.log(`  - ${r}`));
console.log(`\nRemaining scripts: ${Object.keys(scripts).length}`);