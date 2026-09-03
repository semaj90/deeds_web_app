import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  aceLiveDryInputV2Schema,
  resolveAceLiveDryGraphRevisionV2,
  selectedAceLiveDryRowsV2,
} from './ace-live-dry-input-v2.js';
import {
  buildWorkspaceRevisionRecordV1,
  buildWorkspaceSourceBindingsV1,
  type WorkspaceSourceManifestEntryV1,
} from '../identity/workspace-source-binding-v1.js';
import { buildRevisionAuthorityEnvelopeV1 } from '../identity/revision-authority-envelope-v1.js';
import { materializeCandidateOrdinalMap } from '../features/canonical-candidate-v1.js';
import { materializeCandidateFeatureSnapshot } from '../features/candidate-feature-snapshot-v1.js';

const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

function fixture(graph = true) {
  const contentDigest = sha('export const value = 1;\n');
  const entry: WorkspaceSourceManifestEntryV1 = {
    sourceRef: 'src/value.ts',
    sourceRevision: `sha256:${contentDigest}`,
    contentDigest,
    byteLength: 24,
    gitBlobOid: 'c'.repeat(40),
  };
  const { record, entries } = buildWorkspaceRevisionRecordV1({
    repositoryId: 'semaj90/deeds_web_app',
    gitObjectFormat: 'sha1',
    baseCommitOid: 'a'.repeat(40),
    baseTreeOid: 'b'.repeat(40),
    gitHeadRef: 'refs/heads/main',
    dirty: false,
    entries: [entry],
    generatedAt: '2026-09-02T00:00:00.000Z',
    producerRevision: 'workspace-fixture-v1',
  });
  const bindings = buildWorkspaceSourceBindingsV1({
    record,
    entries,
    trackedAtBaseCommit: new Map([['src/value.ts', true]]),
    dirtyRelativeToBaseCommit: new Map([['src/value.ts', false]]),
    producerRevision: 'binding-fixture-v1',
  });
  const revisionAuthority = buildRevisionAuthorityEnvelopeV1({ record, bindings });
  const graphRevision = graph ? `sha256:${'d'.repeat(64)}` : null;
  const ordinalMap = materializeCandidateOrdinalMap({
    candidateSnapshotRevision: 'snapshot-r1',
    workspaceRevision: record.workspaceRevision,
    producerRevision: 'ordinal-fixture-v1',
    candidates: [{
      canonicalId: 'candidate:value',
      packetKey: 'packet:value',
      sourceRef: 'src/value.ts',
      treeNodeId: null,
      symbolVersionId: null,
      workspaceRevision: record.workspaceRevision,
      sourceRevision: entry.sourceRevision,
      graphRevision,
      semanticRevision: 'semantic-r1',
      degradedIdentity: false,
      evidenceRefs: ['evidence:value'],
      representationBindings: [],
    }],
  });
  const snapshot = materializeCandidateFeatureSnapshot({
    ordinalMap,
    featureRevision: 'feature-r1',
    producerRevision: 'feature-fixture-v1',
    rows: [{
      schema: 'atlas.candidate-feature-row.v1',
      candidateOrdinal: 0,
      canonicalId: 'candidate:value',
      packetKey: 'packet:value',
      treeNodeId: null,
      symbolVersionId: null,
      workspaceRevision: record.workspaceRevision,
      sourceRevision: entry.sourceRevision,
      graphRevision,
      semanticRevision: 'semantic-r1',
      featureRevision: 'feature-r1',
      representationBindings: [],
      semanticRelevance: 0.9,
      graphAuthority: graph ? 0.4 : null,
      laneMask: graph ? ['semantic', 'graph'] : ['semantic'],
      evidenceRefs: ['evidence:value'],
    }],
  });
  return { ordinalMap, snapshot, revisionAuthority, graphRevision };
}

function input(graph = true) {
  const data = fixture(graph);
  return {
    schema: 'atlas.ace-live-dry-input.v2' as const,
    expectedCandidateCount: 1,
    ordinalMap: data.ordinalMap,
    snapshot: data.snapshot,
    revisionAuthority: data.revisionAuthority,
    ace: {
      requestId: 'req-a',
      tokenBudget: 256,
      retrievalPolicyRevision: 'retrieval-policy-r1',
      acePlaybookRevision: 'ace-playbook-r1',
      representationRevision: 'representation-r1',
      ontologyRevision: null,
      modelRevision: null,
      promptTemplateRevision: null,
      graphRevision: data.graphRevision,
    },
  };
}

describe('ACE live dry input v2', () => {
  it('accepts explicit non-timestamp revisions and derives exact graph revision', () => {
    const parsed = aceLiveDryInputV2Schema.parse(input(true));
    const rows = selectedAceLiveDryRowsV2(parsed);
    expect(resolveAceLiveDryGraphRevisionV2(rows)).toBe(parsed.ace.graphRevision);
  });

  it('rejects timestamp-derived policy revisions', () => {
    const value = input(true);
    value.ace.retrievalPolicyRevision = '2026-09-02T12:34:56.000Z';
    expect(() => aceLiveDryInputV2Schema.parse(value)).toThrow(/synthetic ISO timestamp revisions are not authoritative/);
  });

  it('keeps semantic-only canaries graph-free', () => {
    const parsed = aceLiveDryInputV2Schema.parse(input(false));
    expect(resolveAceLiveDryGraphRevisionV2(selectedAceLiveDryRowsV2(parsed))).toBeNull();
    expect(parsed.ace.graphRevision).toBeNull();
  });

  it('rejects a graph revision attached without admitted graph evidence', () => {
    const parsed = aceLiveDryInputV2Schema.parse(input(false));
    parsed.snapshot.rows[0]!.graphRevision = `sha256:${'e'.repeat(64)}`;
    expect(() => resolveAceLiveDryGraphRevisionV2(selectedAceLiveDryRowsV2(parsed)))
      .toThrow('ACE_LIVE_DRY_GRAPH_REVISION_WITHOUT_GRAPH_EVIDENCE');
  });
});
