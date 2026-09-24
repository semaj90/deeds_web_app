import { describe, expect, it } from 'vitest';
import { documentGovernanceRegistryV1Schema } from '@deeds/parent-atlas/core/document-governance-record-v1';
import { GET } from './+server';
import { summarizeDocumentGovernanceV1 } from './summary-v1';
import { documentGovernanceSummaryV1Schema } from '$lib/types/document-governance-summary-v1.js';

const baseRecord = {
  schema: 'atlas.document-governance-record.v1',
  documentId: `doc:sha256:${'a'.repeat(64)}`,
  path: 'docs/OPEN.md',
  sha256: 'a'.repeat(64),
  bytes: 10,
  title: 'Open tasks',
  documentKind: 'OPENSPEC_TASKS',
  status: 'ACTIVE_SUPPORTING',
  topicIds: [],
  canonicalForTopics: [],
  topicOwnershipStatus: 'UNASSIGNED',
  instructionScope: null,
  supersedes: [],
  supersededBy: [],
  supersessionStatus: 'UNASSESSED',
  supersessionReason: null,
  openspec: { change: 'active-change', taskRefs: [], completedTasks: 2, totalTasks: 5, progressFraction: 0.4 },
  validation: { status: 'NOT_CHECKED', linksChecked: false, referencesChecked: false, smokePassed: false, testsPassed: false, contradictions: [], receiptRefs: [] },
  workflow: null,
  archive: { eligible: false, blockedReasons: ['OPENSPEC_CHANGE_INCOMPLETE'], archivedPath: null },
} as const;

function registry(records: unknown[]) {
  return documentGovernanceRegistryV1Schema.parse({
    schema: 'atlas.document.governance.registry.v1',
    generatedBy: 'test',
    generatedAt: 'DETERMINISTIC',
    canonicalAuthority: 'DOCUMENT_STATUS_ONLY',
    supersessionPolicy: 'EXPLICIT_LINK_AND_RECEIPT_ONLY',
    records,
  });
}

describe('document governance summary v1', () => {
  it('reports active task progress and blocked archive readiness without authorizing writes', () => {
    const summary = summarizeDocumentGovernanceV1(registry([baseRecord]));
    expect(summary.activeOpenSpecProgress).toMatchObject({ changeCount: 1, changes: [{ change: 'active-change', progressPercent: 40 }] });
    expect(summary.archiveReadiness).toMatchObject({ eligibleCount: 0, writesPerformed: false, applyAuthorized: false });
    expect(summary.archiveReadiness.blockerCounts).toEqual({ OPENSPEC_CHANGE_INCOMPLETE: 1 });
    expect(summary.latestReceipts.status).toBe('UNAVAILABLE');
  });

  it('exposes explicit conflicts and refuses to call unordered receipt refs latest', () => {
    const conflict = {
      ...baseRecord,
      documentId: `doc:sha256:${'b'.repeat(64)}`,
      path: 'docs/CONFLICT.md',
      status: 'CONFLICT',
      topicIds: ['retrieval'],
      canonicalForTopics: ['retrieval'],
      topicOwnershipStatus: 'CONFLICT',
      validation: { ...baseRecord.validation, receiptRefs: ['report:a', 'report:b'], contradictions: ['multiple owners'] },
    };
    const summary = summarizeDocumentGovernanceV1(registry([baseRecord, conflict]));
    expect(summary.topicConflicts).toEqual([expect.objectContaining({ path: 'docs/CONFLICT.md', topics: ['retrieval'] })]);
    expect(summary.latestReceipts).toMatchObject({ status: 'REFERENCES_UNORDERED', references: ['report:a', 'report:b'] });
  });

  it('does not label archived or completed OpenSpec lists active', () => {
    const complete = { ...baseRecord, openspec: { ...baseRecord.openspec, completedTasks: 5 } };
    const archived = { ...baseRecord, documentId: `doc:sha256:${'c'.repeat(64)}`, status: 'ARCHIVED' };
    const summary = summarizeDocumentGovernanceV1(registry([complete, archived]));
    expect(summary.activeOpenSpecProgress.changeCount).toBe(0);
  });

  it('projects only status-qualified records for the governance tabs', () => {
    const current = { ...baseRecord, documentId: `doc:sha256:${'d'.repeat(64)}`, path: 'docs/CURRENT.md', documentKind: 'ARCHITECTURE', status: 'CANONICAL_CURRENT' };
    const superseded = { ...baseRecord, documentId: `doc:sha256:${'e'.repeat(64)}`, path: 'docs/OLD.md', status: 'SUPERSEDED', supersededBy: [`doc:sha256:${'d'.repeat(64)}`], supersessionStatus: 'VALIDATED' };
    const archiveReady = { ...baseRecord, documentId: `doc:sha256:${'f'.repeat(64)}`, path: 'docs/ARCHIVE.md', status: 'ARCHIVE_READY', archive: { eligible: true, blockedReasons: [], archivedPath: null } };
    const summary = summarizeDocumentGovernanceV1(registry([baseRecord, current, superseded, archiveReady]));
    expect(summary.documents.current.map((record) => record.path)).toEqual(['docs/CURRENT.md']);
    expect(summary.documents.openSpec.map((record) => record.path)).toEqual(['docs/OPEN.md']);
    expect(summary.documents.superseded[0]).toMatchObject({ path: 'docs/OLD.md', supersededBy: [`doc:sha256:${'d'.repeat(64)}`] });
    expect(summary.documents.archiveReady[0]).toMatchObject({ path: 'docs/ARCHIVE.md', archiveEligible: true });
    expect(summary.archiveReadiness.applyAuthorized).toBe(false);
  });

  it('serves the validated live registry through the authenticated read-only route', async () => {
    const event = { locals: { user: { id: 'test-admin' } } } as unknown as Parameters<typeof GET>[0];
    const response = await GET(event);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(documentGovernanceSummaryV1Schema.safeParse(body).success).toBe(true);
    expect(body).toMatchObject({
      schema: 'atlas.document.governance.summary.v1',
      available: true,
      archiveReadiness: { writesPerformed: false, applyAuthorized: false },
      latestReceipts: { status: 'UNAVAILABLE', references: [] },
    });
    expect(body.activeOpenSpecProgress.changeCount).toBeGreaterThan(0);
    expect(Array.isArray(body.topicConflicts)).toBe(true);
  });

  it('keeps the same summary keys on unauthorized responses', async () => {
    const event = { locals: { user: null } } as unknown as Parameters<typeof GET>[0];
    const response = await GET(event);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toHaveProperty('activeOpenSpecProgress.changes');
    expect(body).toHaveProperty('archiveReadiness.applyAuthorized', false);
    expect(body).toHaveProperty('latestReceipts.status', 'UNAVAILABLE');
  });

  it('rejects any response contract that claims archive writes or authorization', () => {
    const unsafe = {
      schema: 'atlas.document.governance.summary.v1', available: false, registryChecksum: null,
      totalDocuments: 0, instructionDocuments: 0, openSpecChanges: 0, completedTasks: 0, totalTasks: 0,
      progressPercent: null, archiveEligible: 0, conflicts: 0,
      activeOpenSpecProgress: { changes: [], changeCount: 0 },
      documents: { current: [], openSpec: [], superseded: [], archiveReady: [], conflicts: [] },
      archiveReadiness: { eligibleCount: 0, notEligibleCount: 0, blockerCounts: {}, writesPerformed: true, applyAuthorized: false },
      topicConflicts: [], latestReceipts: { status: 'UNAVAILABLE', references: [], reason: 'none' },
      etaMs: null, etaConfidence: null, supersessionEdges: 0, unresolvedSupersessionReferences: 0,
    };
    expect(documentGovernanceSummaryV1Schema.safeParse(unsafe).success).toBe(false);
  });
});
