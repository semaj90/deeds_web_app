import assert from 'node:assert/strict';
import test from 'node:test';
import { classifySourcePredecessors, decideTemporalAuthority, deriveSupersessionEdge, deriveTemporalIndexEvent, temporalSupersessionChecksum, type TemporalArtifactVersionV1 } from '../src/core/temporal-supersession-fabric-v1.js';

const base = (versionCanonicalId: string, lifecycle: TemporalArtifactVersionV1['lifecycle']): TemporalArtifactVersionV1 => ({
  schema: 'atlas.temporal-artifact-version.v1', logicalCanonicalId: 'symbol:combineViaRRF', versionCanonicalId,
  artifactKind: 'SYMBOL', revision: versionCanonicalId, validFromWorkspaceRevision: 'ws:test', lifecycle,
});

test('requires exactly one active current owner and remains deterministic', () => {
  const decision = decideTemporalAuthority({ logicalCanonicalId: 'symbol:combineViaRRF', versions: [base('v1', 'SUPERSEDED'), base('v2', 'ACTIVE')] });
  assert.equal(decision.status, 'PROVEN_CURRENT_OWNER');
  assert.equal(decision.activeVersionCanonicalId, 'v2');
  assert.equal(decision.checksum, temporalSupersessionChecksum({ logicalCanonicalId: decision.logicalCanonicalId, evaluatedVersions: decision.evaluatedVersions, activeVersionCanonicalId: decision.activeVersionCanonicalId, decisions: decision.decisions, status: decision.status }));
});

test('ambiguous active versions fail closed', () => {
  const decision = decideTemporalAuthority({ logicalCanonicalId: 'symbol:combineViaRRF', versions: [base('v1', 'ACTIVE'), base('v2', 'ACTIVE')] });
  assert.equal(decision.status, 'AMBIGUOUS_CURRENT_OWNER');
  assert.equal(decision.activeVersionCanonicalId, undefined);
});

test('derives a null-workspace temporal event without inventing a revision', () => {
  const event = deriveTemporalIndexEvent({ eventId: 'event-1', logicalCanonicalId: 'packet:p1', versionCanonicalId: 'packet:p1:v2', priorVersionCanonicalId: 'packet:p1:v1', workspaceRevision: null, actor: 'GRAPHIFY', occurredAt: '2026-09-09T00:00:00.000Z', evidenceRefs: ['b', 'a', 'a'] });
  assert.equal(event.eventType, 'UPDATED');
  assert.equal(event.workspaceRevision, null);
  assert.deepEqual(event.evidenceRefs, ['a', 'b']);
  assert.equal(event.eventChecksum, temporalSupersessionChecksum({ eventId: event.eventId, eventType: event.eventType, logicalCanonicalId: event.logicalCanonicalId, versionCanonicalId: event.versionCanonicalId, priorVersionCanonicalId: event.priorVersionCanonicalId, workspaceRevision: null, actor: event.actor, evidenceRefs: ['a', 'b'], occurredAt: event.occurredAt }));
});

test('derives non-authoritative supersession when workspace revision is unbound', () => {
  const edge = deriveSupersessionEdge({ from: base('v1', 'ACTIVE'), to: base('v2', 'ACTIVE'), workspaceRevision: null, evidenceRefs: ['git:diff'], decisionMethod: 'EXACT_CONTENT', confidence: 1 });
  assert.equal(edge.relation, 'SUPERSEDES');
  assert.equal(edge.authoritative, false);
  assert.equal(edge.workspaceRevision, null);
});

test('bootstraps a first observation without claiming historical creation', () => {
  const event = deriveTemporalIndexEvent({ eventId: 'event-baseline', logicalCanonicalId: 'packet:p1', versionCanonicalId: 'packet:p1:v1', workspaceRevision: null, actor: 'GRAPHIFY', occurredAt: '2026-09-09T00:00:00.000Z' });
  assert.equal(event.eventType, 'BASELINE_OBSERVED');
});

test('classifies isolated predecessor fixture without fuzzy identity', () => {
  const rows = classifySourcePredecessors(
    [{ sourceRef: 'a.ts', sourceRevision: 'a1', contentDigest: 'da' }, { sourceRef: 'b.ts', sourceRevision: 'b1', contentDigest: 'db' }, { sourceRef: 'gone.ts', sourceRevision: 'g1', contentDigest: 'dg' }],
    [{ sourceRef: 'a.ts', sourceRevision: 'a2', contentDigest: 'da2' }, { sourceRef: 'b.ts', sourceRevision: 'b1', contentDigest: 'db' }, { sourceRef: 'new.ts', sourceRevision: 'n1', contentDigest: 'dn' }],
  );
  assert.deepEqual(rows.map((row) => [row.sourceRef, row.operation]), [['a.ts', 'UPDATED'], ['b.ts', 'UNCHANGED'], ['gone.ts', 'TOMBSTONED'], ['new.ts', 'CREATED']]);
  assert.equal(rows.find((row) => row.sourceRef === 'a.ts')?.supersessionEligible, true);
});
