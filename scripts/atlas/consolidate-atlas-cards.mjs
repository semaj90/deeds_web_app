#!/usr/bin/env node
/**
 * consolidate-atlas-cards.mjs
 *
 * Reads all .tmp/atlas-cards/*.json zone cards (produced by subagent fleet)
 * and consolidates into:
 *  - .tmp/parent-atlas-index.json (single NES-arch swappable card)
 *  - AGENTS.md temporal append (timestamped, no deletions)
 *  - CouchDB persistence (one doc per zone + one parent index doc)
 *
 * Designed for NES CHR-ROM-style swappable LoRA adapter cards:
 *  - Each zone card is ~< 8KB (fits in CHR97 bank)
 *  - Parent atlas is the OAM-equivalent index pointing into card banks
 *  - Karpathy GPU kernel-to-token mapping can swap LoRA adapters per zone
 */

import { readFileSync, writeFileSync, readdirSync, appendFileSync, existsSync } from 'fs';
import path from 'path';
import http from 'http';

const CARDS_DIR = '.tmp/atlas-cards';
const PARENT_INDEX = '.tmp/parent-atlas-index.json';
const AGENTS_MD = 'AGENTS.md';

const COUCHDB_URL = process.env.COUCHDB_URL || 'http://admin:deeds123@localhost:5984';
const DB_NAME = 'codebase_graph';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');

function couchRequest(method, dbPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(COUCHDB_URL + dbPath);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      auth: `${url.username}:${url.password}`,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body) {
      const payload = JSON.stringify(body);
      opts.headers['Content-Length'] = Buffer.byteLength(payload);
    }
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null }); }
        catch (e) { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('🚀 Temporal Atlas Card Consolidator');
  console.log('NES CHR-ROM swappable LoRA adapter index');
  console.log();

  // 1. Load all zone cards
  if (!existsSync(CARDS_DIR)) {
    console.error(`ERROR: ${CARDS_DIR} not found. Run subagent fleet first.`);
    process.exit(1);
  }

  const cardFiles = readdirSync(CARDS_DIR).filter(f => f.endsWith('.json'));
  console.log(`[1/4] Loading ${cardFiles.length} zone cards...`);

  const zones = {};
  let totalSize = 0;
  for (const file of cardFiles) {
    const filePath = path.join(CARDS_DIR, file);
    const content = readFileSync(filePath, 'utf-8');
    const card = JSON.parse(content);
    const zoneName = card.zone || path.basename(file, '.json');
    zones[zoneName] = card;
    totalSize += content.length;
    console.log(`  ✓ ${zoneName} (${(content.length / 1024).toFixed(1)} KB)`);
  }
  console.log(`  Total: ${(totalSize / 1024).toFixed(1)} KB across ${cardFiles.length} cards`);

  // 2. Build parent atlas index (NES-arch OAM equivalent)
  console.log('[2/4] Building parent atlas index...');
  const timestamp = new Date().toISOString();
  const parent = {
    _id: `parent-atlas-${timestamp.replace(/[:.]/g, '-')}`,
    type: 'parent_atlas_index',
    timestamp,
    nes_arch: {
      pattern: 'CHR-ROM swappable cards + LoRA adapter banks',
      card_count: cardFiles.length,
      total_size_kb: (totalSize / 1024).toFixed(1),
      avg_card_kb: (totalSize / cardFiles.length / 1024).toFixed(1),
    },
    zones: {},
    cross_zone_links: [],
    application_synthesis: {
      name: 'Legal AI Platform — Deeds Web App',
      purpose: 'Legal evidence retrieval, RAG-grounded chat, case management, GRPO-trained Gemma4 for legal reasoning',
      core_features: [
        'Evidence ingestion (PDF/OCR/audio/video → embeddings)',
        'RAG pipeline (Qdrant 768-dim + Postgres pgvector)',
        'Case management (cases + evidence + persons-of-interest)',
        'Legal corpus search (statutes + citations + precedents)',
        'AI chat (Gemma4 + tool calling via FastMCP)',
        'Forensic analysis (entity extraction + PII detection)',
        '3D reconstruction (TimelineEvent → ComfyUI + Blender + WebGPU)',
      ],
      tech_pillars: ['SvelteKit 2 + Svelte 5 runes', 'Drizzle ORM 0.44 + PG17 + pgvector 0.8.1', 'Qdrant + Bifrost + Redis L1/L2 cache', 'Neo4j topology + CouchDB persistence', 'Local Gemma4 via Ollama + llama-server'],
    },
    improvement_themes: [],
  };

  // Index each zone with metadata
  for (const [zoneName, card] of Object.entries(zones)) {
    parent.zones[zoneName] = {
      purpose: card.purpose || 'unknown',
      improvements_count: (card.improvement_opportunities || []).length,
      card_path: path.join(CARDS_DIR, `${zoneName}.json`),
      bank_offset: Object.keys(parent.zones).length, // NES CHR-ROM bank index
    };
  }

  // Aggregate improvements across all zones
  for (const [zoneName, card] of Object.entries(zones)) {
    for (const improvement of (card.improvement_opportunities || [])) {
      parent.improvement_themes.push({ zone: zoneName, recommendation: improvement });
    }
  }

  // Cross-zone links (heuristic: consumer references between zones)
  parent.cross_zone_links = [
    { from: 'opencode', to: 'scripts', relationship: 'cards consumed by atlas pipeline' },
    { from: 'scripts', to: 'sveltekit-frontend', relationship: 'extractors scan src/' },
    { from: 'sveltekit-frontend', to: 'drizzle', relationship: 'app uses ORM schemas' },
    { from: 'sveltekit-frontend', to: 'models', relationship: 'app consumes local LLM endpoints' },
    { from: 'infrastructure', to: 'sveltekit-frontend', relationship: 'app deployed via docker compose' },
    { from: 'models', to: 'services-simd-bridge', relationship: 'GPU bridges accelerate inference' },
    { from: 'memory-docs', to: 'opencode', relationship: 'AGENTS.md feeds ACE/KAG cards' },
    { from: 'tests-audits', to: 'sveltekit-frontend', relationship: 'tests cover routes + components' },
  ];

  writeFileSync(PARENT_INDEX, JSON.stringify(parent, null, 2));
  console.log(`  ✓ ${PARENT_INDEX} (${cardFiles.length} zones, ${parent.improvement_themes.length} improvements)`);

  // 3. Temporal append to AGENTS.md
  console.log('[3/4] Temporal append to AGENTS.md...');
  const agentsBlock = `

---

## [${timestamp}] Parent Atlas Index — ${cardFiles.length} Zone Cards

**Pattern**: NES CHR-ROM swappable cards + LoRA adapter banks
**Total**: ${(totalSize / 1024).toFixed(1)} KB across ${cardFiles.length} zones
**Avg card size**: ${(totalSize / cardFiles.length / 1024).toFixed(1)} KB

### Zones Indexed
${Object.entries(zones).map(([name, card]) => `- **${name}** (bank ${parent.zones[name].bank_offset}): ${card.purpose || 'no purpose set'}`).join('\n')}

### Application Synthesis
${parent.application_synthesis.purpose}

**Core features**:
${parent.application_synthesis.core_features.map(f => `- ${f}`).join('\n')}

### Cross-Zone Links
${parent.cross_zone_links.map(l => `- ${l.from} → ${l.to}: ${l.relationship}`).join('\n')}

### Top Improvement Themes (${parent.improvement_themes.length} total)
${parent.improvement_themes.slice(0, 10).map(t => `- **${t.zone}**: ${t.recommendation}`).join('\n')}

**Files written**:
- Parent index: \`${PARENT_INDEX}\`
- Zone cards: \`${CARDS_DIR}/*.json\` (${cardFiles.length} files)
${APPLY ? `- CouchDB: \`${DB_NAME}/${parent._id}\`` : '- CouchDB: (dry-run, use --apply)'}
`;

  appendFileSync(AGENTS_MD, agentsBlock);
  console.log(`  ✓ AGENTS.md appended (${agentsBlock.length} chars)`);

  // 4. Persist to CouchDB
  console.log('[4/4] Persisting to CouchDB...');
  if (APPLY) {
    // Ensure DB exists
    const dbCheck = await couchRequest('GET', `/${DB_NAME}`);
    if (dbCheck.status === 404) {
      await couchRequest('PUT', `/${DB_NAME}`);
    }

    // Push parent
    const parentResult = await couchRequest('POST', `/${DB_NAME}`, parent);
    if (parentResult.status >= 200 && parentResult.status < 300) {
      console.log(`  ✓ Parent: ${DB_NAME}/${parentResult.data.id}`);
    } else {
      console.log(`  ⚠ Parent push failed: ${parentResult.status}`, parentResult.data);
    }

    // Push individual zone cards
    let pushedZones = 0;
    for (const [zoneName, card] of Object.entries(zones)) {
      const zoneDoc = {
        _id: `zone-${zoneName}-${timestamp.replace(/[:.]/g, '-')}`,
        type: 'atlas_zone_card',
        zone: zoneName,
        parent_atlas: parent._id,
        timestamp,
        ...card,
      };
      const zoneResult = await couchRequest('POST', `/${DB_NAME}`, zoneDoc);
      if (zoneResult.status >= 200 && zoneResult.status < 300) pushedZones++;
    }
    console.log(`  ✓ ${pushedZones}/${cardFiles.length} zone cards persisted`);
  } else {
    console.log('  [DRY-RUN] Use --apply to push to CouchDB');
  }

  console.log();
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Temporal Atlas Index Complete');
  console.log(`  Zones: ${cardFiles.length}`);
  console.log(`  Total size: ${(totalSize / 1024).toFixed(1)} KB`);
  console.log(`  Improvements identified: ${parent.improvement_themes.length}`);
  console.log(`  Parent index: ${PARENT_INDEX}`);
  console.log();
  console.log('Next: subagents can swap LoRA adapters per zone using bank offset');
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
