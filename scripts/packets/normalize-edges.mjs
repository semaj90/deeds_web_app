#!/usr/bin/env node
/**
 * Normalizes raw extraction edge files into the canonical atlas-graph-edges.jsonl schema.
 * Run once after extract-db-usage.mjs / extract-tool-usage.mjs to populate canonical location.
 */
import fs from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const OUT_FILE = path.join(ROOT, 'memory', 'packets', 'atlas-graph-edges.jsonl');
const NOW = new Date().toISOString();

function normPath(p) {
  return p.replace(/\\/g, '/').replace(/^.*sveltekit-frontend\//, 'src/');
}

const SOURCES = [
  {
    file: path.join(ROOT, 'scripts', 'atlas', 'out', 'db-usage-edges.ndjson'),
    normalize(r) {
      if (!r.source_file || !r.table) return null;
      return {
        id: randomUUID(), packet_uuid: null,
        src: normPath(r.source_file),
        dst: r.table,
        edge_type: 'USES_DB',
        weight: 1,
        metadata: { operation: r.operation, line: r.line_num, caller: r.caller },
        feature_id: null, som_cluster: null, created_at: NOW,
      };
    },
  },
  {
    file: path.join(ROOT, 'scripts', 'atlas', 'out', 'tool-usage-edges.ndjson'),
    normalize(r) {
      if (!r.source_file) return null;
      const dst = r.tool || r.endpoint || r.service || 'unknown';
      return {
        id: randomUUID(), packet_uuid: null,
        src: normPath(r.source_file),
        dst,
        edge_type: 'USES_TOOL',
        weight: 1,
        metadata: { type: r.type, line: r.line_num },
        feature_id: null, som_cluster: null, created_at: NOW,
      };
    },
  },
  {
    file: path.join(ROOT, 'scripts', 'atlas', 'out', 'calls-edges-2026-05-29.ndjson'),
    normalize(r) {
      if (!r.source_file || !r.callee) return null;
      const srcPath = normPath(r.source_file);
      return {
        id: randomUUID(), packet_uuid: null,
        src: `${srcPath}:${r.line_num ?? 0}:${r.caller ?? '(module)'}`,
        dst: r.callee,
        edge_type: 'CALLS',
        weight: 1,
        metadata: { kind: r.kind, line: r.line_num },
        feature_id: null, som_cluster: null, created_at: NOW,
      };
    },
  },
];

async function run() {
  console.log('\n=== normalize-edges ===');
  const out = fs.createWriteStream(OUT_FILE);
  let total = 0;
  let skipped = 0;

  for (const { file, normalize } of SOURCES) {
    if (!fs.existsSync(file)) {
      console.log(`  skip (missing): ${path.basename(file)}`);
      continue;
    }
    let fileTotal = 0;
    const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
    for await (const line of rl) {
      const t = line.trim();
      if (!t) continue;
      let r;
      try { r = JSON.parse(t); } catch { skipped++; continue; }
      const norm = normalize(r);
      if (!norm) { skipped++; continue; }
      out.write(JSON.stringify(norm) + '\n');
      total++;
      fileTotal++;
    }
    console.log(`  ${path.basename(file)}: ${fileTotal} edges`);
  }

  await new Promise(resolve => out.end(resolve));
  console.log(`\nTotal: ${total} edges written (${skipped} skipped)\n→ ${OUT_FILE}`);
}

run().catch(e => { console.error(e.message); process.exit(1); });
