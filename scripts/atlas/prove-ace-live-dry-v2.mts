import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';

import {
  aceLiveDryInputV2Schema,
  validateAceLiveDryCanaryV2,
  type AceLiveDrySnapshotRowV2,
} from '../../sveltekit-frontend/src/lib/server/atlas/context/ace-live-dry-input-v2.js';
import {
  buildSearchRuntimeFeatureBundleV1,
  verifySearchRuntimeFeatureBundleV1,
} from '../../sveltekit-frontend/src/lib/server/atlas/retrieval/search-runtime-feature-bundle-provider-v1.js';
import {
  buildAceContextManifestAdmissionV1,
} from '../../sveltekit-frontend/src/lib/server/atlas/context/ace-context-manifest-admission-v1.js';

function parseArgs(argv: readonly string[]) {
  let inputPath: string | null = null;
  let reportPath = 'docs/reports/ace-live-dry-v2.json';
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input') inputPath = argv[++i] ?? null;
    else if (arg === '--report') reportPath = argv[++i] ?? reportPath;
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: npm exec -- tsx scripts/atlas/prove-ace-live-dry-v2.mts -- --input <revision-qualified-input.json> [--report <report.json>]');
      process.exit(0);
    } else {
      throw new Error(`ACE_LIVE_DRY_UNKNOWN_ARGUMENT:${arg}`);
    }
  }
  if (!inputPath) throw new Error('ACE_LIVE_DRY_INPUT_REQUIRED');
  return { inputPath: resolve(inputPath), reportPath: resolve(reportPath) };
}

function exactSourceRevisionSet(rows: readonly AceLiveDrySnapshotRowV2[]): string[] {
  return [...new Set(rows.map((row) => row.sourceRevision))].sort();
}

async function main() {
  const { inputPath, reportPath } = parseArgs(process.argv.slice(2));
  const raw = JSON.parse(await readFile(inputPath, 'utf8')) as unknown;
  const input = aceLiveDryInputV2Schema.parse(raw);
  const canary = validateAceLiveDryCanaryV2(input);

  const bundleInput = {
    requestId: input.ace.requestId,
    ordinalMap: input.ordinalMap,
    snapshot: input.snapshot,
    revisionAuthority: input.revisionAuthority,
  };
  const bundleA = buildSearchRuntimeFeatureBundleV1(bundleInput);
  const bundleB = buildSearchRuntimeFeatureBundleV1(bundleInput);
  verifySearchRuntimeFeatureBundleV1(bundleA);
  verifySearchRuntimeFeatureBundleV1(bundleB);

  if (bundleA.bundleLogicalChecksum !== bundleB.bundleLogicalChecksum ||
      bundleA.bundleEnvelopeChecksum !== bundleB.bundleEnvelopeChecksum) {
    throw new Error('ACE_LIVE_DRY_BUNDLE_REPLAY_MISMATCH');
  }

  const envelopeVariant = buildSearchRuntimeFeatureBundleV1({
    ...bundleInput,
    requestId: `${input.ace.requestId}:envelope-variant`,
  });
  if (envelopeVariant.bundleLogicalChecksum !== bundleA.bundleLogicalChecksum) {
    throw new Error('ACE_LIVE_DRY_LOGICAL_CHECKSUM_REQUEST_DEPENDENT');
  }
  if (envelopeVariant.bundleEnvelopeChecksum === bundleA.bundleEnvelopeChecksum) {
    throw new Error('ACE_LIVE_DRY_ENVELOPE_CHECKSUM_REQUEST_INDEPENDENT');
  }

  const admissionInput = {
    snapshot: bundleA.snapshot,
    requestId: input.ace.requestId,
    selectedOrdinals: input.ace.selectedOrdinals,
    tokenBudget: input.ace.tokenBudget,
    retrievalPolicyRevision: input.ace.retrievalPolicyRevision,
    acePlaybookRevision: input.ace.acePlaybookRevision,
    representationRevision: input.ace.representationRevision,
    ontologyRevision: input.ace.ontologyRevision ?? null,
    modelRevision: input.ace.modelRevision ?? null,
    promptTemplateRevision: input.ace.promptTemplateRevision ?? null,
    graphRevision: canary.graphRevision,
  };
  const aceA = buildAceContextManifestAdmissionV1(admissionInput);
  const aceB = buildAceContextManifestAdmissionV1(admissionInput);

  if (aceA.manifest.identityChecksum !== aceB.manifest.identityChecksum ||
      aceA.selectedOrdinalSetChecksum !== aceB.selectedOrdinalSetChecksum ||
      aceA.sourceRevisionSetChecksum !== aceB.sourceRevisionSetChecksum) {
    throw new Error('ACE_LIVE_DRY_CONTEXT_REPLAY_MISMATCH');
  }

  const selectedSourceRevisions = exactSourceRevisionSet(canary.selectedRows);
  const fullSnapshotSourceRevisions = exactSourceRevisionSet(input.snapshot.rows);
  if (JSON.stringify(selectedSourceRevisions) !== JSON.stringify(fullSnapshotSourceRevisions)) {
    throw new Error('ACE_LIVE_DRY_SOURCE_REVISION_MEMBERSHIP_MISMATCH');
  }

  const report = {
    schema: 'atlas.ace-live-dry-replay-receipt.v2',
    status: 'ACE_LIVE_DRY_REPLAY_PROVEN',
    inputFile: basename(inputPath),
    expectedCandidateCount: input.expectedCandidateCount,
    candidateCount: bundleA.candidateCount,
    workspaceRevision: bundleA.workspaceRevision,
    candidateSnapshotRevision: bundleA.candidateSnapshotRevision,
    ordinalMapChecksum: bundleA.ordinalMapChecksum,
    snapshotChecksum: bundleA.snapshot.snapshotChecksum,
    revisionAuthorityChecksum: bundleA.revisionAuthority.authorityChecksum,
    sourceRevisionSetChecksum: bundleA.sourceRevisionSetChecksum,
    aceSourceRevisionSetChecksum: aceA.sourceRevisionSetChecksum,
    graphRevisionSetChecksum: bundleA.graphRevisionSetChecksum,
    graphAdmissionMode: canary.graphAdmissionMode,
    graphRevision: canary.graphRevision,
    semanticRevisionSetChecksum: bundleA.semanticRevisionSetChecksum,
    bundleLogicalChecksum: bundleA.bundleLogicalChecksum,
    bundleEnvelopeChecksum: bundleA.bundleEnvelopeChecksum,
    envelopeVariantChecksum: envelopeVariant.bundleEnvelopeChecksum,
    aceManifestIdentityChecksum: aceA.manifest.identityChecksum,
    selectedOrdinalSetChecksum: aceA.selectedOrdinalSetChecksum,
    checks: {
      sharedCanaryValidation: true,
      bundleReplayExact: true,
      logicalChecksumRequestIndependent: true,
      envelopeChecksumRequestBound: true,
      aceManifestReplayExact: true,
      sourceRevisionMembershipExact: true,
      candidateSourceAuthorityExact: true,
      graphEvidenceAdmissionExact: true,
      syntheticTimestampRevisionsRejectedBySchema: true,
    },
    notes: {
      sourceRevisionChecksumDomains: 'Bundle and ACE source-revision-set checksums are domain-separated by schema and are not required to be byte-equal; exact revision membership is compared instead.',
      graphRevisionPolicy: 'Graph revision is required only when the selected feature snapshot actually admits graph-lane or graph-derived evidence. Semantic-only canaries must carry graphRevision=null rather than fabricate graph identity.',
      revisionPolicy: 'Policy/playbook/representation/optional ontology/model/prompt/graph revisions are validated by the shared ACE live-dry input contract and reject ISO timestamp fallbacks.',
    },
    writesPerformed: false,
    cacheWritesPerformed: false,
    canonicalAuthority: false,
  } as const;

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
