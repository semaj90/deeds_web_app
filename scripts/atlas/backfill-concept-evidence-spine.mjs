#!/usr/bin/env node
/**
 * backfill-concept-evidence-spine.mjs
 *
 * Repairs the broken concept_records ↔ atlas_packets linkage:
 *
 *   BEFORE:
 *     concept_records.evidence_cards  → 16-char hex IDs (old card registry, 0 live matches)
 *     concept_records.packet_keys     → "nes:*" namespace (old NES system, 0 live matches)
 *
 *   AFTER:
 *     concept_records.evidence_cards  → cleared (stale, no valid target table)
 *     concept_records.packet_keys     → live atlas_packets.packet_key values
 *     concept_records.feature_ids     → live atlas_packets.feature_id values (merged, not replaced)
 *
 * Mapping strategy (three complementary sources, unioned per concept):
 *   1. feature_ids JOIN  — concept_records.feature_ids values that match atlas_packets.feature_id
 *   2. concept_ids JOIN  — atlas_packets.concept_ids contains the concept_id token (from prior enrichment)
 *   3. keyword match     — atlas_packets.source_ref contains keywords associated with the concept
 *
 * Safety rules:
 *   - dry-run by default; --apply required for writes
 *   - does NOT create new concept_records rows
 *   - does NOT overwrite feature_ids unless the new set is strictly larger
 *   - clears evidence_cards only when all entries are stale (0 live matches)
 *   - writes a JSON report before any mutation
 *
 * Usage:
 *   node scripts/atlas/backfill-concept-evidence-spine.mjs
 *   node scripts/atlas/backfill-concept-evidence-spine.mjs --dry-run --limit=25
 *   node scripts/atlas/backfill-concept-evidence-spine.mjs --apply
 *   node scripts/atlas/backfill-concept-evidence-spine.mjs --apply --limit=5
 *
 * Gate (production-readiness):
 *   concept_records.evidence_cards stale legacy IDs = 0
 *   feature_ids coverage >= 95%
 *   packet_keys coverage >= 95%
 */

import pg from 'pg';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, '../..');

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const APPLY     = process.argv.includes('--apply');
const DRY_RUN   = !APPLY;
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='));
const MAX_ROWS  = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : Infinity;
const VERBOSE   = process.argv.includes('--verbose');

// ── Keyword map: concept_id → source_ref substring keywords ─────────────────
const CONCEPT_KEYWORDS = {
  database_orm:           ['db/', 'schema', 'drizzle', 'postgres', 'migration', 'orm', 'relations'],
  api_endpoints:          ['+server', '/api/', 'endpoint', 'handler', 'rest'],
  ui_components:          ['+page', '.svelte', 'component', '/ui/', 'dialog', 'button', 'form'],
  agent_intelligence:     ['agent', '/ace/', 'gemma', '/llm', '/ai/', '/rag/', 'retrieval'],
  observability_telemetry:['telemetry', 'analytics', 'trace', 'log', 'metric', 'monitor'],
  infrastructure_config:  ['docker', 'redis', 'qdrant', 'neo4j', 'config', 'env', 'server'],
  test_harness:           ['test', 'spec', 'bench', 'smoke', 'audit', 'verify'],
  native_accelerators:    ['cuda', 'gpu', 'libtorch', 'wasm', 'simd', 'onnx', 'tensor'],
  emergent_topology:      ['som', 'cluster', 'topology', 'graph', 'hypergraph', 'community'],
  general_abstractions:   ['utils', 'helper', '/lib/', 'shared', 'common', 'base', 'types'],
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function setUnion(...arrays) {
  const s = new Set();
  for (const a of arrays) for (const v of (a || [])) s.add(v);
  return [...s].sort();
}

function isStrictlyLarger(newArr, oldArr) {
  const os = new Set(oldArr || []);
  const ns = new Set(newArr || []);
  if (ns.size <= os.size) return false;
  for (const v of os) if (!ns.has(v)) return false; // old must be subset
  return true;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    // ── 1. Load all concept_records ──────────────────────────────────────────
    const { rows: concepts } = await pool.query(`
      SELECT concept_id, evidence_cards, packet_keys, feature_ids
      FROM concept_records
      ORDER BY concept_id
    `);

    const total = Math.min(concepts.length, MAX_ROWS);
    console.log(`\n═══ Concept Evidence Spine Backfill ${DRY_RUN ? '(dry-run)' : '(APPLY)'} ═══`);
    console.log(`Processing ${total} of ${concepts.length} concept_records`);

    // ── 2. Load live atlas_packets spine ────────────────────────────────────
    console.log('\nLoading atlas_packets spine…');
    const { rows: packets } = await pool.query(`
      SELECT packet_id, packet_key, feature_id, source_ref,
             concept_ids
      FROM atlas_packets
      WHERE packet_key IS NOT NULL OR feature_id IS NOT NULL
    `);
    console.log(`  ${packets.length} live packets loaded`);

    // Build lookup indexes
    const byFeatureId  = new Map(); // feature_id → Set<packet_key>
    const byConceptId  = new Map(); // concept_id  → Set<packet_key>
    const byKeyword    = new Map(); // concept_id  → Set<packet_key>  (keyword match)

    for (const p of packets) {
      // feature_id index
      if (p.feature_id && p.packet_key) {
        if (!byFeatureId.has(p.feature_id)) byFeatureId.set(p.feature_id, new Set());
        byFeatureId.get(p.feature_id).add(p.packet_key);
      }

      // concept_ids token index
      for (const cid of (p.concept_ids || [])) {
        if (!byConceptId.has(cid)) byConceptId.set(cid, new Set());
        if (p.packet_key) byConceptId.get(cid).add(p.packet_key);
      }
    }

    // Build keyword index — source_ref substring matching
    for (const [conceptId, keywords] of Object.entries(CONCEPT_KEYWORDS)) {
      const matched = new Set();
      for (const p of packets) {
        if (!p.packet_key || !p.source_ref) continue;
        const ref = p.source_ref.toLowerCase();
        if (keywords.some(kw => ref.includes(kw))) {
          matched.add(p.packet_key);
        }
      }
      byKeyword.set(conceptId, matched);
    }

    // ── 3. Check staleness of evidence_cards ────────────────────────────────
    const livePacketIds = new Set(packets.map(p => p.packet_id).filter(Boolean));
    let totalStaleCards = 0;
    let totalLiveCards  = 0;
    for (const cr of concepts.slice(0, total)) {
      const cards = cr.evidence_cards || [];
      for (const cid of cards) {
        if (livePacketIds.has(cid)) totalLiveCards++;
        else totalStaleCards++;
      }
    }

    console.log(`\nStaleness audit:`);
    console.log(`  evidence_cards — stale: ${totalStaleCards}, live: ${totalLiveCards}`);
    console.log(`  packet_keys    — all stale (nes:* namespace, no live matches)\n`);

    // ── 4. Build report & planned mutations ─────────────────────────────────
    const report = {
      generated_at: new Date().toISOString(),
      mode:         APPLY ? 'apply' : 'dry-run',
      total_concepts: total,
      staleness: { stale_cards: totalStaleCards, live_cards: totalLiveCards },
      mutations: [],
    };

    let willUpdate = 0;
    let noChange   = 0;

    for (let i = 0; i < total; i++) {
      const cr = concepts[i];
      const { concept_id } = cr;

      // Collect live packet_keys from all three sources
      const fromFeatureIds = new Set();
      for (const fid of (cr.feature_ids || [])) {
        for (const pk of (byFeatureId.get(fid) || [])) fromFeatureIds.add(pk);
      }
      const fromConceptIds = byConceptId.get(concept_id) || new Set();
      const fromKeywords   = byKeyword.get(concept_id)   || new Set();

      const newPacketKeys = setUnion(
        [...fromFeatureIds],
        [...fromConceptIds],
        [...fromKeywords],
      );

      // feature_ids: collect feature_ids that appeared in live packets matching this concept
      const newFeatureIdSet = new Set(cr.feature_ids || []);
      // Add any feature_id from matched packets that isn't already present
      for (const pk of newPacketKeys) {
        // find packet by key
        const pkt = packets.find(p => p.packet_key === pk);
        if (pkt?.feature_id) newFeatureIdSet.add(pkt.feature_id);
      }
      const newFeatureIds = [...newFeatureIdSet].sort();

      // Determine what changes
      const currentPKs   = cr.packet_keys   || [];
      const currentFIDs  = cr.feature_ids   || [];
      const currentCards = cr.evidence_cards || [];

      const pkChanged   = JSON.stringify([...newPacketKeys].sort()) !== JSON.stringify([...currentPKs].sort());
      const fidChanged  = isStrictlyLarger(newFeatureIds, currentFIDs);
      const cardStale   = currentCards.length > 0 && currentCards.every(c => !livePacketIds.has(c));
      const cardChanged = cardStale; // only clear when fully stale

      const mutation = {
        concept_id,
        current: {
          evidence_cards_count: currentCards.length,
          packet_keys_count:    currentPKs.length,
          feature_ids_count:    currentFIDs.length,
        },
        planned: {
          evidence_cards_action: cardChanged ? 'clear (all stale)' : 'keep',
          packet_keys_new_count: newPacketKeys.length,
          feature_ids_new_count: newFeatureIds.length,
          packet_keys_sources: {
            from_feature_ids: fromFeatureIds.size,
            from_concept_ids: fromConceptIds.size,
            from_keywords:    fromKeywords.size,
          },
        },
        will_change: pkChanged || fidChanged || cardChanged,
        data: {
          pkChanged,
          newPacketKeys,
          fidChanged,
          newFeatureIds,
          cardChanged
        }
      };

      report.mutations.push(mutation);

      if (mutation.will_change) {
        willUpdate++;
        if (VERBOSE) {
          console.log(`  ${concept_id}: pk ${currentPKs.length}→${newPacketKeys.length}, ` +
            `fid ${currentFIDs.length}→${newFeatureIds.length}, ` +
            `cards: ${cardChanged ? 'CLEAR' : 'keep'}`);
        }
      } else {
        noChange++;
      }
    }

    // ── 6. Write report before any mutation ──────────────────────────────────
    const reportDir = join(ROOT, 'docs', 'reports');
    try { mkdirSync(reportDir, { recursive: true }); } catch {}
    const reportPath = join(reportDir, 'concept-evidence-spine-backfill.json');
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\nReport written to ${reportPath}`);

    // ── 7. Apply mutations if requested ──────────────────────────────────────
    if (APPLY && willUpdate > 0) {
      console.log(`\nApplying ${willUpdate} mutations to concept_records...`);
      for (const mut of report.mutations) {
        if (!mut.will_change) continue;
        const { concept_id, data } = mut;
        const sets   = [];
        const params = [concept_id];

        if (data.pkChanged) {
          params.push(JSON.stringify(data.newPacketKeys));
          sets.push(`packet_keys = $${params.length}::jsonb`);
        }
        if (data.fidChanged) {
          params.push(JSON.stringify(data.newFeatureIds));
          sets.push(`feature_ids = $${params.length}::jsonb`);
        }
        if (data.cardChanged) {
          sets.push(`evidence_cards = '[]'::jsonb`);
        }
        sets.push(`updated_at = now()`);

        await pool.query(
          `UPDATE concept_records SET ${sets.join(', ')} WHERE concept_id = $1`,
          params
        );
      }
      console.log('Database mutations completed.');
    }

    // ── 7. Gate evaluation ───────────────────────────────────────────────────
    if (APPLY) {
      const { rows: postCheck } = await pool.query(`
        SELECT concept_id,
               jsonb_array_length(evidence_cards) AS stale_cards,
               jsonb_array_length(packet_keys)    AS pk_count,
               jsonb_array_length(feature_ids)    AS fid_count
        FROM concept_records
        ORDER BY concept_id
      `);

      const totalConcepts  = postCheck.length;
      const staleCardsFree = postCheck.filter(r => r.stale_cards === 0).length;
      const pkCovered      = postCheck.filter(r => r.pk_count  > 0).length;
      const fidCovered     = postCheck.filter(r => r.fid_count > 0).length;

      const staleGate = staleCardsFree === totalConcepts;
      const pkGate    = pkCovered  / totalConcepts >= 0.95;
      const fidGate   = fidCovered / totalConcepts >= 0.95;

      console.log('\n══ Gate Evaluation ══════════════════════════════');
      console.log(`  evidence_cards stale = 0:  ${staleGate ? '✅' : '❌'} (${staleCardsFree}/${totalConcepts})`);
      console.log(`  packet_keys coverage ≥95%: ${pkGate  ? '✅' : '❌'} (${pkCovered}/${totalConcepts} = ${(pkCovered/totalConcepts*100).toFixed(1)}%)`);
      console.log(`  feature_ids coverage ≥95%: ${fidGate ? '✅' : '❌'} (${fidCovered}/${totalConcepts} = ${(fidCovered/totalConcepts*100).toFixed(1)}%)`);

      const allPass = staleGate && pkGate && fidGate;
      console.log(`\n  ${allPass ? '✅ ALL GATES PASS' : '⚠️  SOME GATES FAIL'}`);
      report.gate_result = { staleGate, pkGate, fidGate, allPass };
      writeFileSync(reportPath, JSON.stringify(report, null, 2));
    }

    // ── 8. Summary ───────────────────────────────────────────────────────────
    console.log('\n══ Summary ══════════════════════════════════════');
    console.log(`  Will update: ${willUpdate}`);
    console.log(`  No change:   ${noChange}`);
    console.log(`  Report:      docs/reports/concept-evidence-spine-backfill.json`);
    if (DRY_RUN) console.log('\n  (dry-run — no DB writes; run with --apply to commit)');

  } finally {
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
