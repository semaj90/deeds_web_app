import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { candidateOrdinalMapV1Schema } from '../../sveltekit-frontend/src/lib/server/atlas/features/canonical-candidate-v1.js';
import {
  buildRevisionAuthorityEnvelopeV1,
  verifyRevisionAuthorityEnvelopeV1,
} from '../../sveltekit-frontend/src/lib/server/atlas/identity/revision-authority-envelope-v1.js';
import { materializeWorkspaceRevisionOriginV1 } from '../../sveltekit-frontend/src/lib/server/atlas/indexing/workspace-revision-origin-runtime-v1.js';

function parseArgs(argv: readonly string[]) {
  let ordinalMap = '.tmp/atlas/ace-golden-candidate-map-v1.json';
  let workspaceRoot = resolve(import.meta.dirname, '../..');
  let repositoryId = 'semaj90/deeds_web_app';
  let output = '.tmp/atlas/ace-revision-authority-envelope-v1.json';
  let report = 'docs/reports/ace-revision-authority-v1.json';

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--ordinal-map') ordinalMap = argv[++i] ?? ordinalMap;
    else if (arg === '--workspace-root') workspaceRoot = argv[++i] ?? workspaceRoot;
    else if (arg === '--repository-id') repositoryId = argv[++i] ?? repositoryId;
    else if (arg === '--output') output = argv[++i] ?? output;
    else if (arg === '--report') report = argv[++i] ?? report;
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: npm exec -- tsx scripts/atlas/materialize-ace-revision-authority-v1.mts -- [--ordinal-map <file>] [--workspace-root <root>] [--repository-id <id>] [--output <file>] [--report <file>]');
      process.exit(0);
    } else {
      throw new Error(`ACE_REVISION_AUTHORITY_UNKNOWN_ARGUMENT:${arg}`);
    }
  }

  return {
    ordinalMap: resolve(ordinalMap),
    workspaceRoot: resolve(workspaceRoot),
    repositoryId,
    output: resolve(output),
    report: resolve(report),
  };
}

async function writeReport(path: string, report: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const ordinalMap = candidateOrdinalMapV1Schema.parse(JSON.parse(await readFile(args.ordinalMap, 'utf8')));
  const producerRevision = 'atlas.ace-revision-authority-materializer.v1';

  const origin = materializeWorkspaceRevisionOriginV1({
    workspaceRoot: args.workspaceRoot,
    repositoryId: args.repositoryId,
    producerRevision,
  });

  const candidateSourceRefs = [...new Set(ordinalMap.candidates.map((candidate) => candidate.sourceRef).filter((value): value is string => Boolean(value)))].sort();
  const candidateBySource = new Map(ordinalMap.candidates.filter((candidate) => candidate.sourceRef !== null).map((candidate) => [candidate.sourceRef!, candidate]));
  const originBySource = new Map(origin.bindings.map((binding) => [binding.sourceRef, binding]));
  const candidateErrors: string[] = [];

  for (const sourceRef of candidateSourceRefs) {
    const candidate = candidateBySource.get(sourceRef)!;
    const binding = originBySource.get(sourceRef);
    if (!binding) {
      candidateErrors.push(`SOURCE_BINDING_MISSING:${sourceRef}`);
      continue;
    }
    if (binding.sourceRevision !== candidate.sourceRevision) {
      candidateErrors.push(`SOURCE_REVISION_MISMATCH:${sourceRef}:${binding.sourceRevision}:${candidate.sourceRevision}`);
    }
  }

  const workspaceMatches = origin.record.workspaceRevision === ordinalMap.workspaceRevision;
  if (!workspaceMatches || candidateErrors.length > 0) {
    const blocked = {
      schema: 'atlas.ace-revision-authority-materialization-receipt.v1',
      status: 'ACE_REVISION_AUTHORITY_BLOCKED',
      expectedWorkspaceRevision: ordinalMap.workspaceRevision,
      observedWorkspaceRevision: origin.record.workspaceRevision,
      workspaceRevisionExact: workspaceMatches,
      repositoryId: origin.record.repositoryId,
      sourceBindingCount: origin.bindings.length,
      candidateSourceCount: candidateSourceRefs.length,
      candidateErrors,
      envelopeWritten: false,
      writesPerformed: false,
      databaseWritesPerformed: false,
      qdrantWritesPerformed: false,
      graphWritesPerformed: false,
      cacheWritesPerformed: false,
      canonicalAuthority: false,
      blocker: !workspaceMatches
        ? 'WORKSPACE_REVISION_MISMATCH: use the exact frozen workspace bytes or an authoritative preserved WorkspaceRevisionRecordV1 + complete bindings; do not substitute current worktree state.'
        : 'CANDIDATE_SOURCE_AUTHORITY_MISMATCH',
    } as const;
    await writeReport(args.report, blocked);
    console.log(JSON.stringify(blocked));
    process.exitCode = 2;
    return;
  }

  const envelope = buildRevisionAuthorityEnvelopeV1({
    record: origin.record,
    bindings: origin.bindings,
  });
  verifyRevisionAuthorityEnvelopeV1(envelope);

  const claims = new Map(envelope.sourceClaims.map((claim) => [claim.sourceRef, claim]));
  for (const candidate of ordinalMap.candidates) {
    if (candidate.sourceRef === null) throw new Error(`ACE_REVISION_AUTHORITY_CANDIDATE_SOURCE_REF_REQUIRED:${candidate.candidateOrdinal}`);
    const claim = claims.get(candidate.sourceRef);
    if (!claim || claim.sourceRevision !== candidate.sourceRevision) {
      throw new Error(`ACE_REVISION_AUTHORITY_CANDIDATE_CLAIM_MISMATCH:${candidate.candidateOrdinal}:${candidate.sourceRef}`);
    }
  }

  await mkdir(dirname(args.output), { recursive: true });
  await writeFile(args.output, `${JSON.stringify(envelope, null, 2)}\n`, 'utf8');

  const report = {
    schema: 'atlas.ace-revision-authority-materialization-receipt.v1',
    status: 'ACE_REVISION_AUTHORITY_READY',
    workspaceRevision: envelope.workspaceRevision,
    repositoryId: envelope.repositoryId,
    workspaceManifestChecksum: envelope.workspaceManifestChecksum,
    workspaceRecordChecksum: envelope.workspaceRecordChecksum,
    sourceBindingSetChecksum: envelope.sourceBindingSetChecksum,
    sourceBindingCount: envelope.sourceBindingCount,
    candidateSourceCount: candidateSourceRefs.length,
    candidateSourceClaimsExact: true,
    syntheticRevisionCount: envelope.syntheticRevisionCount,
    authorityChecksum: envelope.authorityChecksum,
    envelopeWritten: true,
    output: args.output,
    writesPerformed: false,
    databaseWritesPerformed: false,
    qdrantWritesPerformed: false,
    graphWritesPerformed: false,
    cacheWritesPerformed: false,
    canonicalAuthority: false,
    nextGate: 'ACE_LIVE_DRY_INPUT_READINESS',
  } as const;
  await writeReport(args.report, report);
  console.log(JSON.stringify(report));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
