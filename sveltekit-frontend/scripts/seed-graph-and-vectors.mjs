#!/usr/bin/env node
/**
 * Seed script: Graph connections + Qdrant evidence vectors
 *
 * 1. Creates meaningful connections between the 9 yorha_evidence_nodes in case c9b79f5d
 * 2. Upserts evidence_vectors from PG into Qdrant evidence_vectors collection
 *
 * This enables the full KAG path:
 *   getCaseGraphNeighborIds() → buildGraphShouldFilter() → Qdrant search → applyGraphAuthorityScoring()
 */

import pg from 'pg';
import crypto from 'crypto';

const { Pool } = pg;
const pool = new Pool({
  connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5432/legal_ai_db',
});

const QDRANT_URL = 'http://127.0.0.1:6333';
const CASE_ID = 'c9b79f5d-5d81-40ee-9c60-4945a6b38287';

// ─── Phase 1: Seed graph connections ────────────────────────────────────────

async function seedGraphConnections() {
  console.log('\n=== Phase 1: Seed Graph Connections ===\n');

  // Get all nodes for the case
  const { rows: nodes } = await pool.query(
    `SELECT id, title FROM yorha_evidence_nodes WHERE case_id = $1 ORDER BY title`,
    [CASE_ID]
  );

  console.log(`Found ${nodes.length} nodes for case ${CASE_ID.slice(0, 8)}`);
  nodes.forEach((n) => console.log(`  ${n.id.slice(0, 8)} | ${n.title}`));

  // Build a map by title for easy reference
  const byTitle = {};
  for (const n of nodes) {
    byTitle[n.title] = n.id;
  }

  // Define meaningful legal connections between document sections
  // These represent how sections of a legal complaint relate to each other
  const connections = [
    // Factual allegations support both counts
    {
      source: 'FACTUAL ALLEGATIONS',
      target: 'COUNT I - BREACH OF CONTRACT',
      type: 'supports',
      strength: 85,
      confidence: 90,
      description: 'Factual allegations establish the basis for breach of contract claim',
    },
    {
      source: 'FACTUAL ALLEGATIONS',
      target: 'COUNT II - MISAPPROPRIATION OF TRADE SECRETS',
      type: 'supports',
      strength: 80,
      confidence: 85,
      description: 'Factual allegations establish trade secret misappropriation elements',
    },
    // Parties section provides context for allegations
    {
      source: 'PARTIES',
      target: 'FACTUAL ALLEGATIONS',
      type: 'contextualizes',
      strength: 70,
      confidence: 95,
      description: 'Party identities provide context for factual narrative',
    },
    // Jurisdiction supports the entire filing
    {
      source: 'JURISDICTION AND VENUE',
      target: 'COUNT I - BREACH OF CONTRACT',
      type: 'establishes-authority',
      strength: 60,
      confidence: 95,
      description: 'Jurisdiction establishes court authority over contract dispute',
    },
    {
      source: 'JURISDICTION AND VENUE',
      target: 'COUNT II - MISAPPROPRIATION OF TRADE SECRETS',
      type: 'establishes-authority',
      strength: 60,
      confidence: 95,
      description: 'Jurisdiction establishes court authority over trade secret claims',
    },
    // Counts lead to prayer for relief
    {
      source: 'COUNT I - BREACH OF CONTRACT',
      target: 'PRAYER FOR RELIEF',
      type: 'requests-remedy',
      strength: 90,
      confidence: 95,
      description: 'Breach of contract count supports specific relief requests',
    },
    {
      source: 'COUNT II - MISAPPROPRIATION OF TRADE SECRETS',
      target: 'PRAYER FOR RELIEF',
      type: 'requests-remedy',
      strength: 90,
      confidence: 95,
      description: 'Trade secrets count supports injunctive relief request',
    },
    // Demand for jury trial relates to counts
    {
      source: 'DEMAND FOR JURY TRIAL',
      target: 'COUNT I - BREACH OF CONTRACT',
      type: 'procedural-link',
      strength: 50,
      confidence: 90,
      description: 'Jury trial demand applies to breach of contract claims',
    },
    {
      source: 'DEMAND FOR JURY TRIAL',
      target: 'COUNT II - MISAPPROPRIATION OF TRADE SECRETS',
      type: 'procedural-link',
      strength: 50,
      confidence: 90,
      description: 'Jury trial demand applies to trade secret claims',
    },
    // Header to body
    {
      source: 'IN THE UNITED STATES DISTRICT COURT FOR THE NORTHERN DISTRICT OF CALIFORNIA',
      target: 'JURISDICTION AND VENUE',
      type: 'references',
      strength: 65,
      confidence: 98,
      description: 'Court designation aligns with jurisdiction section',
    },
    // TO THE HONORABLE COURT addresses the court
    {
      source: 'TO THE HONORABLE COURT:',
      target: 'PRAYER FOR RELIEF',
      type: 'addresses',
      strength: 55,
      confidence: 85,
      description: 'Court address frames the prayer for relief',
    },
    // Cross-count relationship
    {
      source: 'COUNT I - BREACH OF CONTRACT',
      target: 'COUNT II - MISAPPROPRIATION OF TRADE SECRETS',
      type: 'related-claim',
      strength: 75,
      confidence: 80,
      description: 'Both counts arise from same factual pattern — contract breach enabled trade secret misuse',
    },
  ];

  let inserted = 0;
  for (const conn of connections) {
    const sourceId = byTitle[conn.source];
    const targetId = byTitle[conn.target];

    if (!sourceId || !targetId) {
      console.warn(`  SKIP: Missing node for "${conn.source}" → "${conn.target}"`);
      continue;
    }

    // Check if connection already exists
    const { rows: existing } = await pool.query(
      `SELECT id FROM yorha_evidence_connections WHERE source_node_id = $1 AND target_node_id = $2 AND case_id = $3`,
      [sourceId, targetId, CASE_ID]
    );

    if (existing.length > 0) {
      console.log(`  EXISTS: ${conn.source.slice(0, 30)} → ${conn.target.slice(0, 30)}`);
      continue;
    }

    const id = crypto.randomUUID();
    const SYSTEM_USER = '00000000-0000-0000-0000-000000000001';
    await pool.query(
      `INSERT INTO yorha_evidence_connections
        (id, case_id, source_node_id, target_node_id, connection_type, strength, description, ai_reasoning, confidence_score, created_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())`,
      [id, CASE_ID, sourceId, targetId, conn.type, conn.strength, conn.description, conn.description, conn.confidence, SYSTEM_USER]
    );
    inserted++;
    console.log(`  INSERT: ${conn.source.slice(0, 30)} →[${conn.type}]→ ${conn.target.slice(0, 30)} (str:${conn.strength}, conf:${conn.confidence})`);
  }

  console.log(`\nInserted ${inserted} connections (${connections.length - inserted} already existed)`);

  // Verify
  const { rows: verifyConns } = await pool.query(
    `SELECT COUNT(*) as cnt FROM yorha_evidence_connections WHERE case_id = $1`,
    [CASE_ID]
  );
  console.log(`Total connections for case: ${verifyConns[0].cnt}`);
}

// ─── Phase 2: Upsert PG evidence vectors into Qdrant ───────────────────────

async function upsertEvidenceVectors() {
  console.log('\n=== Phase 2: Upsert Evidence Vectors into Qdrant ===\n');

  // Get evidence vectors that belong to case c9b79f5d
  const { rows: vectors } = await pool.query(`
    SELECT ev.id, ev.evidence_id, ev.chunk_index, LEFT(ev.content, 200) as content_preview,
           ev.embedding, ev.metadata, e.title as evidence_title, e.case_id
    FROM evidence_vectors ev
    JOIN evidence e ON e.id = ev.evidence_id
    WHERE e.case_id = $1
    AND ev.embedding IS NOT NULL
    ORDER BY ev.evidence_id, ev.chunk_index
  `, [CASE_ID]);

  console.log(`Found ${vectors.length} evidence vector chunks with embeddings`);

  if (vectors.length === 0) {
    console.log('No vectors to upsert');
    return;
  }

  // Check current Qdrant point count
  const colRes = await fetch(`${QDRANT_URL}/collections/evidence_vectors`);
  const colData = await colRes.json();
  console.log(`Current Qdrant evidence_vectors count: ${colData.result?.points_count ?? 0}`);

  // Check collection vector config (named vs unnamed)
  const vectorConfig = colData.result?.config?.params?.vectors;
  const isNamed = vectorConfig && typeof vectorConfig === 'object' && vectorConfig.size === undefined;
  console.log(`Vector mode: ${isNamed ? 'named:' + Object.keys(vectorConfig).join(',') : 'unnamed'}`);
  const dimension = isNamed ? Object.values(vectorConfig)[0]?.size : vectorConfig?.size;
  console.log(`Dimension: ${dimension}`);

  // Batch upsert to Qdrant in groups of 20
  const BATCH_SIZE = 20;
  let upserted = 0;

  for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
    const batch = vectors.slice(i, i + BATCH_SIZE);
    const points = [];

    for (const v of batch) {
      // Parse embedding — PG stores as text representation of float[]
      let embedding;
      if (typeof v.embedding === 'string') {
        // Handle PG array format: [0.1,0.2,...] or {0.1,0.2,...}
        const cleaned = v.embedding.replace(/[{}[\]]/g, '');
        embedding = cleaned.split(',').map(Number);
      } else if (Array.isArray(v.embedding)) {
        embedding = v.embedding;
      } else {
        console.warn(`  SKIP ${v.id.slice(0, 8)}: unexpected embedding format`);
        continue;
      }

      if (embedding.length !== dimension) {
        console.warn(`  SKIP ${v.id.slice(0, 8)}: dimension mismatch (got ${embedding.length}, expected ${dimension})`);
        continue;
      }

      // Build point payload
      const point = {
        id: v.id,
        payload: {
          content: v.content_preview || '',
          evidence_id: v.evidence_id,
          evidence_title: v.evidence_title || '',
          case_id: v.case_id,
          chunk_index: v.chunk_index,
          document_id: v.evidence_id,
          source_id: v.evidence_id,
        },
      };

      // Use correct vector format based on collection mode
      if (isNamed) {
        const vecName = Object.keys(vectorConfig)[0];
        point.vector = { [vecName]: embedding };
      } else {
        point.vector = embedding;
      }

      points.push(point);
    }

    if (points.length === 0) continue;

    const res = await fetch(`${QDRANT_URL}/collections/evidence_vectors/points`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`  Batch ${i}-${i + batch.length} FAILED: ${err.slice(0, 200)}`);
    } else {
      upserted += points.length;
      console.log(`  Batch ${i}-${i + batch.length}: ${points.length} points upserted`);
    }
  }

  // Verify final count
  const verifyRes = await fetch(`${QDRANT_URL}/collections/evidence_vectors`);
  const verifyData = await verifyRes.json();
  console.log(`\nQdrant evidence_vectors final count: ${verifyData.result?.points_count ?? 0} (added ${upserted})`);
}

// ─── Phase 3: Also upsert to evidence_items for KB-tier search ──────────────

async function upsertEvidenceItems() {
  console.log('\n=== Phase 3: Upsert to evidence_items (KB tier) ===\n');

  const { rows: vectors } = await pool.query(`
    SELECT ev.id, ev.evidence_id, ev.chunk_index, LEFT(ev.content, 600) as content,
           ev.embedding, e.title as evidence_title, e.case_id, e.evidence_type
    FROM evidence_vectors ev
    JOIN evidence e ON e.id = ev.evidence_id
    WHERE e.case_id = $1
    AND ev.embedding IS NOT NULL
    ORDER BY ev.evidence_id, ev.chunk_index
  `, [CASE_ID]);

  // Check evidence_items config
  const colRes = await fetch(`${QDRANT_URL}/collections/evidence_items`);
  const colData = await colRes.json();
  const vectorConfig = colData.result?.config?.params?.vectors;
  const isNamed = vectorConfig && typeof vectorConfig === 'object' && vectorConfig.size === undefined;
  const vecName = isNamed ? Object.keys(vectorConfig)[0] : null;
  const dimension = isNamed ? Object.values(vectorConfig)[0]?.size : vectorConfig?.size;
  console.log(`evidence_items: ${colData.result?.points_count ?? 0} pts, mode: ${isNamed ? 'named:' + vecName : 'unnamed'}, dim: ${dimension}`);

  const BATCH_SIZE = 20;
  let upserted = 0;

  for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
    const batch = vectors.slice(i, i + BATCH_SIZE);
    const points = [];

    for (const v of batch) {
      let embedding;
      if (typeof v.embedding === 'string') {
        embedding = v.embedding.replace(/[{}[\]]/g, '').split(',').map(Number);
      } else if (Array.isArray(v.embedding)) {
        embedding = v.embedding;
      } else continue;

      if (embedding.length !== dimension) continue;

      const point = {
        id: crypto.randomUUID(), // evidence_items uses separate IDs
        payload: {
          content: v.content || '',
          text: v.content || '',
          evidence_id: v.evidence_id,
          document_id: v.evidence_id,
          source_id: v.evidence_id,
          case_id: v.case_id,
          evidence_title: v.evidence_title || '',
          evidence_type: v.evidence_type || '',
          chunk_index: v.chunk_index,
          node_id: v.evidence_id, // for graph filter matching
        },
      };

      if (isNamed) {
        point.vector = { [vecName]: embedding };
      } else {
        point.vector = embedding;
      }

      points.push(point);
    }

    if (points.length === 0) continue;

    const res = await fetch(`${QDRANT_URL}/collections/evidence_items/points`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`  Batch FAILED: ${err.slice(0, 200)}`);
    } else {
      upserted += points.length;
    }
  }

  const verifyRes = await fetch(`${QDRANT_URL}/collections/evidence_items`);
  const verifyData = await verifyRes.json();
  console.log(`evidence_items final count: ${verifyData.result?.points_count ?? 0} (added ${upserted})`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  try {
    await seedGraphConnections();
    await upsertEvidenceVectors();
    await upsertEvidenceItems();
    console.log('\n=== SEED COMPLETE ===');
  } catch (err) {
    console.error('Seed failed:', err);
  } finally {
    await pool.end();
  }
}

main();
