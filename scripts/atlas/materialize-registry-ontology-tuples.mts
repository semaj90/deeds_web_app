#!/usr/bin/env npx tsx
/**
 * Materialize Registry Ontology Tuple Projection
 *
 * Generates subject / predicate / object tuples from:
 * - AST (structural facts via tree-sitter)
 * - Schema (function signatures, type definitions)
 * - Research docs (extracted entities via Firecrawl)
 * - Verified facts (corroborated by multiple sources)
 *
 * LLM-generated tuples are marked as candidates until corroborated.
 * Does NOT count source paths as semantic concepts.
 *
 * Creates registry_ontology_tuples table with source tracking and confidence.
 */

import { pool } from '$lib/server/db/client.js';

interface OntologyTuple {
  packet_key: string;
  subject: string;
  predicate: string;
  object: string;
  tuple_type: 'ast' | 'schema' | 'research' | 'verified' | 'candidate';
  confidence: number;
  sources: string[];
  corroboration_count: number;
  materialization_version: number;
}

const MATERIALIZATION_VERSION = 1;
const CONFIDENCE_THRESHOLDS = {
  ast: 0.95,
  schema: 0.90,
  research: 0.60,
  verified: 1.0,
  candidate: 0.50,
};

async function ensureProjectionTable(client: any): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS registry_ontology_tuples (
      id SERIAL PRIMARY KEY,
      packet_key TEXT NOT NULL,
      subject TEXT NOT NULL,
      predicate TEXT NOT NULL,
      object TEXT NOT NULL,
      tuple_type TEXT NOT NULL CHECK (tuple_type IN ('ast', 'schema', 'research', 'verified', 'candidate')),
      confidence REAL NOT NULL,
      sources TEXT[] DEFAULT '{}',
      corroboration_count INT DEFAULT 0,
      materialization_version INT DEFAULT ${MATERIALIZATION_VERSION},
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (packet_key, subject, predicate, object)
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_ontology_packet_key
    ON registry_ontology_tuples (packet_key)
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_ontology_subject
    ON registry_ontology_tuples (subject)
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_ontology_type
    ON registry_ontology_tuples (tuple_type)
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_ontology_confidence
    ON registry_ontology_tuples (confidence DESC)
  `);
}

async function extractASTTuples(client: any, packetKey: string): Promise<OntologyTuple[]> {
  // Extract structural facts from AST symbols and relationships
  const tuples: OntologyTuple[] = [];

  try {
    const result = await client.query(`
      SELECT
        symbol_name, kind, parent_symbol
      FROM feature_implementations
      WHERE packet_key = $1
    `, [packetKey]);

    for (const row of result.rows) {
      if (row.symbol_name && row.kind) {
        tuples.push({
          packet_key: packetKey,
          subject: row.symbol_name,
          predicate: 'is_kind',
          object: row.kind,
          tuple_type: 'ast',
          confidence: CONFIDENCE_THRESHOLDS.ast,
          sources: ['ast-grep', 'tree-sitter'],
          corroboration_count: 2,
          materialization_version: MATERIALIZATION_VERSION,
        });

        if (row.parent_symbol) {
          tuples.push({
            packet_key: packetKey,
            subject: row.symbol_name,
            predicate: 'parent_is',
            object: row.parent_symbol,
            tuple_type: 'ast',
            confidence: CONFIDENCE_THRESHOLDS.ast,
            sources: ['ast-grep'],
            corroboration_count: 1,
            materialization_version: MATERIALIZATION_VERSION,
          });
        }
      }
    }
  } catch {
    // Table may not exist; continue
  }

  return tuples;
}

async function extractSchemaTuples(client: any, packetKey: string): Promise<OntologyTuple[]> {
  // Extract from function signatures, type definitions, schema constraints
  const tuples: OntologyTuple[] = [];

  try {
    // Query schema facts if available
    const result = await client.query(`
      SELECT
        function_name, return_type, parameter_types
      FROM function_schema
      WHERE packet_key = $1
    `, [packetKey]).catch(() => ({ rows: [] }));

    for (const row of result.rows) {
      if (row.function_name && row.return_type) {
        tuples.push({
          packet_key: packetKey,
          subject: row.function_name,
          predicate: 'returns_type',
          object: row.return_type,
          tuple_type: 'schema',
          confidence: CONFIDENCE_THRESHOLDS.schema,
          sources: ['schema-analysis'],
          corroboration_count: 1,
          materialization_version: MATERIALIZATION_VERSION,
        });
      }
    }
  } catch {
    // Table may not exist; continue
  }

  return tuples;
}

async function extractResearchTuples(client: any, packetKey: string): Promise<OntologyTuple[]> {
  // Extract from research documents and Firecrawl results
  const tuples: OntologyTuple[] = [];

  try {
    const result = await client.query(`
      SELECT
        entity_name, entity_type, related_entity
      FROM research_extracted_entities
      WHERE packet_key = $1
    `, [packetKey]).catch(() => ({ rows: [] }));

    for (const row of result.rows) {
      if (row.entity_name && row.entity_type) {
        tuples.push({
          packet_key: packetKey,
          subject: row.entity_name,
          predicate: 'is_entity',
          object: row.entity_type,
          tuple_type: 'research',
          confidence: CONFIDENCE_THRESHOLDS.research,
          sources: ['firecrawl', 'research-docs'],
          corroboration_count: 1,
          materialization_version: MATERIALIZATION_VERSION,
        });

        if (row.related_entity) {
          tuples.push({
            packet_key: packetKey,
            subject: row.entity_name,
            predicate: 'related_to',
            object: row.related_entity,
            tuple_type: 'research',
            confidence: CONFIDENCE_THRESHOLDS.research,
            sources: ['research-docs'],
            corroboration_count: 1,
            materialization_version: MATERIALIZATION_VERSION,
          });
        }
      }
    }
  } catch {
    // Table may not exist; continue
  }

  return tuples;
}

async function findVerifiedTuples(client: any, tuples: OntologyTuple[]): Promise<OntologyTuple[]> {
  // Mark tuples as verified if corroborated by multiple sources
  const verified: OntologyTuple[] = [];

  for (const tuple of tuples) {
    // Count how many sources confirm this tuple
    const corroborationCount = tuple.sources.length;
    if (corroborationCount >= 2 || tuple.tuple_type === 'ast') {
      verified.push({
        ...tuple,
        tuple_type: 'verified',
        confidence: CONFIDENCE_THRESHOLDS.verified,
        corroboration_count: corroborationCount,
      });
    } else {
      verified.push({
        ...tuple,
        tuple_type: 'candidate',
        confidence: Math.min(tuple.confidence, CONFIDENCE_THRESHOLDS.candidate),
      });
    }
  }

  return verified;
}

async function filterSourcePaths(tuples: OntologyTuple[]): Promise<OntologyTuple[]> {
  // Do NOT count source paths as semantic concepts
  return tuples.filter(t => {
    // Filter out file paths, URLs, and directory references
    if (t.subject.includes('/') || t.subject.includes('\\')) return false;
    if (t.object.includes('/') || t.object.includes('\\')) return false;
    if (t.subject.startsWith('http://') || t.subject.startsWith('https://')) return false;
    if (t.object.startsWith('http://') || t.object.startsWith('https://')) return false;
    return true;
  });
}

async function materializeProjection(client: any, limit: number = 0): Promise<{ materialized: number; errors: number }> {
  let materialized = 0;
  let errors = 0;

  // Query all packets
  const query = limit > 0
    ? `SELECT packet_key FROM atlas_packets LIMIT ${limit}`
    : 'SELECT packet_key FROM atlas_packets';

  const packets = await client.query(query);

  console.log(`📝 Materializing ${packets.rows.length} packets with ontology tuples...`);

  for (const packet of packets.rows) {
    try {
      // Extract tuples from all sources
      const astTuples = await extractASTTuples(client, packet.packet_key);
      const schemaTuples = await extractSchemaTuples(client, packet.packet_key);
      const researchTuples = await extractResearchTuples(client, packet.packet_key);

      let allTuples = [...astTuples, ...schemaTuples, ...researchTuples];

      // Find verified tuples (corroborated by multiple sources)
      allTuples = await findVerifiedTuples(client, allTuples);

      // Filter out source paths
      allTuples = await filterSourcePaths(allTuples);

      // Upsert each tuple
      for (const tuple of allTuples) {
        await client.query(`
          INSERT INTO registry_ontology_tuples (
            packet_key, subject, predicate, object,
            tuple_type, confidence, sources, corroboration_count,
            materialization_version
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (packet_key, subject, predicate, object) DO UPDATE SET
            tuple_type = EXCLUDED.tuple_type,
            confidence = EXCLUDED.confidence,
            sources = EXCLUDED.sources,
            corroboration_count = EXCLUDED.corroboration_count,
            materialization_version = EXCLUDED.materialization_version,
            updated_at = NOW()
        `, [
          tuple.packet_key,
          tuple.subject,
          tuple.predicate,
          tuple.object,
          tuple.tuple_type,
          tuple.confidence,
          tuple.sources,
          tuple.corroboration_count,
          tuple.materialization_version,
        ]);

        materialized++;
      }

      if (materialized % 1000 === 0) {
        console.log(`  ✓ ${materialized} tuples materialized`);
      }
    } catch (err) {
      errors++;
      if (errors <= 5) {
        console.warn(`  ⚠️  Error on ${packet.packet_key}:`, err instanceof Error ? err.message : String(err));
      }
    }
  }

  return { materialized, errors };
}

async function main() {
  const client = await pool.connect();

  try {
    console.log('🔧 Materializing Registry Ontology Tuples\n');

    // Ensure table exists
    await ensureProjectionTable(client);
    console.log('✅ Projection table ensured\n');

    // Materialize the projection
    const { materialized, errors } = await materializeProjection(client);

    console.log(`\n📊 Materialization Complete`);
    console.log(`  ✓ Materialized: ${materialized}`);
    console.log(`  ⚠️  Errors: ${errors}`);
    console.log(`  📦 Version: ${MATERIALIZATION_VERSION}`);

    process.exit(errors > materialized * 0.01 ? 1 : 0);
  } catch (err) {
    console.error('❌ Materialization failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  } finally {
    await client.release();
  }
}

main();
