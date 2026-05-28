#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

// Lightweight ingestion script stub.
// Scans .opencode/cards/*.jsonl and .opencode/cards/*.json, prints counts.

const OPENCODE = path.resolve(process.cwd(), '.opencode', 'cards');

function listFiles(dir) {
  try {
    return fs.readdirSync(dir).map((f) => path.join(dir, f));
  } catch (err) {
    return [];
  }
}

function isJsonFile(f) {
  return f.endsWith('.json') || f.endsWith('.jsonl') || f.endsWith('.ndjson');
}

function summary() {
  const files = listFiles(OPENCODE).filter(isJsonFile);
  console.log(`Found ${files.length} OpenCode card files under ${OPENCODE}`);
  let total = 0;
  for (const file of files) {
    try {
      const stat = fs.statSync(file);
      console.log(`- ${path.basename(file)} (${stat.size} bytes)`);
      total += 1;
    } catch (e) {}
  }
  console.log(`
Suggested workflow:
- Inspect and curate batches of files.
- Use this script to emit SQL COPY/INSERT statements or NDJSON for Qdrant ingestion.
`);
}

if (require.main === module) {
  summary();
}

export default { summary };
