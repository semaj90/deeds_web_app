#!/usr/bin/env node
/**
 * Safe ingestion script (dry-run default).
 * Usage: node scripts/atlas/ingest-ace-cards-to-glyphs.safe.mjs --write --out
 * Defaults to dry-run and writes SQL preview to scripts/atlas/out.
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
// Default: dry-run. Require explicit --write to perform DB writes.
const WRITE = args.includes('--write') || args.includes('--apply');
const OUT_SQL = args.includes('--out') || args.includes('--write-sql');

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
  try {
    const body = JSON.stringify({
      vector: new Array(768).fill(0),
      filter: { must: [{ key: 'source_ref', match: { value: sourceRef } }] },
      limit: 1,
      with_payload: true,
      with_vectors: false
    });

    const resp = await fetch(`${QDRANT_ENDPOINT}/collections/${QDRANT_COLLECTION}/points/search`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    const res = json.result && json.result[0];
    if (!res) return null;
    return { centroidId: res.payload?.centroid_id ?? res.payload?.centroidId ?? null, somCluster: res.payload?.som_cluster ?? null };
  } catch (err) {
    console.warn('Qdrant fetch error:', err.message);
    return null;
  }
}

function buildGlyphRecordFromCard(card, qdrantData) {
  const section = inferSectionFromCard(card);
  const semantic = {
    title: card.title,
    summary: card.summary || card.compressed || card.title || '',
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
    semantic,
    vector,
    topology,
    render
  };
}

async function upsertGlyphRecord(db, glyphId, sourceId, kind, section, recordJson, centroidId, somCluster) {
  const query = `
    INSERT INTO glyph_records (glyph_id, source_id, kind, section, record_json, centroid_id, som_cluster, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
    ON CONFLICT (glyph_id) DO UPDATE SET
      source_id = EXCLUDED.source_id,
      kind = EXCLUDED.kind,
      section = EXCLUDED.section,
      record_json = EXCLUDED.record_json,
      centroid_id = EXCLUDED.centroid_id,
      som_cluster = EXCLUDED.som_cluster,
      updated_at = NOW()
    RETURNING id;
  `;
  const values = [glyphId, sourceId, kind, section, recordJson, centroidId, somCluster];
  const res = await db.query(query, values);
  return res.rows && res.rows[0];
}

async function main() {
  console.log(`📦 Loaded ACE packet: ${cards.length} cards`);
  console.log(`🔗 Postgres: ${POSTGRES_URL}`);
  console.log(`🔍 Qdrant: ${QDRANT_ENDPOINT}/${QDRANT_COLLECTION}\n`);

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
        const rec = await upsertGlyphRecord(db, glyphRecord.glyphId, glyphRecord.sourceId, kind, section, glyphRecord, glyphRecord.vector.centroidId, glyphRecord.topology.somCluster);
        written++;
        if (written % 10 === 0) console.log(`  ✓ Written ${written} cards...`);
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
    console.log(`   SELECT kind, count(*) FROM glyph_records GROUP BY kind;`);
    console.log(`   SELECT source_id FROM glyph_records LIMIT 5;`);
  } finally {
    await db.end();
  }
}

if (OUT_SQL) {
  const outDir = path.join(projectRoot, 'scripts', 'atlas', 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const fname = path.join(outDir, `glyph-upserts-${new Date().toISOString().slice(0,10)}.sql`);
  // create SQL preview using a safe payload CTE that also fills required columns
  const sqlLines = cards.map(card => {
    const gr = buildGlyphRecordFromCard(card, {});
    const payload = JSON.stringify(gr).replace(/'/g, "''");
    return `-- upsert for ${gr.glyphId}\nWITH payload AS (SELECT '${payload}'::jsonb AS j)\nINSERT INTO glyph_records (glyph_id, source_id, kind, section, summary, tags, entities, record_json, centroid_id, som_cluster, created_at)\nSELECT '${gr.glyphId.replace(/'/g, "''")}', ${gr.sourceId ? `'${String(gr.sourceId).replace(/'/g, "''")}'` : 'NULL'}, '${gr.kind}', '${gr.semantic.section}', COALESCE(payload.j->'semantic'->>'summary',''), COALESCE(payload.j->'semantic'->'tags','[]'::jsonb), COALESCE(payload.j->'semantic'->'entities','[]'::jsonb), payload.j, ${gr.vector.centroidId === null ? 'NULL' : gr.vector.centroidId}, ${gr.topology.somCluster === null ? 'NULL' : gr.topology.somCluster}, now()\nON CONFLICT (glyph_id) DO UPDATE SET source_id = EXCLUDED.source_id, kind = EXCLUDED.kind, section = EXCLUDED.section, summary = EXCLUDED.summary, tags = EXCLUDED.tags, entities = EXCLUDED.entities, record_json = EXCLUDED.record_json, centroid_id = EXCLUDED.centroid_id, som_cluster = EXCLUDED.som_cluster, updated_at = NOW();\n`;
  });
  fs.writeFileSync(fname, sqlLines.join('\n'), 'utf8');
  console.log('Wrote SQL preview to', fname);
}

if (WRITE) {
  console.log('Writing to DB (explicit --write flag provided)');
  main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
} else {
  console.log('Dry-run complete. No DB writes performed. Use --write to run ingestion.');
}
