#!/usr/bin/env node

/** RWC-CENSUS-03: bounded, read-only replay of existing fusion callers. */
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reciprocalRankFusion } from '../../sveltekit-frontend/src/lib/server/retrieval/rrf-fuse.ts';
import { fuseSearchRuntimeCandidates } from '../../sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts';
import { projectRrfLanesToContributions } from '../../sveltekit-frontend/src/lib/server/retrieval/fusion-contribution-adapters.ts';
import { fuseContributionsV1 } from '../../sveltekit-frontend/src/lib/server/retrieval/fusion-core-v1.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const REPORT = resolve(ROOT, 'docs/reports/rrf-bounded-caller-replay-v1.json');
const checksum = (value: unknown) => `sha256:${createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`;
const hits = [
  { packetKey: 'packet-a', id: 'packet-a', sourceRef: 'src/a.ts', score: 0.9, rank: 1, identityStatus: 'canonical' as const, sourceRevision: 'sha256:a', workspaceRevision: null },
  { packetKey: 'packet-b', id: 'packet-b', sourceRef: 'src/b.ts', score: 0.8, rank: 2, identityStatus: 'canonical' as const, sourceRevision: 'sha256:b', workspaceRevision: null },
  { packetKey: 'packet-c', id: 'packet-c', sourceRef: 'src/c.ts', score: 0.7, rank: 3, identityStatus: 'canonical' as const, sourceRevision: 'sha256:c', workspaceRevision: null },
];
const dense = hits.map((hit, index) => ({ ...hit, rank: index + 1, retrievalExecutor: index === 0 ? 'qdrant' : 'cuvs' }));
const lexical = [hits[1], hits[0], hits[2]].map((hit, index) => ({ ...hit, rank: index + 1, score: 0.9 - index * 0.1, retrievalExecutor: 'postgres' }));
const legacy = reciprocalRankFusion([
  { lane: 'dense_768', hits: dense },
  { lane: 'bm42', hits: lexical },
], { dense_768: 1, bm42: 1 }, 60, 10);
const runtime = fuseSearchRuntimeCandidates([...dense.map((hit) => ({ ...hit, scoreSource: 'qdrant' as const, packetKey: hit.packetKey, summary: '', content: '', id: hit.id })), ...lexical.map((hit) => ({ ...hit, scoreSource: 'bm42' as const, packetKey: hit.packetKey, summary: '', content: '', id: hit.id }))]);
const legacyOrder = legacy.map((candidate) => candidate.packetKey);
const runtimeOrder = runtime.map((candidate) => candidate.packetKey);
const rankOrderEqual = JSON.stringify(legacyOrder) === JSON.stringify(runtimeOrder);
const weightedLanes = [
  { lane: 'dense_768', weight: 0.75, hits: dense },
  { lane: 'bm42', weight: 0.25, hits: lexical },
];
const weightedLegacy = reciprocalRankFusion(weightedLanes, { dense_768: 0.75, bm42: 0.25 }, 60, 10);
const weightedCore = fuseContributionsV1(projectRrfLanesToContributions(weightedLanes), { k: 60 });
const weightedLegacyScores = new Map(weightedLegacy.map((candidate) => [candidate.packetKey, candidate.fusionScore]));
const weightedArithmeticEqual = weightedCore.every((candidate) => Math.abs((weightedLegacyScores.get(candidate.canonicalId) ?? NaN) - candidate.fusionScore) < 1e-12);
const report = {
  schema: 'atlas.rrf-bounded-caller-replay.v1', generatedAt: new Date().toISOString(), mode: 'READ_ONLY',
  status: rankOrderEqual ? 'CALLER_REPLAY_ORDER_MATCH_PARTIAL' : 'CALLER_REPLAY_ORDER_MISMATCH',
  proofLevel: 'FIXTURE_PROVEN', authority: false, migrationAuthorized: false, writesPerformed: false, workspaceRevision: null,
  callers: [
    { caller: 'rrf-fuse.ts::reciprocalRankFusion', owner: 'LEGACY_COMPATIBILITY', weightPolicy: 'explicit unit weights', outputChecksum: checksum(legacyOrder), order: legacyOrder },
    { caller: 'search-runtime.ts::fuseSearchRuntimeCandidates', owner: 'SearchRuntime', weightPolicy: 'canonical unweighted RRF', outputChecksum: checksum(runtimeOrder), order: runtimeOrder },
  ],
  fixture: { candidateCount: hits.length, logicalLanes: ['dense', 'bm42'], executors: ['qdrant', 'cuvs', 'postgres'], k: 60 },
  parity: { rankOrderEqual, weightedArithmeticEqual, legacyTop: legacyOrder[0] ?? null, runtimeTop: runtimeOrder[0] ?? null, arithmeticComparable: weightedArithmeticEqual, identityEnvelopeComparable: false },
  blockers: ['FIXTURE_ONLY_NOT_LIVE', 'IDENTITY_ENVELOPE_PARITY_NOT_PROVEN', 'RUNTIME_CONSOLIDATION_NOT_AUTHORIZED'],
  nextGate: 'RWC-CENSUS-04_REAL_CALLER_BASELINE_REPLAY', safeNextCommand: 'npm run atlas:rrf:caller-replay',
};
await mkdir(dirname(REPORT), { recursive: true });
await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ schema: report.schema, status: report.status, rankOrderEqual, authority: false, migrationAuthorized: false, writesPerformed: false, reportPath: REPORT }, null, 2));
