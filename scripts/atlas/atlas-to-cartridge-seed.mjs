#!/usr/bin/env node
/**
 * atlas-to-cartridge-seed.mjs
 *
 * Read-only adapter: copies Parent Atlas intelligence into CHR97 cartridge seed tiles.
 *
 * Guardrails (hard):
 *   - Does NOT write to cartridge runtime tables or Redis (unless --publish)
 *   - Does NOT read from case/evidence cartridge data
 *   - Does NOT mix legal/evidence context with codebase atlas
 *   - Output files are regeneratable; treat as build artifacts
 *   - Parent atlas remains independent; cartridge remains independent
 *
 * Inputs (all optional — skipped if missing):
 *   docs/atlas-index/codebase-atlas.json
 *   docs/atlas/feature-registry.json
 *   .tmp/atlas-feature-registry.json
 *   reports/hot-keyword-clusters.json
 *
 * Outputs:
 *   .tmp/atlas-cartridge-seeds.jsonl
 *   reports/atlas-cartridge-seed-report.md
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

const PUBLISH = process.argv.includes('--publish');
const DRY_RUN = process.argv.includes('--dry-run');

// ── Input paths ────────────────────────────────────────────────────────────
const INPUTS = {
  codesbaseAtlas: path.join(ROOT, 'sveltekit-frontend', 'docs', 'atlas-index', 'codebase-atlas.json'),
  featureRegistry: path.join(ROOT, 'docs', 'atlas', 'feature-registry.json'),
  featureRegistryTmp: path.join(ROOT, '.tmp', 'atlas-feature-registry.json'),
  hotKeywords: path.join(ROOT, 'reports', 'hot-keyword-clusters.json'),
};

// ── Output paths ───────────────────────────────────────────────────────────
const OUT_JSONL = path.join(ROOT, '.tmp', 'atlas-cartridge-seeds.jsonl');
const OUT_REPORT = path.join(ROOT, 'reports', 'atlas-cartridge-seed-report.md');

// ── Helpers ────────────────────────────────────────────────────────────────
function readJson(p, fallback = null) {
  try {
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
}

function seedHash(featureKey, sourceRef) {
  return crypto.createHash('sha1').update(`${featureKey}::${sourceRef}`).digest('hex').slice(0, 12);
}

function extractKeywords(text = '') {
  // Simple extraction: capitalised words, camelCase tokens, file extensions
  const tokens = text.match(/\b[A-Z][a-zA-Z0-9]+\b|\b\w+\.(ts|svelte|mjs|json|sql)\b/g) || [];
  return [...new Set(tokens)].slice(0, 12);
}

function extractRoutes(text = '') {
  return [...new Set((text.match(/\/api\/[\w/[\]-]+/g) || []).slice(0, 8))];
}

function extractTables(text = '') {
  return [...new Set((text.match(/\b[a-z][a-z_]{3,}\b/g) || [])
    .filter(t => /_(table|log|events|sessions|chunks|records|items|nodes|edges|cache|scores)$/.test(t))
    .slice(0, 8))];
}

function extractMcpTools(text = '') {
  return [...new Set((text.match(/\b(?:trace|kb|graph|topology|context|ops|kag|search)\.[a-z_]+/g) || []).slice(0, 6))];
}

// ── Load inputs ────────────────────────────────────────────────────────────
const codesbaseAtlas = readJson(INPUTS.codesbaseAtlas);
// Prefer the full registry; .tmp version is a small subset used for fast smoke checks
const featureRegistry = readJson(INPUTS.featureRegistry) || readJson(INPUTS.featureRegistryTmp);
const hotKeywords = readJson(INPUTS.hotKeywords);

const hotKeywordMap = {};
if (hotKeywords && Array.isArray(hotKeywords)) {
  for (const cluster of hotKeywords) {
    if (cluster.label && Array.isArray(cluster.keywords)) {
      hotKeywordMap[cluster.label] = cluster.keywords;
    }
  }
}

const seeds = [];
let skipped = 0;

// ── Source 1: feature-registry.json ──────────────────────────────────────
if (featureRegistry) {
  const entries = Array.isArray(featureRegistry) ? featureRegistry : Object.values(featureRegistry);
  for (const entry of entries) {
    const { featureKey, title, status, summary = '', sourceRefs = [], missing = [], nextQuery = '' } = entry;
    if (!featureKey) { skipped++; continue; }

    const combinedText = [title, summary, nextQuery, ...(missing || [])].join(' ');
    const primaryRef = (sourceRefs[0] || featureKey).toString();
    const hash = seedHash(featureKey, primaryRef);

    seeds.push({
      seed_id: `atlas:feat:${hash}`,
      source: 'parent_atlas',
      sourceRef: primaryRef,
      feature_label: title || featureKey,
      status: status || 'unknown',
      hot_keywords: extractKeywords(combinedText),
      dependencies: (missing || []).slice(0, 6),
      routes: extractRoutes(combinedText),
      mcp_tools: extractMcpTools(combinedText),
      db_tables: extractTables(combinedText),
      // Tags use slugified featureKey — never raw case/evidence runtime identifiers
      qdrant_tags: [`feature:${featureKey.replace(/[^a-z0-9_]/gi, '_').toLowerCase()}`, 'source:parent_atlas'],
      redis_hint_key: `ace:cartridge:seed:${hash}`,
      retrieval_mode: 'atlas_seed_for_chr97',
      risk_notes: status === 'missing' ? 'feature not yet implemented' : '',
      nextAction: nextQuery ? nextQuery.slice(0, 120) : '',
    });
  }
  console.log(`✅ feature-registry: ${seeds.length} seeds from ${entries.length} entries`);
} else {
  console.log('⏭️  feature-registry: not found, skipping');
}

const featureCount = seeds.length;

// ── Source 2: codebase-atlas.json ─────────────────────────────────────────
if (codesbaseAtlas) {
  // Atlas is an array of node objects keyed by various shapes — handle both
  const nodes = Array.isArray(codesbaseAtlas) ? codesbaseAtlas : Object.values(codesbaseAtlas);
  let atlasAdded = 0;
  for (const node of nodes) {
    const label = node.label || node.name || node.id || node.featureKey;
    if (!label) { skipped++; continue; }

    const text = [
      label,
      node.description || '',
      node.summary || '',
      node.filePath || node.path || '',
      (node.tags || []).join(' '),
    ].join(' ');

    const ref = node.filePath || node.path || node.id || label;
    const hash = seedHash(`atlas:node:${label}`, ref);

    seeds.push({
      seed_id: `atlas:node:${hash}`,
      source: 'parent_atlas',
      sourceRef: ref,
      feature_label: label,
      status: node.status || 'indexed',
      hot_keywords: [...new Set([...(node.tags || []), ...extractKeywords(text)])].slice(0, 12),
      dependencies: (node.imports || node.dependencies || []).slice(0, 6),
      routes: extractRoutes(text),
      mcp_tools: extractMcpTools(text),
      db_tables: extractTables(text),
      qdrant_tags: [`cluster:${node.cluster || 'unknown'}`, 'source:codebase_atlas'],
      redis_hint_key: `ace:cartridge:seed:${hash}`,
      retrieval_mode: 'atlas_seed_for_chr97',
      risk_notes: '',
      nextAction: '',
    });
    atlasAdded++;
    // Cap to avoid giant seed files from large atlas
    if (atlasAdded >= 2000) break;
  }
  console.log(`✅ codebase-atlas: ${atlasAdded} seeds from ${nodes.length} nodes`);
} else {
  console.log('⏭️  codebase-atlas.json: not found, skipping');
}

console.log(`📦 Total seeds: ${seeds.length} (skipped ${skipped})`);

// ── Write outputs ──────────────────────────────────────────────────────────
if (!DRY_RUN) {
  fs.mkdirSync(path.dirname(OUT_JSONL), { recursive: true });
  fs.mkdirSync(path.dirname(OUT_REPORT), { recursive: true });

  const jsonl = seeds.map(s => JSON.stringify(s)).join('\n');
  fs.writeFileSync(OUT_JSONL, jsonl, 'utf8');
  console.log(`✅ wrote ${OUT_JSONL}`);

  const report = [
    '# Atlas → CHR97 Cartridge Seed Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Total seeds: ${seeds.length}`,
    `  - From feature-registry: ${featureCount}`,
    `  - From codebase-atlas: ${seeds.length - featureCount}`,
    `  - Skipped (no key): ${skipped}`,
    '',
    '## Guardrails',
    '- Seeds are READ-ONLY adapter output — regenerate freely',
    '- Cartridge runtime (case/evidence) data is NOT modified',
    '- Legal/evidence context is NOT mixed with codebase atlas',
    '- Redis publish only via --publish flag',
    '',
    '## Output',
    `- JSONL: \`.tmp/atlas-cartridge-seeds.jsonl\``,
    `- Redis: NOT published (use --publish to enable)`,
    '',
    '## Sample Seeds',
    ...seeds.slice(0, 5).map(s =>
      `### ${s.feature_label}\n- seed_id: \`${s.seed_id}\`\n- sourceRef: \`${s.sourceRef}\`\n- keywords: ${s.hot_keywords.join(', ')}\n- redis_hint: \`${s.redis_hint_key}\`\n`
    ),
  ].join('\n');

  fs.writeFileSync(OUT_REPORT, report, 'utf8');
  console.log(`✅ wrote ${OUT_REPORT}`);
} else {
  console.log(`🔎 dry-run: would write ${seeds.length} seeds to ${OUT_JSONL}`);
}

// ── Optional Redis publish ─────────────────────────────────────────────────
if (PUBLISH && !DRY_RUN) {
  try {
    const { createClient } = await import('redis');
    const client = createClient({ socket: { host: '127.0.0.1', port: 6379 } });
    client.on('error', () => {});
    await client.connect();

    let published = 0;
    for (const seed of seeds) {
      await client.set(seed.redis_hint_key, JSON.stringify(seed), { EX: 3600 });
      published++;
    }
    await client.quit();
    console.log(`✅ published ${published} seeds to Redis (TTL 1h)`);
  } catch (err) {
    console.warn(`⚠️  Redis publish failed: ${err.message} — seeds still written to JSONL`);
  }
} else if (PUBLISH && DRY_RUN) {
  console.log('🔎 dry-run: --publish ignored in dry-run mode');
}

console.log('done.');
