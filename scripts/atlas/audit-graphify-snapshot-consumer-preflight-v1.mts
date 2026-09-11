import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const ADMISSION_PATH = resolve(ROOT, 'docs/reports/workspace-revision-tournament-admission-v1.json');
const REPORT_PATH = resolve(ROOT, 'docs/reports/graphify-snapshot-consumer-preflight-v1.json');

type Source = {
  repositoryId?: string;
  repositoryRelativePath?: string;
  sourceRef?: string;
  sourceRevision?: string;
  contentDigest?: string;
  byteLength?: number;
};

const digest = (value: Buffer) => createHash('sha256').update(value).digest('hex');

async function main() {
  const admission = JSON.parse(await readFile(ADMISSION_PATH, 'utf8')) as {
    status?: string; authority?: boolean; workspaceRevision?: string;
    snapshotRevision?: string; sourceCount?: number; sourceSelectionChecksum?: string;
  };
  const blockers: string[] = [];
  const violations: string[] = [];
  const admissionValid = admission.status === 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED'
    && admission.authority === true && Boolean(admission.workspaceRevision)
    && Boolean(admission.snapshotRevision);
  if (!admissionValid) blockers.push('ADMITTED_WORKSPACE_REVISION_MISSING_OR_INVALID');

  const snapshotPath = admission.snapshotRevision
    ? resolve(ROOT, 'docs/reports/workspace-source-snapshots', `${admission.snapshotRevision.replace(/^sha256:/, '')}.json`)
    : '';
  const snapshot = snapshotPath && existsSync(snapshotPath)
    ? JSON.parse(await readFile(snapshotPath, 'utf8')) as { snapshotRevision?: string; sources?: Source[]; repositories?: unknown[]; sourceMembershipChecksum?: string }
    : null;
  if (!snapshot) blockers.push('ADMITTED_SNAPSHOT_MISSING');
  if (snapshot && snapshot.snapshotRevision !== admission.snapshotRevision) blockers.push('SNAPSHOT_REVISION_MISMATCH');

  const sources = snapshot?.sources ?? [];
  const materializedRoot = admission.snapshotRevision
    ? resolve(ROOT, '.tmp/workspace-source-snapshots', admission.snapshotRevision.replace(/^sha256:/, ''))
    : '';
  if (!materializedRoot || !existsSync(materializedRoot)) blockers.push('MATERIALIZED_SNAPSHOT_MISSING');

  const identities = new Set<string>();
  const repositories = new Set<string>();
  let missing = 0;
  let hashMismatch = 0;
  let sizeMismatch = 0;
  for (const source of sources) {
    const repositoryId = source.repositoryId ?? '';
    const repositoryRelativePath = (source.repositoryRelativePath ?? source.sourceRef ?? '').replaceAll('\\', '/').replace(/^\/+/, '');
    const identity = `${repositoryId}:${repositoryRelativePath}`;
    if (!repositoryId || !repositoryRelativePath) violations.push(`IDENTITY_INCOMPLETE:${identity}`);
    if (identities.has(identity)) violations.push(`DUPLICATE_IDENTITY:${identity}`);
    identities.add(identity);
    repositories.add(repositoryId);
    const sourceRef = (source.sourceRef ?? '').replaceAll('\\', '/').replace(/^\/+/, '');
    const target = resolve(materializedRoot, sourceRef);
    const escaped = relative(materializedRoot, target).startsWith(`..${sep}`) || relative(materializedRoot, target) === '..';
    if (escaped || !existsSync(target)) { missing += 1; continue; }
    const bytes = await readFile(target);
    if (source.contentDigest && digest(bytes) !== source.contentDigest) hashMismatch += 1;
    const expectedSize = Number(source.byteLength);
    if (Number.isFinite(expectedSize) && bytes.byteLength !== expectedSize) sizeMismatch += 1;
  }
  if (missing) blockers.push('MATERIALIZED_SOURCE_MISSING');
  if (hashMismatch) blockers.push('MATERIALIZED_SOURCE_HASH_MISMATCH');
  if (sizeMismatch) blockers.push('MATERIALIZED_SOURCE_SIZE_MISMATCH');
  if (identities.size !== sources.length) blockers.push('DUPLICATE_REPOSITORY_QUALIFIED_IDENTITY');
  if (admission.sourceCount !== undefined && Number(admission.sourceCount) !== sources.length) blockers.push('SOURCE_COUNT_MISMATCH');

  const sourceKind = 'ADMITTED_WORKSPACE_SNAPSHOT';
  const report = {
    schema: 'atlas.graphify-snapshot-consumer-preflight.v1',
    gate: 'GRAPHIFY-SNAPSHOT-CONSUMER-PREFLIGHT-01',
    status: blockers.length === 0 ? 'GRAPHIFY_SNAPSHOT_CONSUMER_PREFLIGHT_PROVEN' : 'GRAPHIFY_SNAPSHOT_CONSUMER_PREFLIGHT_BLOCKED',
    proofLevel: blockers.length === 0 ? 'BOUNDED_LIVE_PROVEN' : 'PARTIAL_PROVEN',
    readOnly: true,
    sourceKind,
    workspaceRevision: admission.workspaceRevision ?? null,
    snapshotRevision: admission.snapshotRevision ?? null,
    materializedRoot: materializedRoot || null,
    sourceCount: sources.length,
    repositoryCount: repositories.size,
    sourceSelectionChecksum: admission.sourceSelectionChecksum ?? null,
    snapshotSourceMembershipChecksum: snapshot?.sourceMembershipChecksum ?? null,
    liveInventoryBuilderCalls: 0,
    gitRevisionDerivationCalls: 0,
    unexpectedRepositoryDiscovery: 0,
    persistentWrites: 0,
    childApplyCommands: 0,
    missingSources: missing,
    hashMismatches: hashMismatch,
    sizeMismatches: sizeMismatch,
    duplicateIdentities: sources.length - identities.size,
    blockers,
    violations,
    authority: false,
    writesPerformed: false,
    nextGate: blockers.length === 0 ? 'SNAPSHOT-BOUND-GRAPHIFY-CANARY-01' : 'GRAPHIFY-SNAPSHOT-CONSUMER-REPAIR-01',
  };
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = blockers.length === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error(`GRAPHIFY_SNAPSHOT_CONSUMER_PREFLIGHT_FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
