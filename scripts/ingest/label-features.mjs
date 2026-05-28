#!/usr/bin/env node
/**
 * label-features.mjs  —  Pipeline Step 4: Feature Labeling
 *
 * Reads .tmp/retrieval-ranking-report.json (output of rerank-cards.mjs)
 * and classifies every unique sourceRef into:
 *   domain       — top-level product area (e.g. "Context Engineering", "Infrastructure")
 *   featureLabel — human-readable feature name (e.g. "ACE Packet Cache", "Karpathy Blend")
 *   ownerArea    — directory prefix / team area (e.g. "scripts/ingest", "src/lib/server")
 *   priority     — "p1" | "p2" | "p3" derived from error/todo signals
 *
 * Outputs:
 *   .tmp/feature-labels.json     — { sourceRef → { domain, featureLabel, ownerArea, priority } }
 *   .tmp/domain-topology.json    — { domain → { count, topSources, avgScore } }
 *
 * Also writes labels back to Redis for intent cache keying:
 *   ace:intent:{intentHash}:featureLabels  → JSON array of unique featureLabels
 *
 * Usage:
 *   node scripts/ingest/label-features.mjs
 *   node scripts/ingest/label-features.mjs --dry-run
 *   node scripts/ingest/label-features.mjs --query "ACE context retrieval"
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import Redis from 'ioredis';

const ROOT      = process.cwd();
const TMP_DIR   = path.join(ROOT, '.tmp');
const REPORT    = path.join(TMP_DIR, 'retrieval-ranking-report.json');
const OUT_LABELS = path.join(TMP_DIR, 'feature-labels.json');
const OUT_TOPO  = path.join(TMP_DIR, 'domain-topology.json');
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

const args    = process.argv.slice(2);
const DRY     = args.includes('--dry-run');
const queryArg = args.filter(a => !a.startsWith('--')).join(' ');

// ── Domain classification rules ───────────────────────────────────────────────
// Order matters — first match wins. Patterns match the normalized (forward-slash) path.
const DOMAIN_RULES = [
  // Context Engineering / ACE — ingest pipeline scripts + atlas seeds
  { domain: 'Context Engineering', re: /ace.packet|startup.context|patch.card|atlas.seed|ace.context|compress.card|rank.card|rerank|cache.ace|label.feat|scripts\/ingest|scripts\/atlas|scripts\/opencode|scripts\/startup/i },
  // Retrieval
  { domain: 'Retrieval',           re: /qdrant|turbovec|graphify|vector|embedding|retrieval.pass|embed.card/i },
  // Agent Workflow / OpenCode
  { domain: 'Agent Workflow',      re: /opencode|smoke.test|todo.track|recommend|agent.worker|ensure.nats|langgraph|scripts\/agent/i },
  // GPU / Performance
  { domain: 'GPU & Performance',   re: /simdjson|messagepack|cuda|libtorch|bench|turboquant|karpathy|simd.bridge|tensorrt/i },
  // Legal Workspace
  { domain: 'Legal Workspace',     re: /evidence|case.summar|timeline|legal.doc|forensic|statute|citation|rag.pipeline|legal.chunker/i },
  // Infrastructure / Services
  { domain: 'Infrastructure',      re: /rabbitmq|docker|startup|health.check|nats|bifrost|seaweed|redis.ts$|redis\/|go.microservice/i },
  // Frontend / UI
  { domain: 'Frontend',            re: /\.svelte$|routes\/(app)|src\/routes|src\/lib\/components|src\/lib\/stores/i },
  // DB / Schema
  { domain: 'Database',            re: /drizzle|schema.postgres|migration|db\/client|pgvector|pg.core/i },
  // Auth / Security
  { domain: 'Auth & Security',     re: /auth|session|lucia|password|jwt|oauth|locals\.user/i },
  // Session notes / todo text files (dated .txt files in root or docs/)
  { domain: 'Session Notes',       re: /\d{2,3}_\d{2,4}.*\.txt$|todo.*\.txt$|session.*\.txt$|\.txt$/i },
  // Architecture docs
  { domain: 'Architecture Docs',   re: /docs\/architecture|docs\/atlas|docs\/codebase.atlas|docs\/opencode|docs\/karpathy/i },
  // Audit / reports
  { domain: 'Audit & Reports',     re: /docs\/audit|docs\/reports|docs\/status|docs\/security|docs\/legacy|PRODUCTION_AUDIT|AUDIT_MANIFEST|audit.summary|AUDIT_COMPILATION|COMPREHENSIVE_AUDIT|CACHE_WARMUP|CACHE_MONITORING|READINESS_CHECKLIST/i },
  // Operator / deployment docs
  { domain: 'Operator Docs',       re: /docs\/operator|DEPLOYMENT|RUNBOOK|HYPERRAG_INTEGRATION|CODEBASE_MAP|CODEBASE_DIRECTORY|CODEBASE_INDEX/i },
  // GitHub agents / CI
  { domain: 'Agent Config',        re: /\.github\/agents|\.github\/workflows|agent\.md$/i },
  // Claude memory / instructions
  { domain: 'Claude Memory',       re: /claude\.md$|claude.mem\/|\.claude\/|CLAUDE\.md|claude-mem\//i },
  // AGENTS.md / master docs
  { domain: 'Docs & Memory',       re: /AGENTS\.md|master_agents|obsidian|docs\/research|docs\/graph|memory\//i },
  // Catch-all: any remaining docs/ files
  { domain: 'Project Docs',        re: /docs\/|deeds_labs\/docs\/|\.md$/i },
  // Scripts / Tooling (catch-all for scripts not matched above)
  { domain: 'Scripts & Tooling',   re: /scripts\/|\.mjs$|\.cjs$|tsconfig|vite\.config|unocss|package\.json/i },
];

// ── Feature label rules (more specific than domain) ───────────────────────────
const FEATURE_RULES = [
  { label: 'ACE Packet Cache',     re: /cache.ace.packet|ace.packet|ace:packet/i },
  { label: 'ACE Compression',      re: /compress.card|token.budget|char.budget/i },
  { label: 'Card Ranking',         re: /rank.card|ranking.report|phase.11d/i },
  { label: 'TurboVec Rerank',      re: /rerank.card|turbovec|phase.10b|rerank.diff/i },
  { label: 'Feature Labeling',     re: /label.feat|feature.label|domain.topo/i },
  { label: 'Card Embedding',       re: /embed.card|pseudoembed|embedding.cache/i },
  { label: 'Card Ingestion',       re: /split.card|ingest|run.pipeline/i },
  { label: 'Atlas Seed',           re: /atlas.seed|atlas.card|generate.ace.packet/i },
  { label: 'Karpathy Blend',       re: /karpathy|gpu.karpathy|authority.blend|pagerank/i },
  { label: 'Qdrant Search',        re: /qdrant|vector.search|codebase.chunks/i },
  { label: 'Redis Cache',          re: /redis|valkey|ioredis|cache.policy/i },
  { label: 'NATS / LangGraph',     re: /nats|langgraph|agent.worker|ensure.nats/i },
  { label: 'TurboQuant Server',    re: /turboquant|llama.server|llama-server/i },
  { label: 'Bifrost Semantic',     re: /bifrost|semantic.cache|l2.cache/i },
  { label: 'Evidence Pipeline',    re: /evidence|upload|ocr|chunker|legal.chunker/i },
  { label: 'RAG Pipeline',         re: /rag.pipeline|rag.session|context.assembler/i },
  { label: 'Hypergraph',           re: /hypergraph|hyperedge|som.topology/i },
  { label: 'Neo4j Graph',          re: /neo4j|cypher|graph.edge|similar.topology/i },
  { label: 'Drizzle Schema',       re: /schema.postgres|drizzle|migration/i },
  { label: 'Auth System',          re: /lucia|session|auth|password/i },
  { label: 'SvelteKit Route',      re: /\.svelte$|routes\/(app)|page\.server/i },
  { label: 'Docker Services',      re: /docker.compose|docker.desktop|container/i },
  { label: 'Claude Instructions',  re: /claude\.md$|claude.mem\/|\.claude\//i },
  { label: 'AGENTS.md Index',      re: /AGENTS\.md/i },
  { label: 'Architecture Docs',    re: /docs\/architecture|docs\/atlas|docs\/karpathy/i },
  { label: 'Session Notes',        re: /\d{2,3}_\d{2,4}.*\.txt$|session.*summary|todo.*\.txt$/i },
  { label: 'Audit Reports',        re: /docs\/audit|docs\/report|PRODUCTION_AUDIT|audit.summary/i },
  { label: 'Docs & Memory',        re: /memory\/|docs\//i },
];

// ── Priority from card signals ────────────────────────────────────────────────
function derivePriority(entry) {
  const text = ((entry.title || '') + ' ' + (entry.summary || '')).toLowerCase();
  if (/\bp1\b|critical|blocking|failed|broken/.test(text)) return 'p1';
  if (/\bp2\b|error|todo|fixme|wip|high.priority/.test(text)) return 'p2';
  return 'p3';
}

function classifySource(src) {
  const s = (src || '').replace(/\\/g, '/');
  const fullText = s.toLowerCase();

  const domain = DOMAIN_RULES.find(r => r.re.test(s))?.domain ?? 'General';
  const featureLabel = FEATURE_RULES.find(r => r.re.test(s))?.label ?? 'Uncategorized';

  // ownerArea: first 2 path segments
  const parts = s.split('/').filter(Boolean);
  const ownerArea = parts.slice(0, 2).join('/') || 'root';

  return { domain, featureLabel, ownerArea };
}

function intentHash(query) {
  return crypto.createHash('sha1').update((query || '').toLowerCase().trim()).digest('hex').slice(0, 16);
}

async function connectRedis() {
  const redis = new Redis(REDIS_URL, {
    lazyConnect: true, maxRetriesPerRequest: 1,
    enableOfflineQueue: false, retryStrategy: () => null,
  });
  redis.on('error', () => {});
  try { await redis.connect(); await redis.ping(); return redis; } catch { return null; }
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n── Label Features ────────────────────────────────────────');

  let report;
  try {
    report = JSON.parse(await fs.readFile(REPORT, 'utf8'));
  } catch {
    console.error(`❌ ${REPORT} not found — run rerank-cards.mjs first`);
    process.exit(1);
  }

  const query = queryArg || report.query || 'ACE context retrieval';
  const ranked = report.ranked || [];
  console.log(`  query   : "${query}"`);
  console.log(`  entries : ${ranked.length}`);

  // Classify every unique sourceRef
  const labels = {};   // sourceRef → classification
  const seen = new Set();

  for (const entry of ranked) {
    const src = entry.sourceRef || entry.source || entry.id || '';
    if (!src || seen.has(src)) continue;
    seen.add(src);
    const { domain, featureLabel, ownerArea } = classifySource(src);
    const priority = derivePriority(entry);
    labels[src] = { domain, featureLabel, ownerArea, priority, score: entry.rerankScore ?? entry.score ?? 0 };
  }

  console.log(`  unique sources : ${Object.keys(labels).length}`);

  // Build domain topology
  const domainMap = {};
  for (const [src, info] of Object.entries(labels)) {
    if (!domainMap[info.domain]) {
      domainMap[info.domain] = { count: 0, topSources: [], scoreSum: 0, featureLabels: new Set() };
    }
    const dm = domainMap[info.domain];
    dm.count++;
    dm.scoreSum += Number(info.score) || 0;
    dm.featureLabels.add(info.featureLabel);
    if (dm.topSources.length < 5) dm.topSources.push(src);
  }

  const topology = {};
  for (const [domain, dm] of Object.entries(domainMap)) {
    topology[domain] = {
      count:         dm.count,
      avgScore:      dm.count ? Math.round(dm.scoreSum / dm.count * 10000) / 10000 : 0,
      topSources:    dm.topSources,
      featureLabels: [...dm.featureLabels],
    };
  }

  // Sort domains by count desc
  const sortedDomains = Object.entries(topology).sort((a, b) => b[1].count - a[1].count);
  console.log(`  domains : ${sortedDomains.length}`);
  console.log('\n  Domain breakdown:');
  for (const [domain, info] of sortedDomains.slice(0, 8)) {
    console.log(`    ${String(info.count).padStart(3)}  ${domain}  (avg score: ${info.avgScore.toFixed(4)})`);
  }

  // Unique feature labels for Redis intent key
  const allFeatureLabels = [...new Set(Object.values(labels).map(l => l.featureLabel))];
  console.log(`  feature labels: ${allFeatureLabels.length}`);

  if (DRY) {
    console.log(`\n  dry-run: would write ${Object.keys(labels).length} labels to ${OUT_LABELS}`);
    console.log(`  dry-run: would write domain topology to ${OUT_TOPO}`);
    console.log('──────────────────────────────────────────────────────────\n');
    return;
  }

  // Write outputs
  await fs.mkdir(TMP_DIR, { recursive: true });
  await fs.writeFile(OUT_LABELS, JSON.stringify(labels, null, 2), 'utf8');
  await fs.writeFile(OUT_TOPO,   JSON.stringify(topology, null, 2), 'utf8');
  console.log(`\n  ✅ wrote ${OUT_LABELS}`);
  console.log(`  ✅ wrote ${OUT_TOPO}`);

  // Push feature labels to Redis intent cache
  const redis = await connectRedis();
  if (redis) {
    const ih = intentHash(query);
    const ttl = 86400; // 1 day — matches cache-ace-packet.mjs default
    await redis.setex(`ace:intent:${ih}:featureLabels`, ttl, JSON.stringify(allFeatureLabels));
    // Also write domain topology summary
    const topoSummary = sortedDomains.map(([d, info]) => ({ domain: d, count: info.count, avgScore: info.avgScore }));
    await redis.setex(`ace:intent:${ih}:domainTopology`, ttl, JSON.stringify(topoSummary));
    console.log(`  ✅ ace:intent:${ih}:featureLabels SET (${allFeatureLabels.length} labels, TTL ${ttl}s)`);
    console.log(`  ✅ ace:intent:${ih}:domainTopology SET`);
    redis.disconnect();
  } else {
    console.log(`  ⚠️  Redis unavailable — skipping intent cache write`);
  }

  console.log('──────────────────────────────────────────────────────────\n');
}

main().catch(e => { console.error(e); process.exit(1); });
