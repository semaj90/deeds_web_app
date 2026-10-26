import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { validateExactIndexedSourcePathV1, validateIndexedSourceBatchRequestV1 } from './indexed-source-batch-v1.mjs';

const checksum = value => `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;

export function buildIndexedSourceCohortV1({ directory, workspaceRevision, snapshotRevision, sourceRows, sourcePaths = [], readSource }) {
  assert.match(workspaceRevision, /^sha256:[0-9a-f]{64}$/);
  assert.match(snapshotRevision, /^sha256:[0-9a-f]{64}$/);
  validateExactIndexedSourcePathV1(directory);
  const entries = sourceRows.map(row => {
    const sourceRef = validateExactIndexedSourcePathV1(row.canonical_source_ref);
    assert.ok(sourceRef.startsWith(`${directory}/`));
    const exclusions = [];
    if (row.workspace_revision !== workspaceRevision || !/^sha256:[0-9a-f]{64}$/.test(row.source_revision ?? '')) exclusions.push('SOURCE_LINEAGE_UNQUALIFIED');
    const bindingCount = Number(row.binding_count ?? 1);
    const graphifyMatchCount = Number(row.graphify_file_match_count ?? 1);
    if (bindingCount !== 1) exclusions.push('AMBIGUOUS_SOURCE_BINDING');
    if (graphifyMatchCount === 0) exclusions.push('NO_EXACT_GRAPHIFY_SOURCE_MATCH');
    else if (graphifyMatchCount !== 1) exclusions.push('AMBIGUOUS_GRAPHIFY_SOURCE_MATCH');
    let sourceHash = null;
    let bytes = null;
    try {
      const source = readSource(sourceRef);
      bytes = source.length;
      sourceHash = `sha256:${createHash('sha256').update(source).digest('hex')}`;
      if (sourceHash !== row.source_revision) exclusions.push('SOURCE_BYTES_REVISION_MISMATCH');
    } catch (error) {
      exclusions.push(`SOURCE_READ_FAILED:${error.code ?? error.message}`);
    }
    return { sourceRef, sourceRevision: row.source_revision, workspaceRevision: row.workspace_revision,
      extension: path.posix.extname(sourceRef), bytes, sourceHash, exclusions };
  });
  const boundRefs = new Set(entries.map(entry => entry.sourceRef));
  const indexedPaths = new Set(boundRefs);
  for (const rawPath of sourcePaths) {
    const sourceRef = validateExactIndexedSourcePathV1(rawPath);
    if (!sourceRef.startsWith(`${directory}/`) || indexedPaths.has(sourceRef)) continue;
    const source = readSource(sourceRef);
    entries.push({ sourceRef, sourceRevision: null, workspaceRevision, extension: path.posix.extname(sourceRef),
      bytes: source.length, sourceHash: `sha256:${createHash('sha256').update(source).digest('hex')}`,
      exclusions: ['NO_CANONICAL_SOURCE_BINDING'] });
    indexedPaths.add(sourceRef);
  }
  entries.sort((left, right) => Buffer.compare(Buffer.from(left.sourceRef), Buffer.from(right.sourceRef)));
  const counts = new Map();
  for (const entry of entries) counts.set(entry.sourceRef, (counts.get(entry.sourceRef) ?? 0) + 1);
  for (const entry of entries) if (counts.get(entry.sourceRef) > 1) entry.exclusions.push('DUPLICATE_SOURCE_IDENTITY');
  const excludedRefs = new Set(entries.filter(entry => entry.exclusions.length > 0).map(entry => entry.sourceRef));
  const eligibleRefs = new Set(entries.filter(entry => entry.exclusions.length === 0).map(entry => entry.sourceRef));
  const body = { schema: 'atlas.indexed-source-cohort.v1', capturedAt: new Date().toISOString(), directory,
    workspaceRevision, snapshotRevision, totalBound: boundRefs.size, totalSelected: eligibleRefs.size, selectedRows: entries.length,
    totalSnapshotFiles: sourcePaths.length,
    snapshotFilesWithoutBinding: entries.filter(entry => entry.exclusions.includes('NO_CANONICAL_SOURCE_BINDING')).length,
    boundSourcesMissingFromSnapshot: entries.filter(entry => entry.exclusions.some(reason => reason.startsWith('SOURCE_READ_FAILED:'))).length,
    excludedRows: excludedRefs.size,
    duplicateRows: entries.length - counts.size, entries, canonicalAuthority: false, datastoreWritesPerformed: false };
  return { ...body, receiptChecksum: checksum(body) };
}

export function reconcileIndexedSourceCohortV1(cohort, items, exhausted) {
  const { receiptChecksum, ...body } = cohort;
  assert.equal(receiptChecksum, checksum(body), 'frozen cohort checksum mismatch');
  const selected = new Map(cohort.entries.filter(entry => entry.exclusions.length === 0).map(entry => [entry.sourceRef, entry]));
  const seen = new Set();
  const issues = [];
  for (const item of items) {
    const entry = selected.get(item.sourceRef);
    if (!entry) issues.push({ sourceRef: item.sourceRef, reason: 'OUTSIDE_FROZEN_COHORT' });
    else if (entry.sourceRevision !== item.sourceRevision || item.workspaceRevision !== cohort.workspaceRevision) issues.push({ sourceRef: item.sourceRef, reason: 'COHORT_REVISION_MISMATCH' });
    if (seen.has(item.sourceRef)) issues.push({ sourceRef: item.sourceRef, reason: 'DUPLICATE_PROCESSED_SOURCE' });
    seen.add(item.sourceRef);
  }
  const remaining = [...selected.keys()].filter(sourceRef => !seen.has(sourceRef));
  const completed = items.filter(item => item.status === 'COMPLETED').length;
  const complete = exhausted && remaining.length === 0 && issues.length === 0 && completed === cohort.totalSelected;
  const completionStatus = cohort.excludedRows > 0
    ? 'FROZEN_CORPUS_DIAGNOSTICS_COMPLETE_WITH_EXPLICIT_EXCLUSIONS_NOT_ADMITTED'
    : 'FROZEN_CORPUS_DIAGNOSTICS_COMPLETE_NOT_ADMITTED';
  return { status: complete ? completionStatus : 'PARTIAL_DIAGNOSTIC_NOT_ADMITTED',
    totalSelected: cohort.totalSelected, processed: seen.size, completed,
    failed: items.filter(item => item.status === 'FAILED').length,
    partial: items.filter(item => item.status === 'PARTIAL').length,
    skipped: cohort.excludedRows + items.filter(item => item.status === 'EXCLUDED').length,
    duplicates: issues.filter(issue => issue.reason === 'DUPLICATE_PROCESSED_SOURCE').length,
    remaining: remaining.length, remainingSourceRefs: remaining, issues, cohortChecksum: receiptChecksum,
    indexingOutcome: complete ? 'DRY_RUN_VALIDATED_NOT_INDEXED' : 'PARTIAL_DIAGNOSTIC_NOT_ADMITTED', datastoreWritesPerformed: false };
}

export function selectIndexedSourceCohortPageV1(cohort, input) {
  const request = validateIndexedSourceBatchRequestV1(input);
  const { receiptChecksum, ...body } = cohort;
  assert.equal(receiptChecksum, checksum(body), 'frozen cohort checksum mismatch');
  assert.equal(cohort.schema, 'atlas.indexed-source-cohort.v1');
  assert.equal(cohort.directory, request.directory);
  assert.equal(cohort.workspaceRevision, request.workspaceRevision);
  assert.equal(cohort.datastoreWritesPerformed, false);
  assert.equal(cohort.canonicalAuthority, false);
  assert.equal(cohort.totalSelected, cohort.entries.filter(entry => entry.exclusions.length === 0).length);
  assert.equal(cohort.excludedRows, new Set(cohort.entries.filter(entry => entry.exclusions.length > 0).map(entry => entry.sourceRef)).size);
  assert.equal(cohort.duplicateRows, 0);
  const eligibleEntries = cohort.entries.filter(entry => entry.exclusions.length === 0);
  const cursorIndex = request.afterSourceRef === null ? -1 : eligibleEntries.findIndex(entry => entry.sourceRef === request.afterSourceRef);
  assert.ok(request.afterSourceRef === null || cursorIndex >= 0, 'cursor outside frozen cohort');
  return eligibleEntries.slice(cursorIndex + 1, cursorIndex + 1 + request.limit + 1).map(entry => ({
    canonical_source_ref: entry.sourceRef, source_revision: entry.sourceRevision, workspace_revision: entry.workspaceRevision,
    binding_count: 1, graphify_file_match_count: 1,
  }));
}
