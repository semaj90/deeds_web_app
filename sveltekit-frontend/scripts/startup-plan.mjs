#!/usr/bin/env node
/**
 * startup-plan.mjs — Karpathy-style codebase context plan on every dev-server start
 *
 * Generates memory/runs/<timestamp>/plan.md containing:
 *   - NES cluster topology summary (from docs/graph/nes-glyph-architecture.json)
 *   - Active gaps from wiki gap report (code_relations, graph sync, ACE hits)
 *   - Directory context from nearest AGENTS.md files
 *   - Next actions ordered by priority
 *   - MLA/TurboQuant KV math for current GPU budget
 *
 * Usage:
 *   node scripts/startup-plan.mjs          # runs silently, writes plan
 *   node scripts/startup-plan.mjs --print  # also prints summary to stdout
 *   node scripts/startup-plan.mjs --scan=src/lib/server/graph  # extra dir scan
 *
 * npm: "dev:plan": "node scripts/startup-plan.mjs && npm run dev"
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, dirname, relative, join } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const MEMORY_RUNS = resolve(ROOT, 'memory/runs');
const DOCS_GRAPH = resolve(ROOT, 'docs/graph');

const args = process.argv.slice(2);
const PRINT = args.includes('--print');
const SCAN_DIR = (() => {
  const s = args.find(a => a.startsWith('--scan='));
  return s ? resolve(ROOT, s.slice(7)) : null;
})();

const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const RUN_DIR = resolve(MEMORY_RUNS, RUN_ID);

// ── helpers ───────────────────────────────────────────────────────────────────

function safeRead(p) {
  try { return readFileSync(p, 'utf8'); } catch { return null; }
}

function safeJson(p) {
  const txt = safeRead(p);
  try { return txt ? JSON.parse(txt) : null; } catch { return null; }
}

function git(cmd) {
  try { return execSync(`git -C "${ROOT}" ${cmd}`, { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }).trim(); }
  catch { return ''; }
}

function findAgentsMd(dir, rootLimit) {
  let cur = dir;
  while (cur.startsWith(rootLimit) && cur !== rootLimit) {
    const candidate = join(cur, 'AGENTS.md');
    if (existsSync(candidate)) return candidate;
    cur = dirname(cur);
  }
  const rootCandidate = join(rootLimit, 'AGENTS.md');
  return existsSync(rootCandidate) ? rootCandidate : null;
}

function scanDirectory(dir, depth = 0) {
  if (depth > 3) return [];
  const results = [];
  let entries;
  try { entries = readdirSync(dir); } catch { return []; }
  for (const entry of entries) {
    if (['node_modules', '.svelte-kit', 'dist', '.git', 'static'].includes(entry)) continue;
    const full = join(dir, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      const agentsMd = join(full, 'AGENTS.md');
      if (existsSync(agentsMd)) {
        const content = safeRead(agentsMd) ?? '';
        const title = content.match(/^#\s+(.+)/m)?.[1] ?? entry;
        const summary = content.match(/^#[^\n]*\n+([^\n#]{10,200})/m)?.[1]?.trim() ?? '';
        results.push({ dir: relative(ROOT, full), agentsMd: relative(ROOT, agentsMd), title, summary });
      }
      results.push(...scanDirectory(full, depth + 1));
    }
  }
  return results;
}

// ── load existing graph data ──────────────────────────────────────────────────

const nesGraph   = safeJson(join(DOCS_GRAPH, 'nes-glyph-architecture.json'));
const codemapMd  = safeRead(join(DOCS_GRAPH, 'codebase-map.md'));
const clusterSum = safeJson(join(DOCS_GRAPH, 'cluster-summaries.json'));
const hyperClusters = safeJson(join(DOCS_GRAPH, 'hypergraph-clusters.json'));

// ── git context ───────────────────────────────────────────────────────────────

const branch     = git('rev-parse --abbrev-ref HEAD');
const lastCommit = git('log -1 --format="%h %s"');
const recentLog  = git('log --oneline -8');
const changedFiles = git('diff --name-only HEAD~1 HEAD').split('\n').filter(Boolean).slice(0, 15);

// ── NES cluster summary ───────────────────────────────────────────────────────

const nesStats = nesGraph?.stats ?? {};
const nesNodes = nesGraph?.nodes ?? [];
const gpuClusters = [...new Set(
  nesNodes
    .filter(n => n.clusterSource === 'gpu-kmeans')
    .map(n => n.clusterKey)
)].slice(0, 20);

const tagFreq = {};
for (const n of nesNodes) {
  for (const t of (n.tags ?? [])) {
    tagFreq[t] = (tagFreq[t] ?? 0) + 1;
  }
}
const topTags = Object.entries(tagFreq).sort((a, b) => b[1] - a[1]).slice(0, 20);

// ── directory AGENTS.md scan ──────────────────────────────────────────────────

const agentDirs = scanDirectory(resolve(ROOT, 'src')).slice(0, 30);
const extraDirs = SCAN_DIR ? scanDirectory(SCAN_DIR).slice(0, 15) : [];

// ── active gaps (static check — no DB needed) ────────────────────────────────

const GAPS = [
  { id: 'gap_rel_001', title: 'relationship-extractor.ts source exists', check: () => existsSync(join(ROOT, 'src/lib/server/graph/relationship-extractor.ts')) },
  { id: 'gap_rel_002', title: 'code_relations in Drizzle schema', check: () => (safeRead(join(ROOT, 'src/lib/server/db/schema-postgres.ts')) ?? '').includes('code_relations') },
  { id: 'gap_rel_003', title: 'relation-extractor test exists', check: () => existsSync(join(ROOT, 'tests/relation-extractor.spec.ts')) },
  { id: 'gap_graph_001', title: 'extract-code-relations.mjs exists', check: () => existsSync(join(ROOT, 'scripts/wiki/extract-code-relations.mjs')) },
  { id: 'gap_graph_002', title: 'startup-plan.mjs exists', check: () => existsSync(join(ROOT, 'scripts/startup-plan.mjs')) },
  { id: 'gap_graph_003', title: 'code_relations migration SQL exists', check: () => existsSync(join(ROOT, 'drizzle/manual/20260506_code_relations.sql')) },
  { id: 'gap_mcp_001',  title: 'trace-mcp-server.ts exists', check: () => existsSync(join(ROOT, 'src/mcp/trace-mcp-server.ts')) },
  { id: 'gap_mcp_002',  title: 'graph.expand_neighborhood MCP tool', check: () => (safeRead(join(ROOT, 'src/mcp/trace-mcp-server.ts')) ?? '').includes('expand_neighborhood') },
  { id: 'gap_ace_001',  title: 'aceTopkKey shared constant', check: () => (safeRead(join(ROOT, 'src/lib/server/ace/retrieval-lanes.ts')) ?? '').includes('aceTopkKey') },
  { id: 'gap_ace_002',  title: 'multiLaneSearch wired to context-assembler', check: () => (safeRead(join(ROOT, 'src/lib/server/ace/context-assembler.ts')) ?? '').includes('multiLaneSearch') },
];

const gapResults = GAPS.map(g => {
  let status = 'UNKNOWN';
  try { status = g.check() ? 'PASS' : 'FAIL'; } catch { status = 'ERROR'; }
  return { ...g, status };
});

const openGaps  = gapResults.filter(g => g.status !== 'PASS');
const closedGaps = gapResults.filter(g => g.status === 'PASS');

// ── MLA / TurboQuant KV math (for current GPU: RTX 3060 Ti 8GB) ──────────────

const MLA_MATH = `
### KV Cache Budget — RTX 3060 Ti (8GB VRAM)

| Config | Formula | Per token/layer | 4K ctx 32 layers | Fits in 8GB? |
|--------|---------|----------------|-----------------|--------------|
| f16 standard (16 KV heads × 128) | 16×128×2×2B | 8192 B | ~1.0 GB | ✅ (barely) |
| q8_0 KV (TurboQuant baseline) | 8192 × 8/16 | 4096 B | ~512 MB | ✅ comfortable |
| turbo3 KV (3-bit PolarQuant+QJL) | 8192 × 3/16 | 1536 B | ~192 MB | ✅ large headroom |
| turbo3 + MLA-style compression | 512×2×3/16 B | 192 B | ~24 MB | ✅ extreme headroom |

> MLA (Multi-head Latent Attention, DeepSeek V3): compresses K+V from head_dim×num_kv_heads
> into a single latent vector of dim 512, then applies standard KV quant on top.
> Gemma4 does NOT implement MLA natively — turbo3 alone is sufficient for 8GB GPU.

**Verified dev command** (gemma4-rotorquant:latest + VLM, asymmetric, Flash Attention required):
\`\`\`bash
llama-server.exe -m gemma4-rotorquant:latest.gguf --mmproj mmproj-BF16.gguf -ctk turbo3 -ctv turbo4 -fa on -ngl 99 --port 8090 -c 65536
\`\`\`
VRAM estimate: 5.3GB model + 192MB KV + 200MB overhead ≈ **5.7GB** → 2.3GB free for batch

> ⚠️  Verify KV quant flags are available in your build: \`llama-server.exe --help | Select-String "kv|quant|cache|turbo|ctk|ctv"\`
> Paper: TurboQuant: Online Vector Quantization with Near-optimal Distortion Rate (arXiv 2504.19874)
`.trim();

// ── next actions ──────────────────────────────────────────────────────────────

const NEXT_ACTIONS = [
  { priority: 'P0', title: 'A1-A3: Add clusterContext to ACEContext + inject in context-assembler', detail: 'src/lib/server/ace/types.ts: add clusterContext?: ClusterContextPacket[] to ACEContext. context-assembler.ts: read qdrant_cluster_tags.json from latest run dir and populate ctx.clusterContext. Include in synthesisBlock for Gemma4. gap_rel_004.' },
  { priority: 'P0', title: 'B1: Add 3 MCP tools to trace-mcp-server.ts', detail: 'Add: (1) graph.expand_neighborhood — Neo4j IMPORTS neighbors for a file path; (2) clusters.get_summary_lenses — cluster context packet for a stableKey; (3) trace.validate_ace_hit — cross-check ACE chunk against code_relations. Port 8788 Streamable HTTP.' },
  { priority: 'P0', title: 'B2: Extend Gemma4 agent tool allowlist for new MCP tools', detail: 'In gemma4-agent.ts: add expand_neighborhood, cluster_lenses, validate_ace_hit to the read-only graph/topology allowlist. maxToolRounds=3 preserved.' },
  { priority: 'P1', title: 'C1: Add getGlyphContextForFiles() to glyph-atlas-builder.ts', detail: 'Pure read function: given file paths, return matching glyph tile clusters with section labels, top tags, and summaryLens. Used by the glyph_cluster lane in multi-lane-retrieval.ts.' },
  { priority: 'P1', title: 'C2: Add glyph_cluster lane 7 to multi-lane-retrieval.ts', detail: 'Lane reads cluster summaries from glyph-atlas-builder.ts. Weight 0.80 in RRF blend. Degrades gracefully if atlas unavailable. Exposes cluster_key + top_tags in synthesisBlock.' },
  { priority: 'P1', title: 'Run extract-code-relations + mirror to Neo4j', detail: 'Docker up → npm run relation:extract (writes 11,388 edges to code_relations). Then run with Neo4j enabled. Apply drizzle/manual/20260506_code_relations.sql if not yet done.' },
  { priority: 'P1', title: 'D: Chain build-codebase-relationships after relation:extract', detail: 'In extract-code-relations.mjs or package.json pipeline: after writing Postgres edges, call build-codebase-relationships.mjs to emit relationship_map.json + qdrant_cluster_tags.json + ingest.jsonl to memory/runs/<run_id>/. gap_rel_005.' },
  { priority: 'P2', title: 'P2-A: Vector lane in multi-lane-retrieval.ts (Qdrant codebase_chunks_768)', detail: 'hybridSearch on codebase_chunks_768 respecting skipVectorLane. Weight 0.75 in RRF blend. Degrade gracefully if Qdrant unavailable. Exposes tags + cluster_key in hits.' },
  { priority: 'P2', title: 'Wire ingest.jsonl to ACE KAG notes (gap_rel_006)', detail: 'context-assembler.ts: add KAG note source that reads latest memory/runs/<run_id>/ingest.jsonl and injects top cluster packets as ACEContext.kagNotes. Also update startup-plan.mjs to print top 5 clusters from ingest.' },
  { priority: 'P3', title: 'gap_synth_001: Replace llm_synthesis TRACE stub with real turboQuantChat call', detail: 'trace-subagent-orchestrator.ts: replace runAndPersistStub("llm_synthesis") with actual call. Read ctx.rankedEvidence cluster tags, build cluster-grouped prompt, call turboQuantChat, write to synthesis_memory_768 via synthesis-memory-archiver.ts.' },
];

// ── assemble plan markdown ────────────────────────────────────────────────────

const lines = [
  `# Startup Plan — ${RUN_ID}`,
  `> Generated by \`scripts/startup-plan.mjs\` on \`${new Date().toISOString()}\``,
  `> Branch: \`${branch}\` · Last commit: ${lastCommit}`,
  '',
  '---',
  '',
  '## Codebase Snapshot',
  '',
  `| Metric | Value |`,
  `|--------|-------|`,
  `| NES nodes | ${nesGraph?.stats?.fileCount ?? '—'} |`,
  `| GPU clusters | ${nesGraph?.stats?.clusterCountGpu ?? '—'} |`,
  `| Fallback clusters | ${nesGraph?.stats?.clusterCountFallback ?? '—'} |`,
  `| NES edges | ${nesGraph?.stats?.edgeCount ?? '—'} |`,
  `| Files w/ GPU cluster | ${nesGraph?.stats?.filesWithGpuCluster ?? '—'} |`,
  '',
  '### Top 10 Tags in Qdrant/NES cluster payload',
  '',
  topTags.slice(0, 10).map(([tag, count]) => `- \`${tag}\` (${count})`).join('\n'),
  '',
  '### Recent GPU Clusters (first 10)',
  '',
  gpuClusters.slice(0, 10).map(k => `- \`${k}\``).join('\n'),
  '',
  '---',
  '',
  '## Active Gaps',
  '',
  `**${closedGaps.length}/${GAPS.length} checks passing**`,
  '',
  gapResults.map(g => `- [${g.status === 'PASS' ? 'x' : ' '}] \`${g.id}\` — ${g.title} **${g.status}**`).join('\n'),
  '',
  '---',
  '',
  '## Next Actions (ordered by priority)',
  '',
  ...NEXT_ACTIONS.map(a => [
    `### ${a.priority}: ${a.title}`,
    '',
    a.detail,
    '',
  ].join('\n')),
  '---',
  '',
  '## MLA / TurboQuant KV Budget',
  '',
  MLA_MATH,
  '',
  '---',
  '',
  '## AGENTS.md Directory Context',
  '',
  agentDirs.length === 0 ? '_No AGENTS.md files found in src/_' :
    agentDirs.map(d => `### \`${d.dir}\`\n**${d.title}**${d.summary ? `\n${d.summary}` : ''}`).join('\n\n'),
  ...(extraDirs.length > 0 ? [
    '',
    '### Extra scan results',
    extraDirs.map(d => `- \`${d.dir}\` — ${d.title}`).join('\n'),
  ] : []),
  '',
  '---',
  '',
  '## Recent Commits',
  '',
  '```',
  recentLog,
  '```',
  '',
  '## Files Changed in Last Commit',
  '',
  changedFiles.map(f => `- \`${f}\``).join('\n') || '_no changes_',
  '',
  '---',
  '',
  `_Run ID: \`${RUN_ID}\`_`,
];

const planText = lines.join('\n');

// ── write artifact ────────────────────────────────────────────────────────────

mkdirSync(RUN_DIR, { recursive: true });
const planPath = resolve(RUN_DIR, 'plan.md');
writeFileSync(planPath, planText, 'utf-8');

if (PRINT) {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log(`║  Startup Plan — ${RUN_ID}  ║`);
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  console.log(`Branch   : ${branch}`);
  console.log(`Commit   : ${lastCommit}`);
  console.log(`NES      : ${nesStats.fileCount ?? '?'} files, ${nesStats.clusterCountGpu ?? '?'} GPU clusters`);
  console.log(`Gaps     : ${openGaps.length} open / ${GAPS.length} total`);
  if (openGaps.length > 0) {
    console.log('\nOpen gaps:');
    openGaps.forEach(g => console.log(`  ✗ ${g.id}: ${g.title}`));
  }
  console.log(`\nNext P0  : ${NEXT_ACTIONS[0].title}`);
  console.log(`\nPlan     : ${planPath}\n`);
} else {
  process.stdout.write(`[startup-plan] ${planPath}\n`);
}
