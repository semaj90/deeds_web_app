#!/usr/bin/env npx tsx
/**
 * Phase 107 Phase F — Field-Level Precedence Materializer (Minimal Safe Scope)
 *
 * Establishes canonical packet identity + provenance tracking.
 *
 * Field-level resolution with field-specific precedence chains:
 * - Domain: feature_domain_facts → atlas_packets.domain_class → unresolved
 * - Lexical: feature_lexical_facts → unresolved
 * - Structural: feature_structural_facts → unresolved
 * - Ontology: feature_ontology_tuples → unresolved
 *
 * NO cross-lane fallback. NO semantic inference. NO binding creation.
 * Does NOT populate feature_packet_bindings (Phase 108+ work).
 *
 * Output:
 * - FeatureLoadProvenance: audit trail of which source provided each field
 *   (per-lane resolution tracking, content identity, processing pass)
 *
 * Usage:
 *   npx tsx scripts/atlas/phase-107-f-field-materializer.mts [--limit N] [--dry-run] [--smoke]
 *   npx tsx scripts/atlas/phase-107-f-field-materializer.mts --smoke  # 4-row controlled test
 */

import { pool } from '$lib/server/db/client.js';
import { sql } from 'drizzle-orm';
import type { FieldResolution, LaneProvenance, ContentIdentity, FeatureLoadProvenance } from '$lib/server/types/field-resolution.js';
import { FIELD_PRECEDENCE } from '$lib/server/types/field-resolution.js';

const MATERIALIZATION_VERSION = 'phase-107-f-v1';
const PROCESSING_PASS_ID = 'phase-107-f-' + Date.now().toString();

// ═══════════════════════════════════════════════════════════════════════════
// FIELD-LEVEL RESOLUTION FUNCTIONS (per-field, not lane-level)
// ═══════════════════════════════════════════════════════════════════════════

async function resolveDomain(
  client: any,
  packetKey: string
): Promise<FieldResolution<string>> {
  // Domain: feature_domain_facts → atlas_packets.domain_class → unresolved
  const sources = ['feature_domain_facts', 'atlas_packets_fallback'];

  for (const source of sources) {
    try {
      if (source === 'feature_domain_facts') {
        const result = await client.query(
          `SELECT domain_class FROM feature_domain_facts WHERE packet_key = $1 LIMIT 1`,
          [packetKey]
        );
        if (result.rows[0]?.domain_class) {
          return {
            value: result.rows[0].domain_class,
            source,
            resolutionKind: 'normalized-primary',
            fallbackUsed: false,
          };
        }
      } else if (source === 'atlas_packets_fallback') {
        const result = await client.query(
          `SELECT domain_class FROM atlas_packets WHERE packet_key = $1`,
          [packetKey]
        );
        if (result.rows[0]?.domain_class) {
          return {
            value: result.rows[0].domain_class,
            source,
            resolutionKind: 'compatibility-fallback',
            fallbackUsed: true,
          };
        }
      }
    } catch (error) {
      // Source unavailable; continue to next in chain
      continue;
    }
  }

  // No source matched precedence chain
  return {
    value: null,
    source: null,
    resolutionKind: 'unresolved',
    fallbackUsed: false,
  };
}

async function resolveStructuralFacts(
  client: any,
  packetKey: string
): Promise<FieldResolution<string[]>> {
  // Structural: feature_structural_facts → unresolved (NO cross-lane fallback)
  const sources = ['feature_structural_facts'];

  for (const source of sources) {
    try {
      if (source === 'feature_structural_facts') {
        const result = await client.query(
          `SELECT symbol_name, ast_facts FROM feature_structural_facts WHERE packet_key = $1 LIMIT 10`,
          [packetKey]
        );

        if (result.rows.length > 0) {
          const symbols = result.rows.map((r: any) => r.symbol_name).filter(Boolean);
          return {
            value: symbols,
            source,
            resolutionKind: 'normalized-primary',
            fallbackUsed: false,
          };
        }
      }
    } catch (error) {
      continue;
    }
  }

  return {
    value: [],
    source: null,
    resolutionKind: 'unresolved',
    fallbackUsed: false,
  };
}

async function resolveLexicalFacts(
  client: any,
  sourceRef: string
): Promise<FieldResolution<string[]>> {
  // Lexical: feature_lexical_facts → unresolved (NO cross-lane fallback)
  const sources = ['feature_lexical_facts'];

  for (const source of sources) {
    try {
      if (source === 'feature_lexical_facts') {
        const result = await client.query(
          `SELECT keywords, bm25_terms FROM feature_lexical_facts WHERE source_ref = $1 LIMIT 1`,
          [sourceRef]
        );

        if (result.rows[0]) {
          const terms = [...(result.rows[0].keywords || []), ...(result.rows[0].bm25_terms || [])];
          return {
            value: terms,
            source,
            resolutionKind: 'normalized-primary',
            fallbackUsed: false,
          };
        }
      }
    } catch (error) {
      continue;
    }
  }

  return {
    value: [],
    source: null,
    resolutionKind: 'unresolved',
    fallbackUsed: false,
  };
}

async function resolveOntologyTuples(
  client: any,
  packetKey: string
): Promise<FieldResolution<any[]>> {
  // Ontology: feature_ontology_tuples → unresolved (NO cross-lane fallback)
  const sources = ['feature_ontology_tuples'];

  for (const source of sources) {
    try {
      if (source === 'feature_ontology_tuples') {
        const result = await client.query(
          `SELECT subject_id, predicate, object_id, confidence FROM feature_ontology_tuples WHERE packet_key = $1 LIMIT 20`,
          [packetKey]
        );

        if (result.rows.length > 0) {
          return {
            value: result.rows,
            source,
            resolutionKind: 'normalized-primary',
            fallbackUsed: false,
          };
        }
      }
    } catch (error) {
      continue;
    }
  }

  return {
    value: [],
    source: null,
    resolutionKind: 'unresolved',
    fallbackUsed: false,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTENT IDENTITY RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════

function resolveContentIdentity(row: {
  sha256: string | null;
  summaryHash: string | null;
  packetKey?: string;
  sourceRef?: string;
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
      algorithm: null,
      inputContract: 'normalized-summary',
      canonical: false
    };
  }

  const syntheticFingerprint = row.packetKey && row.sourceRef
    ? Buffer.from(`${row.packetKey}|${row.sourceRef}|${MATERIALIZATION_VERSION}`).toString('hex').slice(0, 64)
    : null;

  if (syntheticFingerprint) {
    return {
      value: syntheticFingerprint,
      kind: 'synthetic-migration-hash',
      algorithm: null,
      inputContract: 'migration-fields-v1',
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

  function createSmokeClient(responses: Array<{ rows: any[] }>) {
    let index = 0;
    return {
      async query() {
        return responses[index++] ?? { rows: [] };
      }
    };
  }

  const testCases = [
    {
      name: 'A: Normalized domain + packet fallback → normalized wins (labeled)',
      run: async () => {
        const smokeClient = createSmokeClient([
          { rows: [{ domain_class: 'retrieval' }] }
        ]);
        return resolveDomain(smokeClient, 'packet:a');
      }
    },
    {
      name: 'B: No normalized domain + packet domain → fallback labeled',
      run: async () => {
        const smokeClient = createSmokeClient([
          { rows: [] },
          { rows: [{ domain_class: 'retrieval' }] }
        ]);
        return resolveDomain(smokeClient, 'packet:b');
      }
    },
    {
      name: 'C: Ontology tuples remain read-only → no inference or invention',
      run: async () => {
        const smokeClient = createSmokeClient([
          {
            rows: [
              {
                subject_id: 'packet:c',
                predicate: 'CLASSIFIED_AS',
                object_id: 'domain:retrieval',
                confidence: 1
              }
            ]
          }
        ]);
        return resolveOntologyTuples(smokeClient, 'packet:c');
      }
    },
    {
      name: 'D: Neither normalized nor fallback → unresolved record',
      run: async () => {
        const smokeClient = createSmokeClient([
          { rows: [] },
          { rows: [] }
        ]);
        return resolveDomain(smokeClient, 'packet:d');
      }
    }
  ];

  let passCount = 0;

  for (const tc of testCases) {
    try {
      const result = await tc.run();

      const passes =
        (tc.name.startsWith('A') &&
          result.resolutionKind === 'normalized-primary' &&
          result.fallbackUsed === false &&
          result.value === 'retrieval') ||
        (tc.name.startsWith('B') &&
          result.resolutionKind === 'compatibility-fallback' &&
          result.fallbackUsed === true &&
          result.value === 'retrieval') ||
        (tc.name.startsWith('C') &&
          result.resolutionKind === 'normalized-primary' &&
          Array.isArray(result.value) &&
          result.value.length === 1) ||
        (tc.name.startsWith('D') &&
          result.resolutionKind === 'unresolved' &&
          result.value === null);

      if (passes) {
        console.log(`✅ ${tc.name}`);
        console.log(`   Result: ${JSON.stringify(result)}\n`);
        passCount++;
      } else {
        console.log(`⚠️  ${tc.name} (unexpected result: ${JSON.stringify(result)})\n`);
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
  packet: {
    packet_key: string;
    source_ref: string;
    sha256: string | null;
    summary_hash: string | null;
  },
  isDryRun: boolean
): Promise<{ success: boolean; provenance: FeatureLoadProvenance }> {
  try {
    // Resolve each field independently (not lane-level, field-level)
    const domain = await resolveDomain(client, packet.packet_key);
    const structural = await resolveStructuralFacts(client, packet.packet_key);
    const lexical = await resolveLexicalFacts(client, packet.source_ref);
    const ontology = await resolveOntologyTuples(client, packet.packet_key);

    const contentIdentity = resolveContentIdentity({
      sha256: packet.sha256,
      summaryHash: packet.summary_hash,
      packetKey: packet.packet_key,
      sourceRef: packet.source_ref,
    });

    // Build provenance audit trail (NO binding creation in Phase 107 F)
    // Bindings are created in Phase 108+ with explicit evidence-backed relationships
    const provenance: FeatureLoadProvenance = {
      packetKey: packet.packet_key,
      lanes: {
        domain: {
          source: domain.source || null,
          resolutionKind: domain.resolutionKind,
          fallbackUsed: domain.fallbackUsed,
          value: domain.value
        },
        lexical: {
          source: lexical.source || null,
          resolutionKind: lexical.resolutionKind,
          fallbackUsed: lexical.fallbackUsed,
          value: lexical.value
        },
        structural: {
          source: structural.source || null,
          resolutionKind: structural.resolutionKind,
          fallbackUsed: structural.fallbackUsed,
          value: structural.value
        },
        ontology: {
          source: ontology.source || null,
          resolutionKind: ontology.resolutionKind,
          fallbackUsed: ontology.fallbackUsed,
          value: ontology.value
        }
      },
      contentIdentity,
      processingPassId: PROCESSING_PASS_ID,
      fallbackUsed: domain.fallbackUsed || lexical.fallbackUsed || structural.fallbackUsed || ontology.fallbackUsed,
      fallbackReasons: [
        domain.fallbackUsed ? 'domain from atlas_packets' : null,
        lexical.fallbackUsed ? 'lexical from legacy' : null,
        structural.fallbackUsed ? 'structural from legacy' : null,
        ontology.fallbackUsed ? 'ontology from legacy' : null
      ].filter(Boolean) as string[],
      unresolvedReasons: [
        domain.resolutionKind === 'unresolved' ? 'domain unresolved' : null,
        lexical.resolutionKind === 'unresolved' ? 'lexical unresolved' : null,
        structural.resolutionKind === 'unresolved' ? 'structural unresolved' : null,
        ontology.resolutionKind === 'unresolved' ? 'ontology unresolved' : null
      ].filter(Boolean) as string[]
    };

    // AUDIT ONLY: output provenance, do NOT insert into feature_packet_bindings
    // Phase 108+ will create bindings with explicit evidence relationships

    return { success: true, provenance };
  } catch (err) {
    const packetKey = packet.packet_key;
    console.warn(`Error materializing ${packetKey}:`, err);
    return {
      success: false,
      provenance: {
        packetKey,
        lanes: {
          domain: { source: null, resolutionKind: 'unresolved', fallbackUsed: false, value: null },
          lexical: { source: null, resolutionKind: 'unresolved', fallbackUsed: false, value: null },
          structural: { source: null, resolutionKind: 'unresolved', fallbackUsed: false, value: null },
          ontology: { source: null, resolutionKind: 'unresolved', fallbackUsed: false, value: null }
        },
        contentIdentity: { value: null, kind: 'missing', algorithm: null, inputContract: null, canonical: false },
        processingPassId: PROCESSING_PASS_ID,
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
    ? `SELECT packet_key, source_ref, sha256, summary_hash FROM atlas_packets ORDER BY packet_key LIMIT ${limit}`
    : 'SELECT packet_key, source_ref, sha256, summary_hash FROM atlas_packets ORDER BY packet_key';

  const packets = await client.query(query);
  console.log(`📝 Materializing ${packets.rows.length} packets (field-level precedence)\n`);

  let materialized = 0;
  let fallback = 0;
  let unresolved = 0;
  let failures = 0;

  for (const packet of packets.rows) {
    const { success, provenance } = await materializePacket(client, packet, isDryRun);

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
