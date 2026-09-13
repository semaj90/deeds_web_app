#!/usr/bin/env tsx

import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSnapshot } from './lib/workspace-snapshot-capture-v1.mts';
import {
  SOURCE_INVENTORY_HYGIENE_POLICY_REVISION,
  canonicalInventoryRecords,
  classifySnapshotSources,
  excludedCountsByReason,
  knownJunkMatches,
  sourceInventoryChecksum,
  sourceSelectionChecksum,
} from './lib/canonical-source-inventory-hygiene-v1.mts';
import {
  WHOLE_CODEBASE_SOURCE_EXCLUSION_POLICY_REVISION,
  exclusionPolicyChecksum,
  proveRequiredRecurrenceExclusions,
} from './lib/whole-codebase-source-exclusions.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SNAPSHOT_DIR = resolve(ROOT, 'docs/reports/workspace-source-snapshots');
const REPORT = resolve(ROOT, 'docs/reports/canonical-source-inventory-hygiene-v1.json');

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function latestManifest(): Promise<string> {
  const names = (await readdir(SNAPSHOT_DIR)).filter((name) => extname(name) === '.json');
  const candidates = await Promise.all(names.map(async (name) => ({
    name,
    mtime: (await stat(resolve(SNAPSHOT_DIR, name))).mtimeMs,
  })));
  const latest = candidates.sort((a, b) => b.mtime - a.mtime)[0];
  if (!latest) throw new Error('NO_WORKSPACE_SNAPSHOT_MANIFEST');
  return resolve(SNAPSHOT_DIR, latest.name);
}

const snapshotPath = resolve(ROOT, argument('--manifest') ?? await latestManifest());
const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
const readback = validateSnapshot(snapshot);
const sources = Array.isArray(snapshot.sources) ? snapshot.sources : [];
const classified = classifySnapshotSources(sources);
const canonicalRecords = canonicalInventoryRecords(classified);
const excluded = excludedCountsByReason(classified);
const junk = knownJunkMatches(classified);
const checksum = sourceInventoryChecksum(classified);
const selectionChecksum = sourceSelectionChecksum(classified);
const unknownCount = excluded.UNKNOWN;

const writerPath = 'scripts/atlas/upsert-whole-codebase-atlas-packets.mjs';
let writerRevisionChecksum: string | null = null;
let writerUsesSharedExclusionPolicy = false;
try {
  const writer = await readFile(resolve(ROOT, writerPath), 'utf8');
  writerRevisionChecksum = `sha256:${createHash('sha256').update(writer, 'utf8').digest('hex')}`;
  writerUsesSharedExclusionPolicy = writer.includes("./lib/whole-codebase-source-exclusions.mjs")
    && writer.includes('buildRipgrepExcludeArgs');
} catch {
  // A missing writer is a blocker below.
}

const recurrenceExclusionProof = proveRequiredRecurrenceExclusions();
const recurrencePrevented = writerUsesSharedExclusionPolicy && recurrenceExclusionProof.pass;

const blockers: string[] = [];
if (readback.status !== 'SNAPSHOT_BYTES_READBACK_PROVEN') blockers.push('SNAPSHOT_BYTES_READBACK_NOT_PROVEN');
if (sources.length === 0) blockers.push('SNAPSHOT_SOURCE_MANIFEST_EMPTY');
if (canonicalRecords.length === 0) blockers.push('CANONICAL_SOURCE_SET_EMPTY');
if (unknownCount > 0) blockers.push(`UNKNOWN_SOURCE_CLASSIFICATIONS:${unknownCount}`);
if (junk.target !== 0) blockers.push(`KNOWN_JUNK_TARGET_IN_CANONICAL_SOURCE:${junk.target}`);
if (junk.pythonRuntime !== 0) blockers.push(`KNOWN_JUNK_PYTHON_RUNTIME_IN_CANONICAL_SOURCE:${junk.pythonRuntime}`);
if (junk.backup !== 0) blockers.push(`KNOWN_JUNK_BACKUP_IN_CANONICAL_SOURCE:${junk.backup}`);
if (junk.generatedBuild !== 0) blockers.push(`KNOWN_JUNK_GENERATED_BUILD_IN_CANONICAL_SOURCE:${junk.generatedBuild}`);
if (junk.worktreeDuplicate !== 0) blockers.push(`KNOWN_JUNK_WORKTREE_DUPLICATE_IN_CANONICAL_SOURCE:${junk.worktreeDuplicate}`);
if (!writerRevisionChecksum) blockers.push('PACKET_WRITER_UNREADABLE');
if (!writerUsesSharedExclusionPolicy) blockers.push('PACKET_WRITER_DOES_NOT_USE_SHARED_EXCLUSION_POLICY');
if (!recurrenceExclusionProof.pass) blockers.push('PACKET_WRITER_REQUIRED_RECURRENCE_EXCLUSIONS_INCOMPLETE');

const report = {
  schema: 'atlas.canonical-source-inventory-hygiene.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY',
  status: blockers.length === 0 ? 'SOURCE_INVENTORY_HYGIENE_PASS' : 'SOURCE_INVENTORY_HYGIENE_BLOCKED',
  proofLevel: blockers.length === 0 ? 'BOUNDED_LIVE_PROVEN' : 'BLOCKED',
  authority: false,
  canonicalAuthority: false,
  writesPerformed: false,
  datastoreWritesPerformed: false,
  snapshotPath,
  snapshotRevision: snapshot.snapshotRevision ?? null,
  workspaceId: snapshot.workspaceId ?? null,
  workspaceRevision: snapshot.workspaceRevision ?? null,
  snapshotMembershipChecksum: snapshot.sourceMembershipChecksum ?? null,
  inventoryRevision: SOURCE_INVENTORY_HYGIENE_POLICY_REVISION,
  sourceInventoryChecksum: checksum,
  sourceSelectionChecksum: selectionChecksum,
  writerPath,
  writerRevisionChecksum,
  writerExclusionPolicyRevision: WHOLE_CODEBASE_SOURCE_EXCLUSION_POLICY_REVISION,
  writerExclusionPolicyChecksum: exclusionPolicyChecksum(),
  writerUsesSharedExclusionPolicy,
  recurrenceExclusionProof,
  candidatePathCount: sources.length,
  canonicalSourceCount: canonicalRecords.length,
  excludedCountsByReason: excluded,
  knownJunkMatches: junk,
  recurrencePrevented,
  historicalJunkIdentified: true,
  historicalJunkCleanupAuthorized: false,
  canonicalSources: canonicalRecords,
  exclusions: classified
    .filter((entry) => entry.classification !== 'CANONICAL_SOURCE')
    .map((entry) => ({
      sourceIdentityKey: entry.sourceIdentityKey,
      repositoryRelativePath: entry.repositoryRelativePath,
      classification: entry.classification,
    })),
  blockers,
  firstBlockingInvariant: blockers[0] ?? null,
  nextGate: blockers.length === 0 ? 'PROMOTION-RECEIPT-COHORT-01' : 'SOURCE-INVENTORY-HYGIENE-01',
};

await mkdir(dirname(REPORT), { recursive: true });
await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  schema: report.schema,
  status: report.status,
  snapshotRevision: report.snapshotRevision,
  candidatePathCount: report.candidatePathCount,
  canonicalSourceCount: report.canonicalSourceCount,
  sourceInventoryChecksum: report.sourceInventoryChecksum,
  sourceSelectionChecksum: report.sourceSelectionChecksum,
  knownJunkMatches: report.knownJunkMatches,
  recurrencePrevented: report.recurrencePrevented,
  writerExclusionPolicyRevision: report.writerExclusionPolicyRevision,
  writesPerformed: false,
  reportPath: REPORT,
}, null, 2));
if (blockers.length) process.exitCode = 3;
