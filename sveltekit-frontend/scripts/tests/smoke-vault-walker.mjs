#!/usr/bin/env node
/**
 * smoke-vault-walker.mjs
 *
 * Exercises all 7 read-only vault-walker MCP tools against the live vault.
 * Writes results to memory/runs/<RUN_DIR>/vault-walker-smoke.json.
 *
 * Usage:
 *   node scripts/tests/smoke-vault-walker.mjs                  # writes to dated run dir
 *   node scripts/tests/smoke-vault-walker.mjs --run=<dir>      # use existing run dir
 *   RUN_DIR=memory/runs/X node scripts/tests/smoke-vault-walker.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const arg = (k, def) => {
  const hit = args.find(a => a.startsWith(`--${k}=`));
  return hit ? hit.split('=')[1] : def;
};

const RUN_DIR = process.env.RUN_DIR
  ?? arg('run', `memory/runs/${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`);

console.log(`[smoke] vault-walker — RUN_DIR=${RUN_DIR}\n`);
await mkdir(resolve(RUN_DIR), { recursive: true });

const m = await import('../../src/mcp/tools/vault-walker.tool.ts');
const results = {};
const startedAt = Date.now();

async function run(name, fn) {
  const t0 = Date.now();
  try {
    const out = JSON.parse(await fn());
    const ms = Date.now() - t0;
    results[name] = { ok: true, ms, ...out };
    const summary = JSON.stringify(out).slice(0, 80).replace(/\n/g, ' ');
    console.log(`  ✓ ${name}  ${ms}ms  ${summary}…`);
  } catch (e) {
    const ms = Date.now() - t0;
    results[name] = { ok: false, ms, error: e.message };
    console.log(`  ✗ ${name}  ${ms}ms  ERROR: ${e.message}`);
  }
}

// 1. vault.search — broad
await run('vault.search:qdrant', () =>
  m.vaultSearchTool.execute({ query: 'qdrant', limit: 5 }));

// 2. vault.search — filtered (high-risk clusters)
await run('vault.search:risk-high', () =>
  m.vaultSearchTool.execute({ query: 'cluster', collection: 'Clusters', risk: 'high', limit: 5 }));

// 3. vault.read — a file note
await run('vault.read:db-client', () =>
  m.vaultReadTool.execute({ path: 'Files/src__lib__server__db__client.md' }));

// 4. vault.read — a cluster note
await run('vault.read:cluster-7', () =>
  m.vaultReadTool.execute({ path: 'Clusters/cluster-7.md' }));

// 5. vault.followLinks — walk cluster contains 1 hop
await run('vault.followLinks:cluster-contains', () =>
  m.vaultFollowLinksTool.execute({
    path: 'Clusters/cluster-7.md', edgeType: 'contains', hops: 1, limit: 10
  }));

// 6. vault.followLinks — walk file up to cluster
await run('vault.followLinks:file-up', () =>
  m.vaultFollowLinksTool.execute({
    path: 'Files/src__lib__server__db__client.md', edgeType: 'up', hops: 1, limit: 5
  }));

// 7. vault.resolveEmbedding — vault path
await run('vault.resolveEmbedding:vault-path', () =>
  m.vaultResolveEmbeddingTool.execute({ path: 'Files/src__lib__server__db__client.md' }));

// 8. vault.resolveEmbedding — repo path
await run('vault.resolveEmbedding:repo-path', () =>
  m.vaultResolveEmbeddingTool.execute({ path: 'src/lib/server/db/client.ts' }));

// 9. retrieval.qdrantLookup — uses ID from #7 if available
const eid = results['vault.resolveEmbedding:vault-path']?.embedding_id
         ?? `qdrant://codebase_chunks_768/src/lib/server/db/client.ts`;
await run('retrieval.qdrantLookup', () =>
  m.retrievalQdrantLookupTool.execute({ embedding_id: eid, limit: 3 }));

// 10. agent.explainCluster — pull cluster aggregate
await run('agent.explainCluster:7', () =>
  m.agentExplainClusterTool.execute({ cluster_id: 7, topMembers: 5 }));

// 11. agent.proposeFix — generate markdown plan with 3-lane composition
await run('agent.proposeFix:db-client', () =>
  m.agentProposeFixTool.execute({
    file_path: 'src/lib/server/db/client.ts',
    issue: 'investigate cache miss path during pool warmup',
  }));

// 12. hypergraph.searchByLane — Lane A (cluster_context)
await run('hypergraph.searchByLane:A', () =>
  m.hypergraphSearchByLaneTool.execute({ query: 'retrieval', lane: 'cluster_context', limit: 5 }));

// 13. hypergraph.searchByLane — Lane B (shared_resource)
await run('hypergraph.searchByLane:B', () =>
  m.hypergraphSearchByLaneTool.execute({ query: 'evidence', lane: 'shared_resource', limit: 5 }));

// 14. hypergraph.searchByLane — Lane C (agents_context)
await run('hypergraph.searchByLane:C', () =>
  m.hypergraphSearchByLaneTool.execute({ query: 'ai', lane: 'agents_context', limit: 5 }));

const totalMs = Date.now() - startedAt;
const passed = Object.values(results).filter(r => r.ok).length;
const failed = Object.values(results).filter(r => !r.ok).length;

const report = {
  generated: new Date().toISOString(),
  totalMs,
  totalTools: Object.keys(results).length,
  passed,
  failed,
  vaultDir: process.env.OBSIDIAN_VAULT_DIR ?? 'docs/obsidian-vault',
  results,
};

await writeFile(
  resolve(RUN_DIR, 'vault-walker-smoke.json'),
  JSON.stringify(report, null, 2),
);

const summary = [
  `# Vault Walker Smoke — ${report.generated}`,
  ``,
  `**Result:** ${passed}/${Object.keys(results).length} passed (${totalMs}ms total)`,
  ``,
  `## Per-tool latencies`,
  '',
  '| Tool | Result | Latency | Highlight |',
  '|------|--------|---------|-----------|',
  ...Object.entries(results).map(([name, r]) => {
    const status = r.ok ? '✓' : '✗';
    const hl = r.ok
      ? (r.totalFound != null ? `${r.totalFound} hits`
         : r.totalVisited != null ? `${r.totalVisited} nodes`
         : r.embedding_id ? r.embedding_id.slice(0, 50)
         : r.proposal_kind ? r.proposal_kind
         : r.member_count != null ? `${r.member_count} members`
         : 'ok')
      : r.error;
    return `| \`${name}\` | ${status} | ${r.ms}ms | ${hl} |`;
  }),
  '',
  `**JSON report:** [vault-walker-smoke.json](./vault-walker-smoke.json)`,
].join('\n');

await writeFile(resolve(RUN_DIR, 'vault-walker-smoke.md'), summary);

console.log('');
console.log(`[smoke] ${passed}/${Object.keys(results).length} passed in ${totalMs}ms`);
console.log(`[smoke] report → ${RUN_DIR}/vault-walker-smoke.{json,md}`);
process.exit(failed > 0 ? 1 : 0);
