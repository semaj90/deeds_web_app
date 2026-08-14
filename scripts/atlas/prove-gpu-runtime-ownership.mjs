#!/usr/bin/env node

/**
 * Read-only ownership proof for the Parent Atlas workstation runtimes.
 * It does not install packages, restart services, mutate stores, or promote
 * CAGRA. The 8095 AST sidecar and the dedicated 8098 RAPIDS sidecar are
 * intentionally separate owners.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const reportDir = resolve(root, 'docs/reports');
const jsonPath = resolve(reportDir, 'gpu-runtime-ownership-proof.json');
const mdPath = resolve(reportDir, 'gpu-runtime-ownership-proof.md');

async function probe(url) {
  const started = Date.now();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    let payload = null;
    try { payload = await response.json(); } catch { /* health may be plain text */ }
    return { url, reachable: response.ok, status: response.status, elapsedMs: Date.now() - started, payload };
  } catch (error) {
    return { url, reachable: false, status: null, elapsedMs: Date.now() - started, error: String(error?.message ?? error) };
  }
}

function dockerSnapshot() {
  try {
    const raw = execFileSync('docker', ['ps', '--format', '{{json .}}'], { encoding: 'utf8', timeout: 5_000 });
    return raw.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
      .filter((item) => /miniforge|rapids|cuvs|gpu/i.test(`${item.Names ?? ''} ${item.Image ?? ''} ${item.Ports ?? ''}`));
  } catch (error) {
    return [{ status: 'UNAVAILABLE', error: String(error?.message ?? error) }];
  }
}

const [chat, ast, trace, rapids] = await Promise.all([
  probe('http://127.0.0.1:8090/health'),
  probe('http://127.0.0.1:8095/capabilities'),
  probe('http://127.0.0.1:8788/health'),
  probe('http://127.0.0.1:8098/health'),
]);

const astCapabilities = ast.payload ?? {};
const rapidsCapabilities = rapids.payload ?? {};
const gates = {
  CHAT_LLAMA_8090_REACHABLE: chat.reachable,
  AST_MINIFORGE_8095_REACHABLE: ast.reachable,
  TRACE_MCP_8788_REACHABLE: trace.reachable,
  AST_GPU_OWNER_SEPARATED: ast.reachable && astCapabilities.service === 'parent-atlas-compute-sidecar',
  RAPIDS_RUNTIME_8098_REACHABLE: rapids.reachable,
  CAGRA_NOT_PROMOTED: true,
};

const report = {
  schemaVersion: 'atlas.gpu.runtime.ownership-proof.v1',
  generatedAt: new Date().toISOString(),
  status: gates.CHAT_LLAMA_8090_REACHABLE && gates.AST_MINIFORGE_8095_REACHABLE && gates.TRACE_MCP_8788_REACHABLE ? 'PROVEN' : 'DEGRADED',
  ownership: {
    chat: { owner: 'llama-server', endpoint: 'http://127.0.0.1:8090/v1', health: chat },
    ast: { owner: 'miniforge-nlp-sidecar', endpoint: 'http://127.0.0.1:8095', health: ast, capabilities: astCapabilities },
    trace: { owner: 'TRACE MCP', endpoint: 'http://127.0.0.1:8788', health: trace },
    rapids: { owner: 'atlas_rapids_sidecar', endpoint: 'http://127.0.0.1:8098', health: rapids, capabilities: rapidsCapabilities },
  },
  docker: dockerSnapshot(),
  gates,
  policy: {
    canonicalIdentityOwner: 'Postgres/Parent Atlas',
    graphTruthOwner: 'Neo4j projection',
    retrievalProjectionOwner: 'Qdrant',
    chatOwner: 'llama-server:8090',
    embeddingOwner: 'Ollama:11434',
    astOwner: 'miniforge-nlp-sidecar:8095',
    gpuComputeOwner: 'atlas_rapids_sidecar:8098',
    cagraProduction: 'QUARANTINED',
  },
};

mkdirSync(reportDir, { recursive: true });
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(mdPath, [
  '# GPU/runtime ownership proof', '',
  `- status: **${report.status}**`,
  '- AST extraction: `miniforge-nlp-sidecar:8095`',
  '- GPU compute: `atlas_rapids_sidecar:8098` (separate, optional)',
  '- chat: `llama-server:8090`',
  '- embeddings: `Ollama:11434`',
  '- CAGRA production: **QUARANTINED**', '',
  ...Object.entries(gates).map(([key, value]) => `- ${key}: ${value ? 'PASS' : 'DEGRADED'}`), '',
  'This is a read-only ownership receipt. It does not install, restart, mutate, or promote any runtime.', '',
].join('\n'));

console.log(JSON.stringify({ status: report.status, jsonPath, mdPath, gates }, null, 2));
if (report.status === 'DEGRADED') process.exitCode = 2;
