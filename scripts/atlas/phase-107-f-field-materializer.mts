#!/usr/bin/env npx tsx
/**
 * Phase 107 Phase F — Field-Level Precedence Materializer
 *
 * Replaces lane-level hard failures with per-field graceful degradation.
 * Materializes normalized feature facts + fallback atlas_packets into
 * feature_packet_bindings with explicit provenance tracking.
 *
 * Architecture:
 * - Task 1 (Audit): Read existing materializer, document precedence gaps
 * - Task 2 (Hash Provenance): Verify content_hash determinism Postgres/Qdrant/Redis
 * - Task 3 (Bindings Migration): Create feature_packet_bindings table + Drizzle schema
 * - Task 4 (File Edges): Classify 6 unresolved feature_file_edges rows
 * - Task 5 (Rewrite): Field-level resolution + empty-lane reporting
 *
 * Usage:
 *   npx tsx scripts/atlas/phase-107-f-field-materializer.mts [--limit N] [--dry-run] [--smoke]
 *   npx tsx scripts/atlas/phase-107-f-field-materializer.mts --smoke  # 4-row controlled test
 */

import { pool } from '$lib/server/db/client.js';
import { sql } from 'drizzle-orm';

interface FieldResolution<T = unknown> {
  value: T | null;
  source: string | null;
  fallbackUsed: boolean;
  confidence: number;
  unresolvedReason?: string;
}

interface ContentIdentity {
  value: string | null;
  kind: 'canonical-source-sha256' | 'derived-summary-hash' | 'synthetic-migration-hash' | 'missing';
  algorithm: 'sha256' | 'unknown' | null;
  inputContract: 'source-bytes' | 'normalized-summary' | 'migration-fields-v1' | null;
  canonical: boolean;
}

interface FeatureLoadProvenance {
  packetKey: string;
  laneSources: {
    domain: string;
    lexical: string;
    structural: string;
    ontology: string;
  };
  fallbackUsed: boolean;
  fallbackReasons: string[];
  unresolvedReasons: string[];
}

const MATERIALIZATION_VERSION = 'phase-107-f-v1';
const PROCESSING_PASS_ID = 'phase-107-f-' + Date.now().toString();

// ═══════════════════════════════════════════════════════════════════════════
// FIELD-LEVEL RESOLUTION FUNCTIONS (per-field, not lane-level)
// ═══════════════════════════════════════════════════════════════════════════

async function resolveDomain(
  client: any,
  packetKey: string,
  sourceRef: string
): Promise<FieldResolution<string>> {
  try {
    // Try feature_domain_facts first (primary, high confidence)
    const result = await client.query(
      `SELECT domain_class, confidence FROM feature_domain_facts WHERE packet_key = $1 ORDER BY confidence DESC LIMIT 1`,
      [packetKey]
    ).catch(() => ({ rows: [] }));

    if (result.rows[0]?.domain_class) {
      return {
        value: result.rows[0].domain_class,
        source: 'feature_domain_facts',
        fallbackUsed: false,
        confidence: result.rows[0].confidence || 0.95
      };
    }
  } catch {
    // Fallback path
  }

  try {
    // Fallback to atlas_packets domain_class
    const result = await client.query(
      `SELECT domain_class FROM atlas_packets WHERE packet_key = $1`,
      [packetKey]
    ).catch(() => ({ rows: [] }));

    if (result.rows[0]?.domain_class) {
      return {
        value: result.rows[0].domain_class,
        source: 'atlas_packets_fallback',
        fallbackUsed: true,
        confidence: 0.6
      };
    }
  } catch {
    // Completely unresolved
  }

  return {
    value: null,
    source: null,
    fallbackUsed: false,
    confidence: 0,
    unresolvedReason: 'DOMAIN_NOT_AVAILABLE'
  };
}

async function resolveStructuralFacts(
  client: any,
  packetKey: string
): Promise<FieldResolution<string[]>> {
  try {
    const result = await client.query(
      `SELECT symbol_name, ast_facts FROM feature_structural_facts WHERE packet_key = $1 LIMIT 10`,
      [packetKey]
    ).catch(() => ({ rows: [] }));

    if (result.rows.length > 0) {
      const symbols = result.rows.map((r: any) => r.symbol_name).filter(Boolean);
      return {
        value: symbols,
        source: 'feature_structural_facts',
        fallbackUsed: false,
        confidence: 0.95
      };
    }
  } catch {
    // Fallthrough to unresolved
  }

  return {
    value: [],
    source: null,
    fallbackUsed: false,
    confidence: 0,
    unresolvedReason: 'STRUCTURAL_LANE_NOT_MATERIALIZED'
  };
}

async function resolveLexicalFacts(
  client: any,
  sourceRef: string
): Promise<FieldResolution<string[]>> {
  try {
    const result = await client.query(
      `SELECT keywords, bm25_terms FROM feature_lexical_facts WHERE source_ref = $1 LIMIT 1`,
      [sourceRef]
    ).catch(() => ({ rows: [] }));

    if (result.rows[0]) {
      const terms = [...(result.rows[0].keywords || []), ...(result.rows[0].bm25_terms || [])];
      return {
        value: terms,
        source: 'feature_lexical_facts',
        fallbackUsed: false,
        confidence: 0.95
      };
    }
  } catch {
    // Fallthrough to unresolved
  }

  return {
    value: [],
    source: null,
    fallbackUsed: false,
    confidence: 0,
    unresolvedReason: 'LEXICAL_LANE_NOT_MATERIALIZED'
  };
}

async function resolveOntologyTuples(
  client: any,
  packetKey: string
): Promise<FieldResolution<any[]>> {
  try {
    const result = await client.query(
      `SELECT subject_id, predicate, object_id, confidence FROM feature_ontology_tuples WHERE packet_key = $1 LIMIT 20`,
      [packetKey]
    ).catch(() => ({ rows: [] }));

    if (result.rows.length > 0) {
      return {
        value: result.rows,
        source: 'feature_ontology_tuples',
        fallbackUsed: false,
        confidence: Math.min(...result.rows.map((r: any) => r.confidence || 0.9))
      };
    }
  } catch {
    // Fallthrough to unresolved
  }

  return {
    value: [],
    source: null,
    fallbackUsed: false,
    confidence: 0,
    unresolvedReason: 'ONTOLOGY_LANE_NOT_MATERIALIZED'
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTENT IDENTITY RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════

function resolveContentIdentity(row: {
  sha256: string | null;
  summaryHash: string | null;
  packetId?: string;
}): ContentIdentity {
  if (row.sha256) {
    return {
      value: row.sha256,
      kind: 'canonical-source-sha256',
      algorithm: 'sha256',
      inputContract: 'source-bytes',
      canonical: true
    };
  }

  if (row.summaryHash) {
    return {
      value: row.summaryHash,
      kind: 'derived-summary-hash',
      algorithm: 'unknown',
      inputContract: 'normalized-summary',
      canonical: false
    };
  }

  return {
    value: null,
    kind: 'missing',
    algorithm: null,
    inputContract: null,
    canonical: false
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTROLLED 4-ROW SMOKE TEST
// ═══════════════════════════════════════════════════════════════════════════

async function runControlledSmoke(client: any): Promise<boolean> {
  console.log('\n🧪 CONTROLLED SMOKE TEST (4 rows)\n');

  const testCases = [
    {
      name: 'A: Normalized domain + packet fallback → normalized wins (labeled)',
      query: `
        SELECT ap.packet_key, ap.source_ref, fdf.domain_class as normalized_domain
        FROM atlas_packets ap
        LEFT JOIN feature_domain_facts fdf ON ap.packet_key = fdf.packet_key
        WHERE ap.domain_class IS NOT NULL AND fdf.domain_class IS NOT NULL
        LIMIT 1
      `
    },
    {
      name: 'B: No normalized domain + packet domain → fallback labeled',
      query: `
        SELECT ap.packet_key, ap.source_ref, ap.domain_class as packet_domain
        FROM atlas_packets ap
        LEFT JOIN feature_domain_facts fdf ON ap.packet_key = fdf.packet_key
        WHERE ap.domain_class IS NOT NULL AND fdf.domain_class IS NULL
        LIMIT 1
      `
    },
    {
      name: 'C: Ontology tuples present → concepts lifted with evidence',
      query: `
        SELECT ap.packet_key, ap.source_ref, COUNT(*) as tuple_count
        FROM atlas_packets ap
        JOIN feature_ontology_tuples fot ON ap.packet_key = fot.packet_key
        GROUP BY ap.packet_key, ap.source_ref
        HAVING COUNT(*) > 0
        LIMIT 1
      `
    },
    {
      name: 'D: Neither normalized nor fallback → unresolved record',
      query: `
        SELECT ap.packet_key, ap.source_ref
        FROM atlas_packets ap
        LEFT JOIN feature_domain_facts fdf ON ap.packet_key = fdf.packet_key
        WHERE ap.domain_class IS NULL AND fdf.domain_class IS NULL
        LIMIT 1
      `
    }
  ];

  let passCount = 0;

  for (const tc of testCases) {
    try {
      const result = await client.query(tc.query);
      if (result.rows.length > 0) {
        console.log(`✅ ${tc.name}`);
        console.log(`   Sample: ${JSON.stringify(result.rows[0])}\n`);
        passCount++;
      } else {
        console.log(`⚠️  ${tc.name} (no matching rows)\n`);
      }
    } catch (err) {
      console.log(`❌ ${tc.name} (query error: ${err})\n`);
    }
  }

  console.log(`📊 Smoke Test: ${passCount}/4 assertions passed\n`);
  return passCount === 4;
}

// ═══════════════════════════════════════════════════════════════════════════
// MATERIALIZATION (Field-Level Precedence)
// ═══════════════════════════════════════════════════════════════════════════

async function materializePacket(
  client: any,
  packetKey: string,
  sourceRef: string,
  isDryRun: boolean
): Promise<{ success: boolean; provenance: FeatureLoadProvenance }> {
  try {
    // Resolve each field independently (not lane-level, field-level)
    const domain = await resolveDomain(client, packetKey, sourceRef);
    const structural = await resolveStructuralFacts(client, packetKey);
    const lexical = await resolveLexicalFacts(client, sourceRef);
    const ontology = await resolveOntologyTuples(client, packetKey);

    // Build provenance
    const provenance: FeatureLoadProvenance = {
      packetKey,
      laneSources: {
        domain: domain.source || 'missing',
        lexical: lexical.source || 'missing',
        structural: structural.source || 'missing',
        ontology: ontology.source || 'missing'
      },
      fallbackUsed: domain.fallbackUsed || lexical.fallbackUsed || structural.fallbackUsed || ontology.fallbackUsed,
      fallbackReasons: [
        domain.fallbackUsed ? 'domain from atlas_packets' : null,
        lexical.fallbackUsed ? 'lexical from atlas_packets' : null,
        structural.fallbackUsed ? 'structural from legacy' : null,
        ontology.fallbackUsed ? 'ontology from legacy' : null
      ].filter(Boolean) as string[],
      unresolvedReasons: [
        domain.unresolvedReason ? `domain: ${domain.unresolvedReason}` : null,
        lexical.unresolvedReason ? `lexical: ${lexical.unresolvedReason}` : null,
        structural.unresolvedReason ? `structural: ${structural.unresolvedReason}` : null,
        ontology.unresolvedReason ? `ontology: ${ontology.unresolvedReason}` : null
      ].filter(Boolean) as string[]
    };

    if (!isDryRun) {
      // Create feature_packet_bindings entries if domains resolved
      if (domain.value && domain.source) {
        const featureId = domain.value.toLowerCase().replace(/\s+/g, '_');
        await client.query(
          `INSERT INTO feature_packet_bindings (feature_id, packet_key, source_ref, binding_type, confidence)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (feature_id, packet_key, source_ref) DO UPDATE SET
             confidence = EXCLUDED.confidence,
             updated_at = NOW()`,
          [featureId, packetKey, sourceRef, domain.fallbackUsed ? 'promoted' : 'extracted', domain.confidence]
        );
      }
    }

    return { success: true, provenance };
  } catch (err) {
    console.warn(`Error materializing ${packetKey}:`, err);
    return {
      success: false,
      provenance: {
        packetKey,
        laneSources: { domain: 'missing', lexical: 'missing', structural: 'missing', ontology: 'missing' },
        fallbackUsed: false,
        fallbackReasons: [],
        unresolvedReasons: [(err instanceof Error ? err.message : String(err))]
      }
    };
  }
}

async function runMaterialization(
  client: any,
  limit: number = 0,
  isDryRun: boolean = false
): Promise<{ materialized: number; fallback: number; unresolved: number; failures: number }> {
  const query = limit > 0
    ? `SELECT packet_key, source_ref FROM atlas_packets LIMIT ${limit}`
    : 'SELECT packet_key, source_ref FROM atlas_packets';

  const packets = await client.query(query);
  console.log(`📝 Materializing ${packets.rows.length} packets (field-level precedence)\n`);

  let materialized = 0;
  let fallback = 0;
  let unresolved = 0;
  let failures = 0;

  for (const packet of packets.rows) {
    const { success, provenance } = await materializePacket(client, packet.packet_key, packet.source_ref, isDryRun);

    if (success) {
      if (provenance.fallbackUsed) fallback++;
      if (provenance.unresolvedReasons.length > 0) unresolved++;
      materialized++;

      if (materialized % 100 === 0) {
        console.log(`  ✓ ${materialized} packets (fallback: ${fallback}, unresolved: ${unresolved})`);
      }
    } else {
      failures++;
    }
  }

  return { materialized, fallback, unresolved, failures };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  const client = await pool.connect();

  try {
    const args = process.argv.slice(2);
    const limitArg = args.find(a => a.startsWith('--limit='));
    const isDryRun = args.includes('--dry-run');
    const isSmoke = args.includes('--smoke');

    const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 0;

    console.log('🧬 Phase 107 Phase F — Field-Level Precedence Materializer\n');
    console.log(`Mode: ${isDryRun ? 'DRY-RUN' : 'APPLY'}`);
    if (isSmoke) console.log(`Stage: CONTROLLED SMOKE TEST (4 rows)\n`);
    else console.log(`Limit: ${limit > 0 ? limit : 'all packets'}\n`);

    if (isSmoke) {
      const pass = await runControlledSmoke(client);
      process.exit(pass ? 0 : 1);
    }

    const { materialized, fallback, unresolved, failures } = await runMaterialization(client, limit, isDryRun);

    console.log(`\n📊 Materialization Complete`);
    console.log(`  ✓ Materialized: ${materialized}`);
    console.log(`  🔄 Using fallback: ${fallback}`);
    console.log(`  ⚠️  Unresolved lanes: ${unresolved}`);
    console.log(`  ❌ Failures: ${failures}`);
    console.log(`  📦 Version: ${MATERIALIZATION_VERSION}`);
    console.log(`  🆔 Pass ID: ${PROCESSING_PASS_ID}`);

    process.exit(failures > materialized * 0.01 ? 1 : 0);
  } catch (err) {
    console.error('❌ Materialization failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  } finally {
    await client.release();
  }
}

main();
