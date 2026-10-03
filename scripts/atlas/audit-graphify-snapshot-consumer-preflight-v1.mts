import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const ADMISSION_PATH = resolve(ROOT, 'docs/reports/workspace-revision-tournament-admission-v1.json');
const PLAN_PATH = resolve(ROOT, 'docs/reports/graphify-source-selection-plan-v1.json');
const REPORT_PATH = resolve(ROOT, 'docs/reports/graphify-snapshot-consumer-preflight-v1.json');

type Source = {
  repositoryId?: string;
  repositoryRelativePath?: string;
  sourceRef?: string;
  sourceRevision?: string;
  contentDigest?: string;
  byteLength?: number;
};

type Binding = {
  repositoryId?: string;
  repositoryRelativePath?: string;
  sourceRef?: string;
  codeSourceRevision?: string;
  contentHash?: string;
  byteLength?: number;
};

const digest = (value: Buffer) => createHash('sha256').update(value).digest('hex');
const normalized = (value: unknown) => String(value ?? '').replaceAll('\\', '/').replace(/^\/+/, '');
const identity = (value: { repositoryId?: string; repositoryRelativePath?: string; sourceRef?: string }) =>
  `${String(value.repositoryId ?? '')}:${normalized(value.repositoryRelativePath ?? value.sourceRef)}`;

async function main() {
  const admission = JSON.parse(await readFile(ADMISSION_PATH, 'utf8')) as {
    status?: string; authority?: boolean; workspaceRevision?: string;
    snapshotRevision?: string; snapshotSourceCount?: number; sourceCount?: number;
    sourceSelectionChecksum?: string; sourceInventoryRevision?: string; sourceInventoryChecksum?: string;
  };
  const plan = JSON.parse(await readFile(PLAN_PATH, 'utf8')) as {
    status?: string; snapshotRevision?: string; sourceCount?: number; snapshotSourceCount?: number;
    sourceSelectionChecksum?: string; sourceInventoryRevision?: string; sourceInventoryChecksum?: string;
    recurrencePreventionProven?: boolean; knownJunkExcluded?: boolean; bindings?: Binding[];
  };
  const blockers: string[] = [];
  const violations: string[] = [];
  const admissionValid = admission.status === 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED'
    && admission.authority === true && Boolean(admission.workspaceRevision)
    && Boolean(admission.snapshotRevision)
    && Boolean(admission.sourceInventoryRevision)
    && Boolean(admission.sourceInventoryChecksum)
    && Boolean(admission.sourceSelectionChecksum);
  if (!admissionValid) blockers.push('ADMITTED_WORKSPACE_REVISION_MISSING_OR_INVALID');

  const planValid = plan.status === 'SOURCE_SELECTION_PLAN_READY_NOT_ADMITTED'
    && plan.snapshotRevision === admission.snapshotRevision
    && plan.sourceInventoryRevision === admission.sourceInventoryRevision
    && plan.sourceInventoryChecksum === admission.sourceInventoryChecksum
    && plan.sourceSelectionChecksum === admission.sourceSelectionChecksum
    && plan.sourceCount === admission.sourceCount
    && plan.recurrencePreventionProven === true
    && plan.knownJunkExcluded === true
    && Array.isArray(plan.bindings)
    && plan.bindings.length === admission.sourceCount;
  if (!planValid) blockers.push('ADMITTED_SOURCE_SELECTION_PLAN_MISMATCH');

  const snapshotPath = admission.snapshotRevision
    ? resolve(ROOT, 'docs/reports/workspace-source-snapshots', `${admission.snapshotRevision.replace(/^sha256:/, '')}.json`)
    : '';
  const snapshot = snapshotPath && existsSync(snapshotPath)
    ? JSON.parse(await readFile(snapshotPath, 'utf8')) as { snapshotRevision?: string; sources?: Source[]; repositories?: unknown[]; sourceMembershipChecksum?: string }
    : null;
  if (!snapshot) blockers.push('ADMITTED_SNAPSHOT_MISSING');
  if (snapshot && snapshot.snapshotRevision !== admission.snapshotRevision) blockers.push('SNAPSHOT_REVISION_MISMATCH');
  if (snapshot && admission.snapshotSourceCount !== undefined && Number(admission.snapshotSourceCount) !== (snapshot.sources ?? []).length) blockers.push('SNAPSHOT_SOURCE_COUNT_MISMATCH');

  const snapshotByIdentity = new Map((snapshot?.sources ?? []).map((source) => [identity(source), source] as const));
  const bindings = Array.isArray(plan.bindings) ? plan.bindings : [];
  const materializedRoot = admission.snapshotRevision
    ? resolve(ROOT, '.tmp/workspace-source-snapshots', admission.snapshotRevision.replace(/^sha256:/, ''))
    : '';
  if (!materializedRoot || !existsSync(materializedRoot)) blockers.push('MATERIALIZED_SNAPSHOT_MISSING');

  const identities = new Set<string>();
  const repositories = new Set<string>();
  let missing = 0;
  let hashMismatch = 0;
  let sizeMismatch = 0;
  let snapshotBindingMismatch = 0;
  for (const binding of bindings) {
    const bindingIdentity = identity(binding);
    if (!binding.repositoryId || !normalized(binding.repositoryRelativePath ?? binding.sourceRef)) violations.push(`IDENTITY_INCOMPLETE:${bindingIdentity}`);
    if (identities.has(bindingIdentity)) violations.push(`DUPLICATE_IDENTITY:${bindingIdentity}`);
    identities.add(bindingIdentity);
    repositories.add(String(binding.repositoryId ?? ''));

    const source = snapshotByIdentity.get(bindingIdentity);
    if (!source
      || normalized(source.sourceRef) !== normalized(binding.sourceRef)
      || source.sourceRevision !== binding.codeSourceRevision
      || source.contentDigest !== binding.contentHash
      || Number(source.byteLength) !== Number(binding.byteLength)) {
      snapshotBindingMismatch += 1;
      continue;
    }

    const sourceRef = normalized(binding.sourceRef);
    const target = resolve(materializedRoot, sourceRef);
    const escaped = relative(materializedRoot, target).startsWith(`..${sep}`) || relative(materializedRoot, target) === '..';
    if (escaped || !existsSync(target)) { missing += 1; continue; }
    const bytes = await readFile(target);
    if (binding.contentHash && digest(bytes) !== binding.contentHash) hashMismatch += 1;
    const expectedSize = Number(binding.byteLength);
    if (Number.isFinite(expectedSize) && bytes.byteLength !== expectedSize) sizeMismatch += 1;
  }
  if (missing) blockers.push('MATERIALIZED_SOURCE_MISSING');
  if (hashMismatch) blockers.push('MATERIALIZED_SOURCE_HASH_MISMATCH');
  if (sizeMismatch) blockers.push('MATERIALIZED_SOURCE_SIZE_MISMATCH');
  if (snapshotBindingMismatch) blockers.push('CANONICAL_SELECTION_SNAPSHOT_BINDING_MISMATCH');
  if (identities.size !== bindings.length) blockers.push('DUPLICATE_REPOSITORY_QUALIFIED_IDENTITY');
  if (Number(admission.sourceCount ?? -1) !== bindings.length) blockers.push('SOURCE_COUNT_MISMATCH');

  const sourceKind = 'ADMITTED_CANONICAL_SOURCE_SELECTION';
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
    snapshotSourceCount: snapshot?.sources?.length ?? 0,
    sourceCount: bindings.length,
    repositoryCount: repositories.size,
    sourceInventoryRevision: admission.sourceInventoryRevision ?? null,
    sourceInventoryChecksum: admission.sourceInventoryChecksum ?? null,
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
    snapshotBindingMismatches: snapshotBindingMismatch,
    duplicateIdentities: bindings.length - identities.size,
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
