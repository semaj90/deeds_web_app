#!/usr/bin/env node
import path from 'node:path';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const inputPath = path.join(repoRoot, '.tmp', 'atlas-sparse-relevance-annotation-template.jsonl');
const outputPath = path.join(repoRoot, '.tmp', 'atlas-sparse-relevance-annotation-validation.json');

const report = {
  schema: 'atlas-sparse-relevance-annotation-validation-v1',
  status: 'BLOCKED_REVIEW_PENDING',
  input_path: inputPath,
  rows: 0,
  reviewed_rows: 0,
  valid_rows: 0,
  duplicate_identity_count: 0,
  diagnostics: [],
  labels_invented: false,
  canonicalWrites: false,
  qdrantWrites: false,
  postgresWrites: false,
  valkeyWrites: false,
};

if (!existsSync(inputPath)) {
  report.status = 'BLOCKED_INPUT_MISSING';
  report.diagnostics.push('Annotation template does not exist.');
} else {
  const rows = readFileSync(inputPath, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  report.rows = rows.length;
  for (const row of rows) {
    const packetKeys = Array.isArray(row.relevant_packet_keys) ? row.relevant_packet_keys.filter((value) => typeof value === 'string' && value.trim()) : [];
    const sourceRefs = Array.isArray(row.relevant_source_refs) ? row.relevant_source_refs.filter((value) => typeof value === 'string' && value.trim()) : [];
    const reviewed = row.annotation_status === 'REVIEWED';
    if (reviewed) report.reviewed_rows += 1;
    if (!reviewed) continue;
    if (packetKeys.length === 0 && sourceRefs.length === 0) {
      report.diagnostics.push(`Reviewed query ${row.query_id} has no packet or source judgment.`);
      continue;
    }
    let rowValid = true;
    const identities = new Set();
    for (const identity of [...packetKeys.map((value) => `packet:${value}`), ...sourceRefs.map((value) => `source:${value}`)]) {
      if (identities.has(identity)) {
        report.duplicate_identity_count += 1;
        rowValid = false;
      }
      identities.add(identity);
    }
    if (rowValid) report.valid_rows += 1;
  }
  if (report.reviewed_rows === rows.length && report.valid_rows === rows.length && report.duplicate_identity_count === 0) {
    report.status = 'ANNOTATIONS_VALIDATED_FOR_EXECUTOR';
  } else {
    report.diagnostics.push(`${rows.length - report.reviewed_rows} row(s) remain NEEDS_HUMAN_REVIEW.`);
  }
}

mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...report, output_path: outputPath }, null, 2));
