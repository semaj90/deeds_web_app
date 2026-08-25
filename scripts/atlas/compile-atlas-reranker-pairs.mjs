#!/usr/bin/env node

/**
 * Compile frozen retrieval envelopes into AtlasReranker pair JSONL.
 *
 * This is an artifact builder, not a trainer. It never writes to Postgres,
 * Qdrant, Valkey, Neo4j, or model storage. Input envelopes must already be
 * revisioned and identity-qualified by an upstream read-only retrieval run.
 *
 * Expected input line:
 * {
 *   queryId, queryRevision, queryText, workspaceRevision,
 *   candidateSnapshotRevision, candidates: [{ candidateText, ...featureRow,
 *     retrievalRank, teacherScore, humanRelevanceGrade, repairSuccess,
 *     testSuccess, exactPromotionOutcome, isHardNegative }]
 * }
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '../..');
const args = new Map();
for (const arg of process.argv.slice(2)) {
  const match = arg.match(/^--([^=]+)=(.*)$/);
  if (match) args.set(match[1], match[2]);
}

const inputPath = args.get('input');
const outputPath = path.resolve(ROOT, args.get('out') ?? 'docs/reports/atlas-reranker-pairs-v1.jsonl');
const reportPath = path.resolve(ROOT, args.get('report') ?? 'docs/reports/atlas-reranker-pairs-v1.json');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function required(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function splitForRevision(value) {
  const bucket = Number.parseInt(sha256(value).slice(0, 8), 16) % 100;
  return bucket < 80 ? 'train' : bucket < 90 ? 'validation' : 'test';
}

function parseJsonl(text) {
  return text.split(/\r?\n/).map((line, index) => {
    if (!line.trim()) return null;
    try { return JSON.parse(line); } catch (error) {
      throw new Error(`ATLAS_RERANKER_INPUT_INVALID_JSON:${index + 1}:${error.message}`);
    }
  }).filter(Boolean);
}

function validateCandidate(candidate, envelope) {
  const checks = [
    ['candidateOrdinal', Number.isInteger(candidate.candidateOrdinal) && candidate.candidateOrdinal >= 0],
    ['packetKey', required(candidate.packetKey)],
    ['sourceRef', required(candidate.sourceRef)],
    ['sourceRevision', required(candidate.sourceRevision)],
    ['candidateSnapshotRevision', required(candidate.candidateSnapshotRevision ?? envelope.candidateSnapshotRevision)],
    ['featureRevision', required(candidate.featureRevision)],
    ['candidateText', required(candidate.candidateText)]
  ];
  return checks.find(([name, ok]) => !ok)?.[0] ?? null;
}

export function compileAtlasRerankerPairs(envelopes) {
  const pairs = [];
  const excluded = {};
  const splitCounts = { train: 0, validation: 0, test: 0 };
  const revisionGroups = new Set();

  const exclude = (reason) => { excluded[reason] = (excluded[reason] ?? 0) + 1; };

  for (const envelope of envelopes) {
    if (!required(envelope.queryId) || !required(envelope.queryRevision) || !required(envelope.queryText)) {
      exclude('INVALID_QUERY_IDENTITY');
      continue;
    }
    if (!Array.isArray(envelope.candidates)) {
      exclude('CANDIDATES_MISSING');
      continue;
    }
    const workspaceRevision = envelope.workspaceRevision ?? envelope.queryRevision;
    const splitKey = `${workspaceRevision}:${envelope.queryRevision}`;
    const split = splitForRevision(splitKey);
    revisionGroups.add(splitKey);

    for (const candidate of envelope.candidates) {
      const reason = validateCandidate(candidate, envelope);
      if (reason) { exclude(`INVALID_${reason.toUpperCase()}`); continue; }
      const candidateSnapshotRevision = candidate.candidateSnapshotRevision ?? envelope.candidateSnapshotRevision;
      if (candidate.sourceRevision !== candidateSnapshotRevision && candidate.stale !== false) {
        exclude('STALE_SOURCE_REVISION');
        continue;
      }
      if (candidate.evidenceKinds?.length === 1 && candidate.evidenceKinds[0] === 'DERIVED_SYNTHESIS') {
        exclude('SYNTHESIS_ONLY_EVIDENCE');
        continue;
      }

      const pair = {
        schema: 'atlas.pair-judgment.v1',
        split,
        queryId: envelope.queryId,
        queryRevision: envelope.queryRevision,
        workspaceRevision,
        queryText: envelope.queryText,
        candidateText: candidate.candidateText,
        retrievalRank: Number.isInteger(candidate.retrievalRank) ? candidate.retrievalRank : 0,
        teacherScore: Number.isFinite(candidate.teacherScore) ? candidate.teacherScore : null,
        humanRelevanceGrade: Number.isInteger(candidate.humanRelevanceGrade) ? candidate.humanRelevanceGrade : null,
        exactPromotionOutcome: typeof candidate.exactPromotionOutcome === 'boolean' ? candidate.exactPromotionOutcome : null,
        repairSuccess: typeof candidate.repairSuccess === 'boolean' ? candidate.repairSuccess : null,
        testSuccess: typeof candidate.testSuccess === 'boolean' ? candidate.testSuccess : null,
        labelRevision: envelope.labelRevision ?? 'labels-unreviewed',
        isHardNegative: candidate.isHardNegative === true,
        candidate: { ...candidate, candidateSnapshotRevision }
      };
      delete pair.candidate.candidateText;
      delete pair.candidate.teacherScore;
      delete pair.candidate.humanRelevanceGrade;
      delete pair.candidate.exactPromotionOutcome;
      delete pair.candidate.repairSuccess;
      delete pair.candidate.testSuccess;
      delete pair.candidate.isHardNegative;
      pairs.push(pair);
      splitCounts[split] += 1;
    }
  }

  return { pairs, excluded, splitCounts, revisionGroupCount: revisionGroups.size };
}

async function main() {
  if (!inputPath) throw new Error('ATLAS_RERANKER_INPUT_REQUIRED: use --input=path/to/retrieval.jsonl');
  const input = path.resolve(ROOT, inputPath);
  const envelopes = parseJsonl(await fs.readFile(input, 'utf8'));
  const result = compileAtlasRerankerPairs(envelopes);
  const jsonl = result.pairs.map((pair) => JSON.stringify(pair)).join('\n') + (result.pairs.length ? '\n' : '');
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, jsonl, 'utf8');

  const report = {
    schema: 'atlas.reranker-pair-compile-receipt.v1',
    status: result.pairs.length ? 'COMPILED_READ_ONLY' : 'EMPTY_INPUT_AFTER_FILTERS',
    inputPath: path.relative(ROOT, input),
    outputPath: path.relative(ROOT, outputPath),
    inputEnvelopeCount: envelopes.length,
    pairCount: result.pairs.length,
    splitCounts: result.splitCounts,
    revisionGroupCount: result.revisionGroupCount,
    excluded: result.excluded,
    artifactChecksum: sha256(jsonl),
    databaseWrites: false,
    vectorWrites: false,
    modelWrites: false,
    promotion: 'BLOCKED_UNTIL_HELD_OUT_EVALUATION'
  };
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 2; });
}
