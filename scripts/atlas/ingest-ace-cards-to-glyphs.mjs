#!/usr/bin/env node
/**
 * Phase 1C: ACE Cards → GlyphRecord Ingestion Script
 *
 * Reads .opencode/ace-packet.json and upserts canonical records into Postgres.
 * Usage: node scripts/atlas/ingest-ace-cards-to-glyphs.mjs --apply
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');
const acePacketPath = path.join(projectRoot, '.opencode/ace-packet.json');

// Config (env-overridable)
const POSTGRES_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:postgres@localhost:5432/legal_ai_db';
const QDRANT_ENDPOINT = process.env.QDRANT_ENDPOINT || 'http://127.0.0.1:6333';
const QDRANT_COLLECTION = 'codebase_chunks_768';

const args = process.argv.slice(2);
// CLI flags: default is dry-run. Use --write to perform DB writes. Use --out [path] to write SQL preview.
const WRITE = args.includes('--write');
const QDRANT_ENABLED = args.includes('--qdrant');
let OUT_SQL = false;
let OUT_PATH = null;
for (let i=0;i<args.length;i++){
  if (args[i] === '--out' || args[i] === '--out-sql' || args[i] === '--write-sql'){
    OUT_SQL = true;
    if (args[i+1] && !args[i+1].startsWith('--')) { OUT_PATH = args[i+1]; i++; }
  }
}

if (!fs.existsSync(acePacketPath)) {
  console.error('ERROR: ACE packet not found at .opencode/ace-packet.json');
  process.exit(1);
}

const packet = JSON.parse(fs.readFileSync(acePacketPath, 'utf8'));
const cards = packet.cards || packet.entries || [];

function inferSectionFromCard(card) {
  const text = (card.compressed || card.title || '').toLowerCase();
  if (text.includes('party') || text.includes('plaintiff') || text.includes('defendant')) return 'PARTIES';
  if (text.includes('court') || text.includes('jurisdiction')) return 'JURISDICTION';
  if (text.includes('fact') || text.includes('evidence')) return 'FACTS';
  if (text.includes('law') || text.includes('statute') || text.includes('regulation') || text.includes('legal')) return 'LEGAL_AUTHORITY';
  if (text.includes('claim') || text.includes('charge')) return 'CLAIMS';
  if (text.includes('prayer') || text.includes('holding') || text.includes('judgment')) return 'PRAYER_HOLDING';
  return 'UNKNOWN';
}

async function fetchQdrantData(sourceRef) {
  // Phase 1: Qdrant lookup deferred. Most ACE cards don't have embeddings yet.
  // Phase 2 will enrich centroidId + grpoRewardScore via GPU similarity scoring.
  return null;
}

function buildGlyphRecordFromCard(card, qdrantData) {
  const section = inferSectionFromCard(card);
  const summary =
    (card && card.semantic && card.semantic.summary) ||
    card?.summary ||
    card?.title ||
    (card?.text ? String(card.text).slice(0, 240) : null) ||
    (card?.content ? String(card.content).slice(0, 240) : '') ||
    '';

  const semantic = {
    title: card.title,
    summary,
    tags: Array.isArray(card.tags) ? card.tags : [],
    entities: Array.isArray(card.entities) ? card.entities : [],
    section,
    kagNeighbors: [],
    dagPrev: [],
    dagNext: []
  };

  const vector = {
    embeddingModel: 'embeddinggemma:latest',
    centroidId: qdrantData?.centroidId ?? null,
    grpoRewardScore: null
  };

  const topology = { somCluster: qdrantData?.somCluster ?? null };
  const render = {};

  return {
    glyphId: card.id || card.title || `${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
    sourceId: card.source || card.path || card.id || null,
    kind: card.kind || 'chunk',
    schemaVersion: 1,
    // ensure top-level summary exists to satisfy NOT NULL constraint in DB
    summary: semantic.summary,
    semantic,
    vector,
    topology,
    render
  };
}

async function upsertGlyphRecord(db, glyphId, sourceId, kind, section, recordJson, centroidId, somCluster, summary) {
  // Use 'kind' column name to match actual Drizzle schema
  // Coerce integer fields to ensure type safety
  const query = `
    INSERT INTO glyph_records (glyph_id, source_id, kind, section, summary, record_json, centroid_id, som_cluster, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7::integer,$8::integer,NOW())
    ON CONFLICT (glyph_id) DO UPDATE SET
      source_id = EXCLUDED.source_id,
      kind = EXCLUDED.kind,
      section = EXCLUDED.section,
      summary = EXCLUDED.summary,
      record_json = EXCLUDED.record_json,
      centroid_id = EXCLUDED.centroid_id,
      som_cluster = EXCLUDED.som_cluster,
      updated_at = NOW()
    RETURNING id;
  `;
  // Values order MUST match query: $1 $2 $3 $4 $5 $6 $7 $8
  const values = [glyphId, sourceId, kind, section, summary, recordJson, centroidId ?? null, somCluster ?? null];
  const res = await db.query(query, values);
  return res.rows && res.rows[0];
}

async function main() {
  console.log(`📦 Loaded ACE packet: ${cards.length} cards`);
  console.log(`🔗 Postgres: ${POSTGRES_URL}`);
  console.log(`🔍 Qdrant: ${QDRANT_ENDPOINT}/${QDRANT_COLLECTION}\n`);

  if (!WRITE && !OUT_SQL) {
    console.log('Dry-run mode (no DB writes). Use --write to perform writes, --out [path] to generate SQL preview. Use --qdrant to enable Qdrant lookups.');
    return;
  }

  const db = new Pool({ connectionString: POSTGRES_URL, max: 5 });
  let written = 0, skipped = 0, errors = 0;

  try {
    for (const card of cards) {
      if (card.selected === false) { skipped++; continue; }
      const sourceRef = card.source || card.id || card.title;
      try {
        const qdrantData = await fetchQdrantData(sourceRef);
        const glyphRecord = buildGlyphRecordFromCard(card, qdrantData);
        const section = glyphRecord.semantic.section;
        const kind = glyphRecord.kind;
        if (WRITE) {
          const recordJson = JSON.stringify(glyphRecord);
          const rec = await upsertGlyphRecord(db, glyphRecord.glyphId, glyphRecord.sourceId, kind, section, recordJson, glyphRecord.vector.centroidId, glyphRecord.topology.somCluster, glyphRecord.summary);
          written++;
          if (written % 10 === 0) console.log(`  ✓ Written ${written} cards...`);
        }
      } catch (err) {
        console.error(`  ❌ Error processing card ${card.id || card.title}: ${err.message}`);
        errors++;
      }
    }

    console.log(`\n✅ Ingestion Complete`);
    console.log(`   Written:  ${written}`);
    console.log(`   Skipped:  ${skipped}`);
    console.log(`   Errors:   ${errors}`);
    console.log(`\n📊 Verification queries:`);
    console.log(`   SELECT count(*) FROM glyph_records;`);
    console.log(`   SELECT type, count(*) FROM glyph_records GROUP BY type;`);
    console.log(`   SELECT source_id FROM glyph_records LIMIT 5;`);
  } finally {
    await db.end();
  }
}

if (OUT_SQL) {
  const outDir = path.join(projectRoot, 'scripts', 'atlas', 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const fname = OUT_PATH ? path.resolve(OUT_PATH) : path.join(outDir, `glyph-upserts-${new Date().toISOString().slice(0,10)}.sql`);
  // create SQL preview using a safe payload CTE that also fills required columns
  const sqlLines = cards.map(card => {
    const gr = buildGlyphRecordFromCard(card, {});
    const payload = JSON.stringify(gr).replace(/'/g, "''");
    // Use defensive SQL fallback for summary to satisfy NOT NULL constraint
    const summaryExpr = `COALESCE(\n      NULLIF(payload.j->'semantic'->>'summary', ''),\n      NULLIF(payload.j ->> 'summary', ''),\n      NULLIF(payload.j ->> 'title', ''),\n      LEFT(COALESCE(payload.j ->> 'text', payload.j ->> 'content', ''), 240),\n      ''\n    )`;
    return `-- upsert for ${gr.glyphId}\nINSERT INTO glyph_records (glyph_id, source_id, type, section, summary, tags, entities, record_json, centroid_id, som_cluster, created_at)\nSELECT '${gr.glyphId.replace(/'/g, "''")}', ${gr.sourceId ? `'${String(gr.sourceId).replace(/'/g, "''")}'` : 'NULL'}, '${gr.kind}', '${gr.semantic.section}', ${summaryExpr}, COALESCE(payload.j->'semantic'->'tags','[]'::jsonb), COALESCE(payload.j->'semantic'->'entities','[]'::jsonb), payload.j, ${gr.vector.centroidId === null ? 'NULL' : gr.vector.centroidId}, ${gr.topology.somCluster === null ? 'NULL' : gr.topology.somCluster}, now()\nFROM (SELECT '${payload}'::jsonb AS j) AS payload\nON CONFLICT (glyph_id) DO UPDATE SET source_id = EXCLUDED.source_id, type = EXCLUDED.type, section = EXCLUDED.section, summary = EXCLUDED.summary, tags = EXCLUDED.tags, entities = EXCLUDED.entities, record_json = EXCLUDED.record_json, centroid_id = EXCLUDED.centroid_id, som_cluster = EXCLUDED.som_cluster, updated_at = NOW();\n`;
  });
  fs.writeFileSync(fname, sqlLines.join('\n'), 'utf8');
  console.log('Wrote SQL preview to', fname);
}

if (WRITE) {
  main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
} else {
  console.log('Dry-run complete. No DB writes were performed. Use --write to perform writes.');
}
