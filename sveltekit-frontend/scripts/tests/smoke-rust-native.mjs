#!/usr/bin/env node
/**
 * smoke-rust-native.mjs — Integrated smoke for both Rust native addons + Qdrant path.
 *
 * Tests the full GPU/Karpathy → Qdrant → Rust kernel pipeline:
 *
 *   Pillar 1 — Rust graph-engine:   label propagation community detection
 *   Pillar 2 — Rust hmm-repair:     Viterbi HMM legal section classifier
 *   Pillar 3 — Qdrant integration:  codebase_chunks_768 has points; scroll and
 *                                    feed real chunk IDs through graph-engine
 *
 * Usage:
 *   node scripts/tests/smoke-rust-native.mjs
 *   node scripts/tests/smoke-rust-native.mjs --no-qdrant   # skip Qdrant pillar
 *   node scripts/tests/smoke-rust-native.mjs --strict      # missing pillar = fail
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const NO_QDRANT = process.argv.includes('--no-qdrant');
const STRICT    = process.argv.includes('--strict');

const QDRANT_URL        = process.env.QDRANT_URL        ?? 'http://127.0.0.1:6333';
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION ?? 'codebase_chunks_768';

const c = {
  green:  s => `\x1b[32m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  red:    s => `\x1b[31m${s}\x1b[0m`,
  cyan:   s => `\x1b[36m${s}\x1b[0m`,
  bold:   s => `\x1b[1m${s}\x1b[0m`,
  dim:    s => `\x1b[2m${s}\x1b[0m`,
};

let failed = 0, skipped = 0;
const ok   = (msg, detail = '') => console.log(`  ${c.green('✓')} ${msg}${detail ? c.dim('  ' + detail) : ''}`);
const warn = (msg, hint  = '') => { console.log(`  ${c.yellow('○')} ${msg}${hint ? c.dim('  ' + hint) : ''}`); skipped++; if (STRICT) failed++; };
const bad  = (msg, e     = '') => { console.log(`  ${c.red('✗')} ${msg}${e ? '  ' + c.red(String(e)) : ''}`); failed++; };

// ── Pillar 1: Rust graph-engine ───────────────────────────────────────────────
console.log(c.cyan('\n🦀 Pillar 1 — Rust graph-engine (community detection)\n'));

let graphEngine;
try {
  graphEngine = require(path.join(ROOT, 'simd-bridge/rust/graph-engine/index.js'));
  ok('graph-engine addon loaded');
} catch (e) {
  bad('graph-engine addon failed to load', e);
}

if (graphEngine) {
  const fn = graphEngine.detectCommunitiesRust ?? graphEngine.detect_communities_rust;
  if (typeof fn !== 'function') {
    bad(`detectCommunitiesRust not found  exports: ${Object.keys(graphEngine).join(', ')}`);
  } else {
    ok('detectCommunitiesRust exported');

    // Codebase-style graph: 3 clusters (api routes, lib server, lib client)
    const nodes    = ['api/chat', 'api/evidence', 'api/graph', 'api/sse',
                      'lib/server/retrieval', 'lib/server/embedding', 'lib/server/neo4j',
                      'lib/client/stores', 'lib/client/components'];
    const from     = ['api/chat', 'api/evidence', 'api/graph',
                      'lib/server/retrieval', 'lib/server/embedding',
                      'lib/client/stores'];
    const to       = ['api/evidence', 'api/graph', 'api/sse',
                      'lib/server/embedding', 'lib/server/neo4j',
                      'lib/client/components'];

    try {
      const communities = fn(nodes, from, to, 40);
      ok(`detectCommunitiesRust: ${communities.length} communities from ${nodes.length} nodes`);

      const totalMembers = communities.reduce((s, comm) => {
        return s + ((comm.nodeIds ?? comm.node_ids)?.length ?? 0);
      }, 0);
      if (totalMembers === nodes.length) {
        ok(`All ${nodes.length} nodes assigned`);
      } else {
        bad(`Node count mismatch: expected ${nodes.length}, got ${totalMembers}`);
      }

      // Verify api/* and lib/server/* are in different communities
      const communityOf = {};
      for (const comm of communities) {
        const id = comm.communityId ?? comm.community_id;
        for (const m of (comm.nodeIds ?? comm.node_ids ?? [])) communityOf[m] = id;
      }
      const apiComm   = communityOf['api/chat'];
      const srvComm   = communityOf['lib/server/retrieval'];
      const cliComm   = communityOf['lib/client/stores'];
      if (apiComm !== srvComm) {
        ok(`api/* and lib/server/* in separate communities (C${apiComm} vs C${srvComm})`);
      } else {
        warn('api/* and lib/server/* landed in same community — may need more iterations');
      }
      if (cliComm !== srvComm) {
        ok(`lib/client/* and lib/server/* in separate communities (C${cliComm} vs C${srvComm})`);
      }
    } catch (e) {
      bad('detectCommunitiesRust threw', e);
    }
  }
}

// ── Pillar 2: Rust hmm-repair ─────────────────────────────────────────────────
console.log(c.cyan('\n🦀 Pillar 2 — Rust hmm-repair (Viterbi HMM)\n'));

let hmmEngine;
try {
  hmmEngine = require(path.join(ROOT, 'simd-bridge/rust/hmm-repair/index.js'));
  ok('hmm-repair addon loaded');
} catch (e) {
  bad('hmm-repair addon failed to load', e);
}

if (hmmEngine) {
  const fn = hmmEngine.predictChunk ?? hmmEngine.predict_chunk;
  if (typeof fn !== 'function') {
    bad(`predictChunk not found  exports: ${Object.keys(hmmEngine).join(', ')}`);
  } else {
    ok('predictChunk exported');

    const VECTORS = [
      { text: 'The plaintiff filed a complaint in the district court alleging negligence.',
        label: 'negligence complaint' },
      { text: 'Pursuant to 28 U.S.C. § 1331, this Court has federal question jurisdiction.',
        label: 'jurisdiction + statute' },
      { text: 'John Smith, as plaintiff, and XYZ Corporation, as defendant, are the parties.',
        label: 'parties' },
      { text: 'WHEREFORE, plaintiff prays for judgment and an award of compensatory damages.',
        label: 'prayer for relief' },
    ];

    for (const { text, label } of VECTORS) {
      try {
        const result = fn(text);
        const primary    = result.primaryState   ?? result.primary_state   ?? '?';
        const confidence = result.confidence      ?? 0;
        const seqLen     = (result.stateSequence ?? result.state_sequence  ?? []).length;
        ok(`${label}  →  ${primary}  conf=${confidence.toFixed(4)}  seq=${seqLen}`);
      } catch (e) {
        bad(`predictChunk failed on "${label}"`, e);
      }
    }
  }
}

// ── Pillar 3: Qdrant → graph-engine integration ───────────────────────────────
console.log(c.cyan('\n🔍 Pillar 3 — Qdrant → Rust graph-engine integration\n'));

if (NO_QDRANT) {
  warn('Qdrant pillar skipped (--no-qdrant)');
} else {
  let qdrantOk = false;
  let chunkCount = 0;
  let sampleIds = [];

  try {
    const infoRes = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!infoRes.ok) throw new Error(`HTTP ${infoRes.status}`);
    const info = await infoRes.json();
    chunkCount = info.result?.vectors_count ?? info.result?.points_count ?? 0;
    if (chunkCount > 0) {
      ok(`Qdrant ${QDRANT_COLLECTION}: ${chunkCount.toLocaleString()} points`, QDRANT_URL);
      qdrantOk = true;
    } else {
      warn(`Qdrant ${QDRANT_COLLECTION} is empty`, 'run npm run codebase:index first');
    }
  } catch (e) {
    warn(`Qdrant not reachable at ${QDRANT_URL}`, String(e));
  }

  if (qdrantOk && graphEngine) {
    // Scroll up to 20 chunks and extract file-path payload as graph nodes
    try {
      const scrollRes = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/scroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 20, with_payload: true, with_vector: false }),
        signal: AbortSignal.timeout(8000),
      });
      const scroll = await scrollRes.json();
      const points = scroll.result?.points ?? [];

      if (points.length === 0) {
        warn('Qdrant scroll returned 0 points');
      } else {
        ok(`Qdrant scroll: ${points.length} sample chunks retrieved`);

        // Build a mini graph from file paths in chunk payloads
        const pathOf = p => (p.payload?.filePath ?? p.payload?.file_path ?? String(p.id));
        const nodeIds = [...new Set(points.map(pathOf))];
        const edgesFrom = [], edgesTo = [];

        // Connect chunks from the same directory as simple edges
        for (let i = 0; i < nodeIds.length - 1; i++) {
          const dirA = nodeIds[i].split('/').slice(0, -1).join('/');
          const dirB = nodeIds[i + 1].split('/').slice(0, -1).join('/');
          if (dirA === dirB) {
            edgesFrom.push(nodeIds[i]);
            edgesTo.push(nodeIds[i + 1]);
          }
        }

        const fn = graphEngine.detectCommunitiesRust ?? graphEngine.detect_communities_rust;
        const communities = fn(nodeIds, edgesFrom, edgesTo, 20);
        ok(`Qdrant chunks → graph-engine: ${nodeIds.length} nodes → ${communities.length} communities`,
           `${edgesFrom.length} edges built from same-dir proximity`);

        // Spot-check: all nodes assigned
        const assigned = communities.reduce((s, c) => s + ((c.nodeIds ?? c.node_ids)?.length ?? 0), 0);
        if (assigned === nodeIds.length) {
          ok(`All ${nodeIds.length} Qdrant-derived nodes assigned to communities`);
        } else {
          bad(`Node assignment mismatch: ${assigned}/${nodeIds.length}`);
        }
      }
    } catch (e) {
      bad('Qdrant scroll + graph-engine integration failed', e);
    }
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log();
if (failed === 0) {
  console.log(c.green(`✅ smoke-rust-native PASSED${skipped ? c.dim(`  (${skipped} skipped)`) : ''}`));
  process.exit(0);
} else {
  console.log(c.red(`❌ smoke-rust-native FAILED  (${failed} errors, ${skipped} skipped)`));
  process.exit(1);
}
