#!/usr/bin/env node
/**
 * feature-labeling.mjs — Phase 11G
 * sourceRef → domain + feature_label + owner_area
 *
 * Reads .opencode/ace-packets/index.ndjson + merged cards,
 * emits .tmp/feature-labels.ndjson + caches in Redis.
 */

import fs from 'fs/promises';
import { createReadStream, existsSync } from 'fs';
import readline from 'readline';
import path from 'path';
import crypto from 'crypto';
import { normalizeSharedLabel, sharedLabelRegistrySignature } from '../atlas/shared-label-registry.mjs';

const ROOT     = process.cwd();
const DRY_RUN  = process.argv.includes('--dry-run');
const OUT_FILE = path.join(ROOT, '.tmp', 'feature-labels.ndjson');

const DOMAIN_MAP = [
  { domain: 'Legal',       patterns: [/evidence|case|timeline|citation|statute|forensic|hearing|legal/i] },
  { domain: 'Retrieval',   patterns: [/qdrant|vector|embed|search|rerank|rank|retrieval|turbovec/i] },
  { domain: 'Agent',       patterns: [/agent|opencode|prompt|recommend|task|ace|context|packet/i] },
  { domain: 'Infra',       patterns: [/redis|rabbitmq|postgres|docker|startup|health|cache|valkey/i] },
  { domain: 'UI',          patterns: [/svelte|component|route|page|layout|dialog|modal|button/i] },
  { domain: 'Performance', patterns: [/simdjson|libtorch|cuda|bench|simd|native|gpu|wasm/i] },
  { domain: 'Graph',       patterns: [/neo4j|graph|som|karpathy|cluster|topology|hypergraph/i] },
];

const FEATURE_MAP = [
  { label: 'evidence-upload',    patterns: [/evidence.*upload|upload.*evidence/i] },
  { label: 'case-timeline',      patterns: [/case.*timeline|timeline.*case/i] },
  { label: 'ace-packet',         patterns: [/ace.packet|compress.card|rank.card/i] },
  { label: 'qdrant-search',      patterns: [/qdrant|vector.search|embed.search/i] },
  { label: 'redis-cache',        patterns: [/redis|valkey|cache.*ttl|ttl.*cache/i] },
  { label: 'bifrost-cache',      patterns: [/bifrost|semantic.cache|l2.cache/i] },
  { label: 'gemma4-inference',   patterns: [/gemma4|llama.server|turboquant|inference/i] },
  { label: 'neo4j-graph',        patterns: [/neo4j|graph.edge|cypher|pagerank/i] },
  { label: 'som-topology',       patterns: [/som|self.organiz|topology|bmu/i] },
  { label: 'auth-session',       patterns: [/lucia|session|login|register|auth/i] },
  { label: 'rabbitmq-queue',     patterns: [/rabbitmq|amqp|queue|exchange/i] },
  { label: 'svelte-component',   patterns: [/\.svelte|svelte.component|runes/i] },
  { label: 'api-route',          patterns: [/\+server\.ts|api\/|route.*handler/i] },
  { label: 'drizzle-schema',     patterns: [/drizzle|schema.postgres|migration|sql/i] },
  { label: 'turbovec-rerank',    patterns: [/turbovec|rerank|cosine.blend/i] },
  { label: 'feature-labeling',   patterns: [/feature.label|domain.topology|graphify/i] },
];

function assignDomain(text) {
  const t = (text || '').toLowerCase();
  for (const { domain, patterns } of DOMAIN_MAP) {
    if (patterns.some(p => p.test(t))) return domain;
  }
  return 'General';
}

function assignFeatureLabel(text) {
  const t = (text || '').toLowerCase();
  for (const { label, patterns } of FEATURE_MAP) {
    if (patterns.some(p => p.test(t))) return label;
  }
  return 'general';
}

function assignSharedLabel(featureLabel, domain, ownerArea, src) {
  return normalizeSharedLabel([featureLabel, domain, ownerArea, src].filter(Boolean).join(' '));
}

function ownerArea(src) {
  const s = (src || '').replace(/\\/g, '/');
  if (/^src\/routes\/api/.test(s))     return 'api';
  if (/^src\/routes/.test(s))          return 'ui';
  if (/^src\/lib\/server/.test(s))     return 'server';
  if (/^src\/lib/.test(s))             return 'lib';
  if (/^scripts\//.test(s))            return 'scripts';
  if (/^docs\//.test(s))               return 'docs';
  if (/^sveltekit-frontend\/src/.test(s)) return 'frontend';
  return 'other';
}

async function readNdjson(filePath) {
  const rows = [];
  if (!existsSync(filePath)) return rows;
  const rl = readline.createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); } catch { /* skip */ }
  }
  return rows;
}

async function main() {
  console.log('\n── Feature Labeling (Phase 11G) ──────────────────────────');

  // Collect sourceRefs from ace-packet + merged cards
  const sourceRefs = new Set();

  const packet = JSON.parse(
    await fs.readFile(path.join(ROOT, '.opencode', 'ace-packet.json'), 'utf8').catch(() => '{}')
  );
  for (const c of (packet.cards || [])) {
    if (c.sourceRef) sourceRefs.add(c.sourceRef);
  }

  const mergedCards = await readNdjson(path.join(ROOT, '.opencode', 'cards', 'summaries.merged.jsonl'));
  for (const c of mergedCards) {
    if (c.sourceRef) sourceRefs.add(c.sourceRef);
    if (c.source_path) sourceRefs.add(c.source_path);
  }

  console.log(`  sourceRefs: ${sourceRefs.size}`);

  const createdAt = new Date().toISOString();
  const labels = [];
  for (const src of sourceRefs) {
    const combined = src;
    const feature_label = assignFeatureLabel(combined);
    const domain = assignDomain(combined);
    const owner_area = ownerArea(src);
    const shared_label = assignSharedLabel(feature_label, domain, owner_area, src);
    labels.push({
      sourceRef:     src,
      domain,
      feature_label,
      shared_label,
      owner_area,
      label_hash:    crypto.createHash('sha256').update(src).digest('hex').slice(0, 16),
      shared_label_sig: sharedLabelRegistrySignature(),
      createdAt,
    });
  }

  // Sort by domain then feature_label
  labels.sort((a, b) => a.domain.localeCompare(b.domain) || a.feature_label.localeCompare(b.feature_label));

  // Domain summary
  const domainCounts = {};
  for (const l of labels) domainCounts[l.domain] = (domainCounts[l.domain] || 0) + 1;
  console.log('  domain counts:');
  for (const [d, n] of Object.entries(domainCounts).sort((a,b) => b[1]-a[1])) {
    console.log(`    ${d.padEnd(14)}: ${n}`);
  }

  if (!DRY_RUN) {
    await fs.mkdir(path.join(ROOT, '.tmp'), { recursive: true });
    await fs.writeFile(OUT_FILE, labels.map(l => JSON.stringify(l)).join('\n') + '\n', 'utf8');
    console.log(`\n  ✅ wrote ${OUT_FILE} (${labels.length} labels)`);
  } else {
    console.log(`\n  dry-run: would write ${labels.length} labels`);
  }

  console.log('──────────────────────────────────────────────────────────\n');
}

main().catch(e => { console.error(e); process.exit(1); });
