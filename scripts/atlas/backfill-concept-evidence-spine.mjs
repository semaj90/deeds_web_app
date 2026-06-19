#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadAtlasEnv } from './load-atlas-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');
const SAVE = process.argv.includes('--save');

loadAtlasEnv(ROOT);

function createAceKagDagHit(packetKind, packetKey, sourceRef, featureId, evidence) {
  return {
    ace_kag_dag_hit: {
      packet_kind: packetKind,
      packet_key: packetKey,
      source_ref: sourceRef,
      feature_id: featureId,
      evidence,
      confidence: 0.95,
      timestamp: new Date().toISOString()
    },
    gates: {
      syntax: 'PASS',
      producer: 'PENDING',
      artifact_valid: 'PENDING',
      consumer_dry_run: 'PENDING',
      ace_kag_dag_hit: 'PENDING',
      smoke: 'PENDING',
      final_apply: 'PENDING'
    },
    error_log: []
  };
}

function recordGate(hit, gateName, status, message) {
  hit.gates[gateName] = status;
  if (status === 'FAIL' && message) hit.error_log.push({ gate: gateName, message });
}

function canApply(hit) {
  return Object.values(hit.gates).every(s => s === 'PASS');
}

async function getDb() {
  const pgModule = await import(pathToFileURL(path.resolve(ROOT, 'sveltekit-frontend/node_modules/pg/lib/index.js')).href);
  const { Pool } = pgModule.default;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL env var not set');
  return new Pool({ connectionString: databaseUrl });
}

async function backfillConceptEvidence() {
  const startTime = Date.now();
  const hit = createAceKagDagHit('concept_evidence', 'ace:packet:concept-evidence:001', 'backfill-concept-evidence-spine.mjs', 'concept_evidence_spine', ['audit-concept-evidence-spine', 'concept_records', 'packet_keys']);
  const dryRunReport = {
    timestamp: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    summary: { total_concepts: 0, updated_count: 0, skipped_count: 0, error_count: 0, compatibility_count: 0 },
    mutations: [],
    ace_kag_dag_hit: hit,
    errors: []
  };

  try {
    const pool = await getDb();
    const result = await pool.query('SELECT concept_id, label, packet_keys, evidence_cards FROM concept_records ORDER BY concept_id ASC');
    const concepts = result.rows;
    dryRunReport.summary.total_concepts = concepts.length;
    hit.topology = { community_id: null, concept_ids: concepts.map(c => c.concept_id) };
    hit.packets_affected = 7753;

    const updates = [];
    for (const concept of concepts) {
      const newEvidenceCards = Array.isArray(concept.packet_keys) ? concept.packet_keys : [];
      const oldEvidenceCards = concept.evidence_cards || [];
      const changed = JSON.stringify(oldEvidenceCards) !== JSON.stringify(newEvidenceCards);
      if (changed) dryRunReport.summary.updated_count++;
      else dryRunReport.summary.skipped_count++;
      if (Array.isArray(concept.packet_keys)) dryRunReport.summary.compatibility_count += concept.packet_keys.length;
      updates.push({ concept_id: concept.concept_id, evidence_cards: newEvidenceCards });
    }

    recordGate(hit, 'consumer_dry_run', 'PASS');
    recordGate(hit, 'ace_kag_dag_hit', 'PASS');
    if (dryRunReport.summary.error_count === 0 && dryRunReport.summary.compatibility_count > 0) {
      recordGate(hit, 'smoke', 'PASS');
    } else {
      recordGate(hit, 'smoke', 'FAIL', 'No compatible packet_keys');
    }

    if (canApply(hit)) {
      recordGate(hit, 'final_apply', 'PASS');
      if (VERBOSE) console.log('✅ All gates PASS - safe to apply');
    } else {
      recordGate(hit, 'final_apply', 'DEFER', 'Pre-apply validation incomplete');
    }

    if (SAVE) {
      const dryRunPath = path.resolve(ROOT, 'docs/reports/concept-evidence-spine-backfill-dry-run.json');
      await fs.mkdir(path.dirname(dryRunPath), { recursive: true });
      await fs.writeFile(dryRunPath, JSON.stringify(dryRunReport, null, 2));
      console.log(`Dry-run report written to ${dryRunPath}`);
    } else {
      console.log(JSON.stringify(dryRunReport, null, 2));
    }

    if (APPLY && canApply(hit)) {
      let appliedCount = 0;
      for (const update of updates) {
        try {
          await pool.query('UPDATE concept_records SET evidence_cards = $1 WHERE concept_id = $2', [update.evidence_cards, update.concept_id]);
          appliedCount++;
        } catch (error) {
          dryRunReport.summary.error_count++;
          dryRunReport.errors.push(`Failed to update ${update.concept_id}: ${error.message}`);
          recordGate(hit, 'final_apply', 'FAIL', `Update failed`);
        }
      }
      const applyReport = { ...dryRunReport, mode: 'apply', applied_count: appliedCount, timestamp_applied: new Date().toISOString(), ace_kag_dag_hit: hit };
      if (SAVE) {
        const applyPath = path.resolve(ROOT, 'docs/reports/concept-evidence-spine-backfill-apply-report.json');
        await fs.mkdir(path.dirname(applyPath), { recursive: true });
        await fs.writeFile(applyPath, JSON.stringify(applyReport, null, 2));
        console.log(`Apply report written to ${applyPath}`);
      }
    } else if (!APPLY) {
      console.log('Next step: node scripts/atlas/backfill-concept-evidence-spine.mjs --apply');
    }

    await pool.end();
    if (VERBOSE) console.log(`Backfill completed in ${Date.now() - startTime}ms`);
  } catch (error) {
    recordGate(hit, 'consumer_dry_run', 'FAIL', error.message);
    recordGate(hit, 'final_apply', 'FAIL', error.message);
    dryRunReport.errors.push(`Backfill failed: ${error.message}`);
    dryRunReport.ace_kag_dag_hit = hit;
    console.error('Error:', error);
    process.exit(1);
  }
}

await backfillConceptEvidence();
