#!/usr/bin/env node
import path from 'node:path';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const inputPath = path.join(repoRoot, '.tmp', 'atlas-sparse-relevance-candidate-proposals.jsonl');
const outputPath = path.join(repoRoot, '.tmp', 'atlas-sparse-relevance-proposal-audit.json');

const report = {
  schema: 'atlas-sparse-relevance-proposal-audit-v1',
  status: 'PROPOSALS_NOT_GROUND_TRUTH',
  input_path: inputPath,
  query_count: 0,
  candidate_count: 0,
  unique_packet_key_count: 0,
  unique_source_ref_count: 0,
  missing_packet_key_count: 0,
  duplicate_packet_key_count: 0,
  duplicate_source_ref_count: 0,
  per_query: [],
  diagnostics: [],
  canonicalWrites: false,
  qdrantWrites: false,
  postgresWrites: false,
  valkeyWrites: false,
};

if (!existsSync(inputPath)) {
  report.status = 'BLOCKED_INPUT_MISSING';
  report.diagnostics.push('Candidate proposal file is missing.');
} else {
  const rows = readFileSync(inputPath, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  report.query_count = rows.length;
  const packetKeys = [];
  const sourceRefs = [];
  for (const row of rows) {
    const candidates = Array.isArray(row.candidates) ? row.candidates : [];
    const queryPacketKeys = candidates.map((candidate) => candidate.packet_key).filter(Boolean);
    const querySourceRefs = candidates.map((candidate) => candidate.source_ref).filter(Boolean);
    packetKeys.push(...queryPacketKeys);
    sourceRefs.push(...querySourceRefs);
    report.candidate_count += candidates.length;
    report.per_query.push({
      query_id: row.query_id,
      candidate_count: candidates.length,
      packet_key_count: queryPacketKeys.length,
      source_ref_count: querySourceRefs.length,
      missing_packet_key_count: candidates.filter((candidate) => !candidate.packet_key).length,
      proposal_status: 'PROPOSED_NOT_GROUND_TRUTH',
    });
  }
  report.unique_packet_key_count = new Set(packetKeys).size;
  report.unique_source_ref_count = new Set(sourceRefs).size;
  report.missing_packet_key_count = report.candidate_count - packetKeys.length;
  report.duplicate_packet_key_count = packetKeys.length - report.unique_packet_key_count;
  report.duplicate_source_ref_count = sourceRefs.length - report.unique_source_ref_count;
  if (report.missing_packet_key_count > 0) report.diagnostics.push('Some proposals do not have a packet_key and require source-level review.');
  if (report.duplicate_packet_key_count > 0) report.diagnostics.push('Repeated packet keys occur across keyword matches; reviewers must judge per query, not globally.');
}

mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...report, output_path: outputPath }, null, 2));
