import { readFileSync } from 'node:fs';
const g = JSON.parse(readFileSync('docs/graph/codebase-graph.json', 'utf8'));
const files = g.files || g;

const targets = [
  'langextract-client',
  'langextract-service',
  'langextract-reranker',
  'langextract/google-langextract',
  'langextract/bag-cache',
  'tools/handlers/langextractBatch',
];
console.log('=== fanIn for langextract files ===');
for (const t of targets) {
  const f = files.find(x => x.rel.replace(/\\/g, '/').includes(t));
  if (f) console.log(`  fanIn=${f.fanIn ?? 0}  ${f.rel.replace(/\\/g, '/')}  (${f.lineCount ?? 0} loc)`);
  else   console.log(`  NOT IN GRAPH:  ${t}`);
}
