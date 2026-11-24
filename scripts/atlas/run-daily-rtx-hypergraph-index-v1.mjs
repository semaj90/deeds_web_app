#!/usr/bin/env node
/**
 * run-daily-rtx-hypergraph-index-v1.mjs
 *
 * Orchestrator scaffold connecting:
 *   1. Exact-source Graphify cohort verification (`plan-current-source-graphify-batch-v1.mjs`)
 *   2. WSL2 RAPIDS `cuml.KMeans` GPU clustering preflight (`scripts/gpu/prepare-cuvs-kmeans.ps1`)
 *   3. Valkey `:6379` L2 centroid warming gate (fails closed if Docker/Valkey is offline)
 *   4. Hypergraph V2 vertex stream + ACE ContextManifest report output
 *
 * NEXT STEPS:
 *   1. Admit verified `IMPORTS`/`CALLS` edges for workspace revision `74ac7d8983e` into PG18
 *      before promoting any snapshot to ACE `ContextManifest`.
 *   2. Start Docker Desktop so Valkey `:6379` is reachable for L2 centroid readback proofs.
 *   3. Configure `:8095` daemon with `ATLAS_OAKLIB_ONTOLOGY_ROOT` / `FILE` to serve the
 *      110-term OBO ontology live.
 *   4. Register this script in Windows Task Scheduler / `/schedule` once live gates pass.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const REPORT_PATH = path.join(REPO_ROOT, '.tmp', 'atlas', 'daily-rtx-hypergraph-index-v1.json');

function checkTcpPort(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (ok, reason) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ ok, reason });
    };
    socket.setTimeout(timeoutMs);
    socket.on('connect', () => finish(true, 'connected'));
    socket.on('timeout', () => finish(false, 'timeout'));
    socket.on('error', (err) => finish(false, err.code || err.message));
    socket.connect(port, host);
  });
}

async function main() {
  const dryRun = !process.argv.includes('--live');
  const startedAt = new Date().toISOString();

  // 1. Check service gates (Valkey :6379, llama-server :8090, OAK :8095)
  const [valkey, llama, oak] = await Promise.all([
    checkTcpPort('127.0.0.1', 6379),
    checkTcpPort('127.0.0.1', 8090),
    checkTcpPort('127.0.0.1', 8095),
  ]);

  // 2. Run bounded exact-source Graphify check
  const graphifyCheck = spawnSync(
    'node',
    [
      'scripts/atlas/plan-current-source-graphify-batch-v1.mjs',
      '--admitted-snapshot',
      '--limit=1',
      '--source-ref=scripts/atlas/train-policy-reranker.py',
      '--report=.tmp/atlas/ace-graphify-target-cohort-v1.json',
    ],
    { cwd: REPO_ROOT, encoding: 'utf8', timeout: 15000 }
  );

  // NEXT STEP: Invoke WSL2 RAPIDS `cuml.KMeans` when `--live` and VRAM gate passes:
  //   pwsh -NoProfile -File scripts/gpu/prepare-cuvs-kmeans.ps1
  // NEXT STEP: Admit IMPORTS/CALLS edges via existing PG18 graph admission owner.

  const report = {
    schema: 'atlas.daily-rtx-hypergraph-index.v1',
    startedAt,
    finishedAt: new Date().toISOString(),
    dryRun,
    canonicalAuthority: false,
    writesPerformed: false,
    services: {
      valkey6379: valkey,
      llamaServer8090: llama,
      oak8095: oak,
    },
    graphifyExactReadbackExitCode: graphifyCheck.status,
    nextSteps: [
      'Admit verified IMPORTS/CALLS edges to PostgreSQL for base workspace revision.',
      'Start Docker Desktop for live Valkey :6379 L2 centroid warming and readback.',
      'Set ATLAS_OAKLIB_ONTOLOGY_ROOT on :8095 to serve atlas-domain-and-language-terms-v1.obo.',
      'Wire /api/atlas/hypergraph/vertex-stream to hypergraph-vertex-stream.worker.ts.',
    ],
  };

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
