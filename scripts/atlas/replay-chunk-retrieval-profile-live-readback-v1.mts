#!/usr/bin/env -S npx tsx
/**
 * RETRIEVAL-PROFILE-LIVE-REPLAY-02/03 -- READ ONLY.
 *
 * Replays a bounded RETRIEVAL-PROFILE-LIVE-READBACK-01 report through the pure
 * ChunkRetrievalProfileV2 adapter. It proves two things without database/service
 * access:
 *
 * 1. provider ordering/duplicate noise in set-like arrays does not change the
 *    profile checksum for identical canonical/revision-qualified evidence;
 * 2. missing feature/source/workspace revisions or evidence refs fail closed
 *    instead of receiving synthesized values.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CHUNK_RETRIEVAL_PROFILE_ADAPTER_V2,
  hydrateChunkRetrievalProfileV2,
  type ChunkRetrievalProfileHydrationInputV2,
} from '../../sveltekit-frontend/src/lib/server/atlas/retrieval/chunk-retrieval-profile-adapter-v2.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const inputArg = process.argv.find((arg) => arg.startsWith('--input='));
const inputPath = path.resolve(
  root,
  inputArg?.slice('--input='.length) || 'docs/reports/chunk-retrieval-profile-live-readback-v1.json',
);
const reportArg = process.argv.find((arg) => arg.startsWith('--report='));
const reportPath = path.resolve(
  root,
  reportArg?.slice('--report='.length) || 'docs/reports/chunk-retrieval-profile-live-replay-v1.json',
);
const noReport = process.argv.includes('--no-report');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = Math.max(1, Math.min(Number.parseInt(limitArg?.split('=')[1] ?? '16', 10) || 16, 128));

if (!fs.existsSync(inputPath)) {
  throw new Error(`PROFILE_LIVE_READBACK_REPORT_MISSING:${path.relative(root, inputPath)}`);
}

const sourceReport = JSON.parse(fs.readFileSync(inputPath, 'utf8')) as {
  schema?: string;
  status?: string;
  selectedExecutionId?: string;
  selectedWorkspaceRevision?: string;
  rows?: Array<Record<string, any>>;
  writesPerformed?: boolean;
  canonicalAuthorityChanged?: boolean;
};

if (sourceReport.schema !== 'atlas.chunk-retrieval-profile-live-readback.v1') {
  throw new Error(`PROFILE_LIVE_READBACK_SCHEMA_UNEXPECTED:${sourceReport.schema ?? 'missing'}`);
}
if (sourceReport.status !== 'PROFILE_LIVE_READBACK_READY_FOR_ADAPTER_REPLAY') {
  throw new Error(`PROFILE_LIVE_READBACK_NOT_READY:${sourceReport.status ?? 'missing'}`);
}
if (sourceReport.writesPerformed !== false || sourceReport.canonicalAuthorityChanged !== false) {
  throw new Error('PROFILE_LIVE_READBACK_AUTHORITY_FLAGS_INVALID');
}

const selectedRows = (Array.isArray(sourceReport.rows) ? sourceReport.rows : []).slice(0, limit);
if (selectedRows.length === 0) throw new Error('PROFILE_LIVE_REPLAY_NO_ROWS');

function asStrings(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

function reorderSetLike(values: string[] | undefined): string[] | undefined {
  if (!values) return undefined;
  if (values.length === 0) return [];
  const reversed = [...values].reverse();
  // Add deterministic duplicate noise when possible to prove checksum normalization
  // really treats these arrays as sets rather than accidentally relying on order.
  return reversed.length > 0 ? [...reversed, reversed[0]!] : reversed;
}

function buildHydrationInput(row: Record<string, any>, permuted: boolean): ChunkRetrievalProfileHydrationInputV2 {
  const identity = row.identity ?? {};
  const lexical = row.lexicalStructural;
  const semantic = row.semantic;
  const topology = row.topology;
  const ontology = row.ontology;
  const evidenceRefs = asStrings(row.evidenceRefs) ?? [];

  return {
    schemaVersion: CHUNK_RETRIEVAL_PROFILE_ADAPTER_V2,
    identity: {
      canonicalChunkId: String(identity.canonicalChunkId ?? ''),
      chunkRowId: String(identity.chunkRowId ?? ''),
      packetKey: String(identity.packetKey ?? ''),
      repositoryId: String(identity.repositoryId ?? ''),
      repositoryRelativePath: String(identity.repositoryRelativePath ?? ''),
      sourceRef: String(identity.sourceRef ?? ''),
      workspaceRevision: String(identity.workspaceRevision ?? ''),
      sourceRevision: String(identity.sourceRevision ?? ''),
    },
    featureRevision: String(row.featureRevision ?? ''),
    lexicalStructural: lexical ? {
      language: String(lexical.language ?? ''),
      symbolKind: lexical.symbolKind ?? undefined,
      symbolName: lexical.symbolName ?? undefined,
      keywords: permuted ? reorderSetLike(asStrings(lexical.keywords)) : asStrings(lexical.keywords),
      identifiers: permuted ? reorderSetLike(asStrings(lexical.identifiers)) : asStrings(lexical.identifiers),
      nouns: permuted ? reorderSetLike(asStrings(lexical.nouns)) : asStrings(lexical.nouns),
      astNodeType: lexical.astNodeType ?? undefined,
      // astPath is intentionally NOT permuted: path ordering is semantic.
      astPath: asStrings(lexical.astPath),
      calls: permuted ? reorderSetLike(asStrings(lexical.calls)) : asStrings(lexical.calls),
      imports: permuted ? reorderSetLike(asStrings(lexical.imports)) : asStrings(lexical.imports),
      exports: permuted ? reorderSetLike(asStrings(lexical.exports)) : asStrings(lexical.exports),
    } : undefined,
    semantic: semantic ? {
      summary: semantic.summary ?? undefined,
      semanticTags: permuted ? reorderSetLike(asStrings(semantic.semanticTags)) : asStrings(semantic.semanticTags),
      representationRevision: String(semantic.representationRevision ?? ''),
      modelRevision: semantic.modelRevision ?? undefined,
    } : undefined,
    domainTopic: row.domainTopic ? {
      primaryDomain: row.domainTopic.primaryDomain ?? undefined,
      domainConfidence: row.domainTopic.domainConfidence ?? undefined,
      topicIds: permuted ? reorderSetLike(asStrings(row.domainTopic.topicIds)) : asStrings(row.domainTopic.topicIds),
      classifierRevision: String(row.domainTopic.classifierRevision ?? ''),
    } : undefined,
    topology: topology ? {
      kmeansCluster: topology.kmeansCluster ?? undefined,
      clusterMargin: topology.clusterMargin ?? undefined,
      somX: topology.somX ?? undefined,
      somY: topology.somY ?? undefined,
      somCell: topology.somCell ?? undefined,
      communityId: topology.communityId ?? undefined,
      pageRank: topology.pageRank ?? undefined,
      bridgeScore: topology.bridgeScore ?? undefined,
      manifold4: topology.manifold4 ?? undefined,
      topologyRevision: String(topology.topologyRevision ?? ''),
      graphRevision: topology.graphRevision ?? undefined,
    } : undefined,
    ontology: ontology ? {
      conceptIds: permuted ? reorderSetLike(asStrings(ontology.conceptIds)) : asStrings(ontology.conceptIds),
      entityIds: permuted ? reorderSetLike(asStrings(ontology.entityIds)) : asStrings(ontology.entityIds),
      ontologyTupleIds: permuted ? reorderSetLike(asStrings(ontology.ontologyTupleIds)) : asStrings(ontology.ontologyTupleIds),
      ontologyRevision: String(ontology.ontologyRevision ?? ''),
    } : undefined,
    evidenceRefs: permuted ? (reorderSetLike(evidenceRefs) ?? []) : evidenceRefs,
  };
}

function rejected(mutator: (input: ChunkRetrievalProfileHydrationInputV2) => void, row: Record<string, any>): boolean {
  const input = buildHydrationInput(row, false);
  mutator(input);
  try {
    hydrateChunkRetrievalProfileV2(input);
    return false;
  } catch {
    return true;
  }
}

const replays = [];
const blockers: string[] = [];
for (let index = 0; index < selectedRows.length; index += 1) {
  const row = selectedRows[index]!;
  try {
    const baselineInput = buildHydrationInput(row, false);
    const permutedInput = buildHydrationInput(row, true);
    const baseline = hydrateChunkRetrievalProfileV2(baselineInput);
    const permuted = hydrateChunkRetrievalProfileV2(permutedInput);

    const checksumStable = baseline.profile.checksum === permuted.profile.checksum;
    const identityStable = baseline.profile.canonicalChunkId === permuted.profile.canonicalChunkId
      && baseline.profile.chunkRowId === permuted.profile.chunkRowId
      && baseline.profile.packetKey === permuted.profile.packetKey
      && baseline.profile.workspaceRevision === permuted.profile.workspaceRevision
      && baseline.profile.sourceRevision === permuted.profile.sourceRevision;

    const missingFeatureRevisionRejected = rejected((input) => {
      (input as any).featureRevision = '';
    }, row);
    const missingWorkspaceRevisionRejected = rejected((input) => {
      (input.identity as any).workspaceRevision = '';
    }, row);
    const missingSourceRevisionRejected = rejected((input) => {
      (input.identity as any).sourceRevision = '';
    }, row);
    const missingEvidenceRefsRejected = rejected((input) => {
      (input as any).evidenceRefs = [];
    }, row);

    if (!checksumStable) blockers.push('CHECKSUM_ORDER_DEPENDENT');
    if (!identityStable) blockers.push('IDENTITY_CHANGED_DURING_REPLAY');
    if (!missingFeatureRevisionRejected) blockers.push('MISSING_FEATURE_REVISION_ACCEPTED');
    if (!missingWorkspaceRevisionRejected) blockers.push('MISSING_WORKSPACE_REVISION_ACCEPTED');
    if (!missingSourceRevisionRejected) blockers.push('MISSING_SOURCE_REVISION_ACCEPTED');
    if (!missingEvidenceRefsRejected) blockers.push('MISSING_EVIDENCE_REFS_ACCEPTED');

    replays.push({
      rowIndex: index,
      canonicalChunkId: baseline.profile.canonicalChunkId,
      chunkRowId: baseline.profile.chunkRowId,
      packetKey: baseline.profile.packetKey,
      baselineChecksum: baseline.profile.checksum,
      permutedChecksum: permuted.profile.checksum,
      checksumStable,
      identityStable,
      presence: baseline.presence,
      missingGroups: baseline.missingGroups,
      failClosed: {
        featureRevision: missingFeatureRevisionRejected,
        workspaceRevision: missingWorkspaceRevisionRejected,
        sourceRevision: missingSourceRevisionRejected,
        evidenceRefs: missingEvidenceRefsRejected,
      },
    });
  } catch (error) {
    blockers.push('ROW_HYDRATION_FAILED');
    replays.push({
      rowIndex: index,
      canonicalChunkId: row.identity?.canonicalChunkId ?? null,
      chunkRowId: row.identity?.chunkRowId ?? null,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const uniqueBlockers = [...new Set(blockers)];
const status = uniqueBlockers.length === 0
  ? 'PROFILE_LIVE_REPLAY_PROVEN'
  : 'PROFILE_LIVE_REPLAY_BLOCKED';
const report = {
  schema: 'atlas.chunk-retrieval-profile-live-replay.v1',
  generatedAt: new Date().toISOString(),
  gate: 'RETRIEVAL-PROFILE-LIVE-REPLAY-02-03',
  status,
  sourceReport: path.relative(root, inputPath).replaceAll('\\', '/'),
  selectedExecutionId: sourceReport.selectedExecutionId ?? null,
  selectedWorkspaceRevision: sourceReport.selectedWorkspaceRevision ?? null,
  boundedRows: selectedRows.length,
  blockers: uniqueBlockers,
  replays,
  readOnly: true,
  writesPerformed: false,
  canonicalAuthorityChanged: false,
  nextGate: status === 'PROFILE_LIVE_REPLAY_PROVEN'
    ? 'FILE-PROFILE-01'
    : 'REVIEW_PROFILE_LIVE_REPLAY_BLOCKERS',
};

if (!noReport) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

console.log(JSON.stringify({
  status,
  boundedRows: selectedRows.length,
  blockers: uniqueBlockers,
  reportPath: noReport ? null : path.relative(root, reportPath).replaceAll('\\', '/'),
  writesPerformed: false,
}, null, 2));

if (uniqueBlockers.length) process.exitCode = 2;
