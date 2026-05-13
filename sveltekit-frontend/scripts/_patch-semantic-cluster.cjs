const fs = require('fs');
const file = 'scripts/graphify-semantic-cluster.mjs';
let txt = fs.readFileSync(file, 'utf8');

// Find the block between line 202-214 by detecting the with_payload: true pattern
// in the scrollCollection function body. We replace the body construction.
const OLD_PART1 = "    const body = { limit: SCROLL_BATCH, with_payload: true, with_vector: withVector };";
const OLD_PART2_START = "    if (off) body.offset = off;";
const OLD_FILTER = "    // Filter: only points that have gemma4Summary or clusterId in payload\n    body.filter = {\n      must: [{ key: 'gemma4Summary', match: { text: '' } }]   // non-empty string match\n    };";
const OLD_FETCH_START = "    const res = await fetch(`${QDRANT_URL}/collections/${collection}/points/scroll`, {\n      method: 'POST',\n      headers: { 'Content-Type': 'application/json' },\n      body: JSON.stringify({ limit: SCROLL_BATCH, with_payload: true, with_vector: withVector, ...(off ? { offset: off } : {}) }),";

// Find character positions
const idx1 = txt.indexOf(OLD_PART1);
const idx2 = txt.indexOf(OLD_FETCH_START);

if (idx1 < 0 || idx2 < 0) {
  console.log('Could not find target block. Indices:', idx1, idx2);
  process.exit(1);
}

// Extract the end of the old fetch line
const fetchEnd = idx2 + OLD_FETCH_START.length;

const NEW_BLOCK = `    const body = {
      limit: SCROLL_BATCH,
      with_payload: ['dir', 'directoryPath', 'filePath', 'gemma4Summary'],
      with_vector: withVector,
      filter: { must_not: [{ is_empty: { key: 'gemma4Summary' } }] },
      ...(off ? { offset: off } : {})
    };
    const res = await fetch(\`\${QDRANT_URL}/collections/\${collection}/points/scroll\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),`;

const patched = txt.slice(0, idx1) + NEW_BLOCK + txt.slice(fetchEnd);
fs.writeFileSync(file, patched);
console.log('PATCHED at char', idx1, '->', fetchEnd);
