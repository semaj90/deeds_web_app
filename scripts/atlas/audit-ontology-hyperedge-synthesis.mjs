#!/usr/bin/env node

/**
 * Read-only KAG-HYP audit.
 * Reads ontology tuples from JSONL or OKF chunk envelopes and evaluates the
 * pure Parent Atlas hyperedge synthesizer. It writes only an audit receipt.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { synthesizeOntologyHyperedge } from '../../packages/parent-atlas/dist/index.js';

const ROOT = resolve(import.meta.dirname, '../..');
const inputArg = process.argv.find((value) => value.startsWith('--input='));
const limitArg = process.argv.find((value) => value.startsWith('--limit='));
const inputPath = resolve(ROOT, inputArg?.slice('--input='.length) || process.env.ATLAS_KAG_TUPLES_JSONL || 'docs/.okf/ontology-tuples.jsonl');
const limit = Math.max(1, Number.parseInt(limitArg?.slice('--limit='.length) || '1000', 10) || 1000);
const reportPath = resolve(ROOT, 'docs/reports/kag-hyp-synthesis-audit-v1.json');

const report = {
  schema: 'atlas.kag-hyp-synthesis-audit.v1',
  status: 'SOURCE_UNAVAILABLE',
  input_path: inputPath,
  bounded_limit: limit,
  writes_performed: false,
  canonical_persistence_attempted: false,
  lines_read: 0,
  tuples_seen: 0,
  eligible: 0,
  rejected: 0,
  invalid: 0,
  rejection_counts: {},
  examples: [],
};

function addReason(reason) {
  report.rejection_counts[reason] = (report.rejection_counts[reason] || 0) + 1;
}

function tupleInputs(record) {
  if (record && record.tuple) return [record];
  if (!record || !Array.isArray(record.ontology_tuples)) return [];
  return record.ontology_tuples.map((tuple) => ({
    tuple,
    participant_entity_ids: record.participant_entity_ids || tuple.participant_entity_ids || [],
    source_ref: record.source_ref || record.source_id || 'unknown:source_ref',
    source_revision: record.source_revision || record.source_snapshot_revision || 'unknown:source_revision',
    ontology_revision: record.ontology_revision || record.feature_revision || 'unknown:ontology_revision',
    producer_revision: record.producer_revision || record.ontology_producer_revision || 'unknown:producer_revision',
    evidence_state: record.evidence_state || 'ACTIVE_VERIFIED',
    lifecycle: record.lifecycle || 'ACTIVE',
    relation_revision: record.relation_revision || null,
  }));
}

if (existsSync(inputPath)) {
  const lines = readFileSync(inputPath, 'utf8').split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    if (report.tuples_seen >= limit) break;
    report.lines_read += 1;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      report.invalid += 1;
      continue;
    }
    for (const input of tupleInputs(record)) {
      if (report.tuples_seen >= limit) break;
      report.tuples_seen += 1;
      try {
        const result = synthesizeOntologyHyperedge(input);
        if (result.status === 'ELIGIBLE') {
          report.eligible += 1;
        } else {
          report.rejected += 1;
          for (const reason of result.reasons) addReason(reason);
          if (report.examples.length < 20) report.examples.push({ tuple_id: result.source_tuple_ids[0], status: result.status, reasons: result.reasons });
        }
      } catch (error) {
        report.invalid += 1;
        if (report.examples.length < 20) report.examples.push({ status: 'INVALID_INPUT', message: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  report.status = report.tuples_seen === 0 ? 'NO_TUPLES_FOUND' : 'READ_ONLY_COMPLETE';
}

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
