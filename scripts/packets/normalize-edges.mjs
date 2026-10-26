#!/usr/bin/env node
/**
 * Converts legacy heuristic edge extracts into gated, deterministic proposal records.
 */
import fs from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGraphEdgeProposalV1 } from './graph-edge-proposal-v1.mjs';
import { buildToolEdgeProposalV1 } from './tool-edge-proposal-v1.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const OUT_FILE = path.join(ROOT, '.tmp', 'atlas', 'graph-edge-proposals-v1.jsonl');

function normPath(p) {
  return p.replace(/\\/g, '/').replace(/^.*sveltekit-frontend\//, 'src/');
}

const SOURCES = [
  {
    file: path.join(ROOT, 'scripts', 'atlas', 'out', 'db-usage-edges.ndjson'),
    normalize(r) {
      if (!r.source_file || !r.table) return null;
      return {
        src: normPath(r.source_file),
        dst: r.table,
        edge_type: 'USES_DB',
        metadata: { operation: r.operation, line: r.line_num, caller: r.caller },
        source_revision: r.source_revision ?? null,
        workspace_revision: r.workspace_revision ?? null,
        line: r.line_num,
        caller: r.caller,
      };
    },
  },
  {
    file: path.join(ROOT, 'scripts', 'atlas', 'out', 'tool-usage-edges.ndjson'),
    normalize(r) {
      if (!r.source_file) return null;
      return {
        src: normPath(r.source_file),
        proposal: buildToolEdgeProposalV1(r, normPath(r.source_file)),
      };
    },
  },
  {
    file: path.join(ROOT, 'scripts', 'atlas', 'out', 'calls-edges-2026-05-29.ndjson'),
    normalize(r) {
      if (!r.source_file || !r.callee) return null;
      const srcPath = normPath(r.source_file);
      return {
        src: srcPath,
        dst: r.callee,
        edge_type: 'CALLS',
        metadata: { kind: r.kind, line: r.line_num },
        source_revision: r.source_revision ?? null,
        workspace_revision: r.workspace_revision ?? null,
        line: r.line_num,
        caller: r.caller,
        type: r.kind,
      };
    },
  },
];

async function run() {
  console.log('\n=== normalize-edges ===');
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
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
      out.write(JSON.stringify(norm.proposal ?? buildGraphEdgeProposalV1({
        source_locator: norm.src,
        target_label: norm.dst,
        relation: norm.edge_type,
        source_revision: norm.source_revision,
        workspace_revision: norm.workspace_revision,
        line: norm.line,
        caller: norm.caller,
        type: norm.type,
        metadata: norm.metadata,
      })) + '\n');
      total++;
      fileTotal++;
    }
    console.log(`  ${path.basename(file)}: ${fileTotal} edges`);
  }

  await new Promise(resolve => out.end(resolve));
  console.log(`\nTotal: ${total} proposal records written (${skipped} skipped)\nCanonical graph output was not changed.\n→ ${OUT_FILE}`);
}

run().catch(e => { console.error(e.message); process.exit(1); });
