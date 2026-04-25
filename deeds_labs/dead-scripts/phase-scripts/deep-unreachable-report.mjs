import { readFileSync, statSync } from 'fs';
import { join, extname, basename, dirname } from 'path';

const data = JSON.parse(readFileSync('./unreachable-classified.json', 'utf8'));
const entries = Object.values(data.files);

// Categorize by function/domain
function categorize(entry) {
  const p = entry.path.replaceAll('\\', '/');
  const name = basename(p);
  const dir = dirname(p);
  const ext = extname(p);

  // Domain classification
  if (p.includes('/server/db/')) return 'database';
  if (p.includes('/server/auth/') || p.includes('/auth/')) return 'auth';
  if (p.includes('/server/vector/') || p.includes('/server/qdrant') || p.includes('qdrant')) return 'vector-search';
  if (p.includes('/server/grpc/') || p.includes('grpc')) return 'grpc';
  if (p.includes('/server/queue/') || p.includes('rabbitmq') || p.includes('amqp')) return 'message-queue';
  if (p.includes('/server/analysis/') || p.includes('forensic') || p.includes('entity-extract')) return 'analysis-pipeline';
  if (p.includes('/server/cache/') || p.includes('/cache/') || p.includes('redis')) return 'caching';
  if (p.includes('/server/indexer/') || p.includes('chunker') || p.includes('indexer')) return 'indexing';
  if (p.includes('/server/') && !p.includes('/server/db/')) return 'server-misc';

  if (p.includes('/components/ui/')) return 'ui-components';
  if (p.includes('/components/ai/') || p.includes('ai-') || p.includes('AI')) return 'ai-components';
  if (p.includes('/components/legal/')) return 'legal-components';
  if (p.includes('/components/canvas/') || p.includes('canvas')) return 'canvas-components';
  if (p.includes('/components/search/')) return 'search-components';
  if (p.includes('/components/forms/')) return 'form-components';
  if (p.includes('/components/')) return 'misc-components';

  if (p.includes('/machines/') || p.includes('machine')) return 'state-machines';
  if (p.includes('/stores/') || name.includes('store')) return 'stores';
  if (p.includes('/types/') || name.endsWith('.d.ts')) return 'types';
  if (p.includes('/utils/')) return 'utilities';
  if (p.includes('/webgpu/')) return 'webgpu';
  if (p.includes('/wasm/') || p.includes('wasm')) return 'wasm';
  if (p.includes('/3d/') || p.includes('three') || p.includes('3d')) return '3d-graphics';
  if (p.includes('/ast/')) return 'ast-tools';
  if (p.includes('/features/')) return 'features';
  if (p.includes('/api/') || p.includes('/services/')) return 'api-services';
  if (p.includes('/config/')) return 'config';
  if (p.includes('/workers/')) return 'workers';
  if (p.includes('/integrations/')) return 'integrations';
  if (p.includes('/actions/')) return 'svelte-actions';
  if (p.includes('/sdk/')) return 'sdk';
  if (p.includes('/animations/')) return 'animations';

  return 'other';
}

// Process all entries by category and classification
const report = {};
for (const entry of entries) {
  const cat = entry.category; // CLEAN, STUB, CORRUPTED, etc.
  const domain = categorize(entry);

  if (!report[cat]) report[cat] = {};
  if (!report[cat][domain]) report[cat][domain] = [];
  report[cat][domain].push({
    path: entry.path.replaceAll('\\', '/'),
    lines: entry.lines,
    size: entry.size,
    reason: entry.reason
  });
}

// Print CLEAN files report
console.log('====================================================================');
console.log('CLEAN UNREACHABLE FILES — FEATURE CANDIDATES (1,239 files)');
console.log('====================================================================\n');

const cleanDomains = report['CLEAN'] || {};
const domainOrder = Object.entries(cleanDomains)
  .sort((a, b) => b[1].length - a[1].length);

for (const [domain, files] of domainOrder) {
  const totalLines = files.reduce((s, f) => s + f.lines, 0);
  console.log(`\n## ${domain.toUpperCase()} (${files.length} files, ${totalLines.toLocaleString()} lines)`);

  // Show files sorted by size (largest first)
  const sorted = files.sort((a, b) => b.lines - a.lines);
  const show = sorted.slice(0, 8);
  for (const f of show) {
    console.log(`  ${f.path} (${f.lines} lines)`);
  }
  if (sorted.length > 8) {
    console.log(`  ... and ${sorted.length - 8} more`);
  }
}

// Print STUB files report
console.log('\n\n====================================================================');
console.log('STUB FILES — NEED REWRITE OR DELETE (526 files)');
console.log('====================================================================\n');

const stubDomains = report['STUB'] || {};
const stubOrder = Object.entries(stubDomains)
  .sort((a, b) => b[1].length - a[1].length);

for (const [domain, files] of stubOrder) {
  console.log(`\n## ${domain.toUpperCase()} (${files.length} stubs)`);
  const sorted = files.sort((a, b) => b.lines - a.lines);
  const show = sorted.slice(0, 5);
  for (const f of show) {
    console.log(`  ${f.path} (${f.lines} lines)`);
  }
  if (sorted.length > 5) {
    console.log(`  ... and ${sorted.length - 5} more`);
  }
}

// Print CORRUPTED files summary
console.log('\n\n====================================================================');
console.log('CORRUPTED FILES — CANDIDATES FOR DELETION (231 files)');
console.log('====================================================================\n');

const corruptedDomains = report['CORRUPTED'] || {};
const corruptOrder = Object.entries(corruptedDomains)
  .sort((a, b) => b[1].length - a[1].length);

for (const [domain, files] of corruptOrder) {
  console.log(`## ${domain.toUpperCase()} (${files.length} corrupted)`);
  files.slice(0, 3).forEach(f => console.log(`  ${f.path} (${f.lines} lines — ${f.reason})`));
  if (files.length > 3) console.log(`  ... and ${files.length - 3} more`);
}

// Summary table
console.log('\n\n====================================================================');
console.log('ACTION SUMMARY');
console.log('====================================================================\n');

const actions = {
  'WIRE IN': 0,
  'REWRITE': 0,
  'DELETE': 0,
  'REVIEW': 0,
};

// Clean files with >50 lines in useful domains = WIRE IN candidates
const wireableDomains = ['database', 'auth', 'vector-search', 'grpc', 'message-queue',
  'analysis-pipeline', 'caching', 'indexing', 'state-machines', 'types', 'ast-tools',
  'webgpu', 'api-services', 'workers', 'svelte-actions'];

for (const [domain, files] of Object.entries(cleanDomains)) {
  if (wireableDomains.includes(domain)) {
    actions['WIRE IN'] += files.filter(f => f.lines > 30).length;
    actions['REVIEW'] += files.filter(f => f.lines <= 30).length;
  } else {
    actions['REVIEW'] += files.length;
  }
}

actions['REWRITE'] = Object.values(stubDomains).reduce((s, files) => s + files.length, 0);
actions['DELETE'] = (report['CORRUPTED'] ? Object.values(report['CORRUPTED']).reduce((s, f) => s + f.length, 0) : 0)
  + (report['ARCHIVE'] ? Object.values(report['ARCHIVE']).reduce((s, f) => s + f.length, 0) : 0)
  + (report['COMMENTED'] ? Object.values(report['COMMENTED']).reduce((s, f) => s + f.length, 0) : 0);

console.log('Action breakdown:');
for (const [action, count] of Object.entries(actions)) {
  console.log(`  ${action}: ${count} files`);
}
console.log(`  TOTAL: ${Object.values(actions).reduce((s, c) => s + c, 0)} files`);
