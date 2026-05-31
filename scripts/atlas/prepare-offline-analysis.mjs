import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const FRONTEND_ROOT = path.join(REPO_ROOT, 'sveltekit-frontend');

const targetDir = path.join(FRONTEND_ROOT, '.tmp', 'offline-analysis');

const filesToCopy = [
  { src: path.join(FRONTEND_ROOT, '.tmp', 'feature_labels.jsonl'), dest: 'feature_labels.jsonl' },
  { src: path.join(FRONTEND_ROOT, '.tmp', 'kanban_tasks.jsonl'), dest: 'kanban_tasks.jsonl' },
  { src: path.join(FRONTEND_ROOT, '.tmp', 'gemma-recommendations.jsonl'), dest: 'gemma-recommendations.jsonl' },
  { src: path.join(REPO_ROOT, 'scripts', 'atlas', 'out', 'db-usage-edges.ndjson'), dest: 'db-usage-edges.ndjson' },
  { src: path.join(REPO_ROOT, 'scripts', 'atlas', 'out', 'tool-usage-edges.ndjson'), dest: 'tool-usage-edges.ndjson' },
  { src: path.join(FRONTEND_ROOT, '.tmp', 'gate3-synthesis-report.json'), dest: 'gate3-synthesis-report.json' },
  { src: path.join(FRONTEND_ROOT, '.tmp', 'atlas-gate4-reasoning-loop-report.json'), dest: 'atlas-gate4-reasoning-loop-report.json' },
  { src: path.join(REPO_ROOT, 'scripts', 'duckdb-mapreduce-atlas-join.mjs'), dest: 'duckdb-mapreduce-atlas-join.mjs' },
  { src: path.join(REPO_ROOT, 'scripts', 'couchdb-persist-pagerank.mjs'), dest: 'couchdb-persist-pagerank.mjs' },
  { src: path.join(REPO_ROOT, 'scripts', 'atlas', 'push-parent-atlas-to-couchdb.mjs'), dest: 'push-parent-atlas-to-couchdb.mjs' },
  { src: path.join(FRONTEND_ROOT, 'memory', 'codebase', 'module-cartridges.jsonl'), dest: 'module-cartridges.jsonl' },
  { src: path.join(FRONTEND_ROOT, 'memory', 'codebase', 'module-cartridges.min.json'), dest: 'module-cartridges.min.json' },
  { src: path.join(FRONTEND_ROOT, 'memory', 'codebase', 'module-cartridges.idx.json'), dest: 'module-cartridges.idx.json' },
];

function main() {
  console.log(`📂 Centralizing data files into ${targetDir} for offline analysis...`);

  fs.mkdirSync(targetDir, { recursive: true });

  let copied = 0;
  
  // Direct copies
  for (const item of filesToCopy) {
    if (fs.existsSync(item.src)) {
      const destPath = path.join(targetDir, item.dest);
      fs.copyFileSync(item.src, destPath);
      console.log(`  ✓ Copied ${path.basename(item.src)} -> ${destPath}`);
      copied++;
    }
  }

  // Scan and copy docs/graph/ JSON files
  const docsGraphDir = path.join(REPO_ROOT, 'docs', 'graph');
  if (fs.existsSync(docsGraphDir)) {
    const files = fs.readdirSync(docsGraphDir).filter(f => f.endsWith('.json'));
    for (const f of files) {
      fs.copyFileSync(path.join(docsGraphDir, f), path.join(targetDir, `docs-graph-${f}`));
      console.log(`  ✓ Copied docs/graph/${f} -> docs-graph-${f}`);
      copied++;
    }
  }

  // Scan and copy sveltekit-frontend/docs/graph/ JSON files
  const feGraphDir = path.join(FRONTEND_ROOT, 'docs', 'graph');
  if (fs.existsSync(feGraphDir)) {
    const files = fs.readdirSync(feGraphDir).filter(f => f.endsWith('.json'));
    for (const f of files) {
      fs.copyFileSync(path.join(feGraphDir, f), path.join(targetDir, `fe-graph-${f}`));
      console.log(`  ✓ Copied sveltekit-frontend/docs/graph/${f} -> fe-graph-${f}`);
      copied++;
    }
  }

  // Generate DuckDB/CouchDB MapReduce guide
  const readmeContent = `# Offline Analysis Directory

This directory contains consolidated data dumps representing the codebase feature-graph, task allocations, and Neo4j relationship maps.

## 🦆 DuckDB MapReduce Joins
You can load these files directly into DuckDB to run analytics:
\`\`\`sql
-- Load database usage edges
CREATE TABLE db_usage AS SELECT * FROM read_ndjson_auto('db-usage-edges.ndjson');

-- Join files to clusters
SELECT top_feature, COUNT(*) as file_count 
FROM read_ndjson_auto('feature_labels.jsonl')
GROUP BY top_feature;
\`\`\`

## 🛋️ CouchDB Document Loading
These JSONL / NDJSON files can be bulk-uploaded into CouchDB databases for map-reduce view generation.
`;

  fs.writeFileSync(path.join(targetDir, 'README.md'), readmeContent);
  console.log(`\n==================================================`);
  console.log(`✓ Offline Analysis Workspace Staged:`);
  console.log(`  Target Directory   : ${targetDir}`);
  console.log(`  Data Files Copied  : ${copied}`);
  console.log(`  ReadMe Guide Saved : README.md`);
  console.log(`==================================================`);
}

main();
