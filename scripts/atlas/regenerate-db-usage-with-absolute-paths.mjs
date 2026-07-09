#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

// Read existing edges
const edgesPath = path.join(projectRoot, 'scripts/atlas/out/db-usage-edges.ndjson');
const content = fs.readFileSync(edgesPath, 'utf-8');
const edges = content
  .trim()
  .split('\n')
  .map(line => JSON.parse(line));

// Regenerate with absolute paths (matching Phase 2 format)
const absEdges = edges.map(e => {
  // Convert relative path to absolute
  const fullPath = path.resolve(projectRoot, e.source_file);
  const normalized = fullPath.replace(/\\/g, '/');

  return {
    ...e,
    source_file: normalized
  };
});

// Write back
const ndjson = absEdges.map(e => JSON.stringify(e)).join('\n');
fs.writeFileSync(edgesPath, ndjson);

console.log(`✓ Regenerated ${absEdges.length} USES_DB edges with absolute paths`);
console.log(`  Sample: ${absEdges[0].source_file}`);
