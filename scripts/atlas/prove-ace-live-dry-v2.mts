import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { z } from 'zod';

import {
  candidateOrdinalMapV1Schema,
} from '../../sveltekit-frontend/src/lib/server/atlas/features/canonical-candidate-v1.js';
import {
  candidateFeatureSnapshotV1Schema,
} from '../../sveltekit-frontend/src/lib/server/atlas/features/candidate-feature-snapshot-v1.js';
import {
  revisionAuthorityEnvelopeV1Schema,
} from '../../sveltekit-frontend/src/lib/server/atlas/identity/revision-authority-envelope-v1.js';
import {
  buildSearchRuntimeFeatureBundleV1,
  verifySearchRuntimeFeatureBundleV1,
} from '../../sveltekit-frontend/src/lib/server/atlas/retrieval/search-runtime-feature-bundle-provider-v1.js';
import {
  buildAceContextManifestAdmissionV1,
} from '../../sveltekit-frontend/src/lib/server/atlas/context/ace-context-manifest-admission-v1.js';

const aceLiveDryInputV2Schema = z.object({
  schema: z.literal('atlas.ace-live-dry-input.v2'),
  expectedCandidateCount: z.number().int().positive().default(15),
  ordinalMap: candidateOrdinalMapV1Schema,
  snapshot: candidateFeatureSnapshotV1Schema,
  revisionAuthority: revisionAuthorityEnvelopeV1Schema,
  ace: z.object({
    requestId: z.string().min(1),
    selectedOrdinals: z.array(z.number().int().nonnegative()).optional(),
    tokenBudget: z.number().int().positive(),
    retrievalPolicyRevision: z.string().min(1),
    acePlaybookRevision: z.string().min(1),
    representationRevision: z.string().min(1),
    ontologyRevision: z.string().min(1).nullable().optional(),
    modelRevision: z.string().min(1).nullable().optional(),
    promptTemplateRevision: z.string().min(1).nullable().optional(),
    graphRevision: z.string().min(1),
  }).strict(),
}).strict();

type AceLiveDryInputV2 = z.infer<typeof aceLiveDryInputV2Schema>;

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

function selectedRows(input: AceLiveDryInputV2) {
  const ordinals = [...new Set(input.ace.selectedOrdinals ?? input.snapshot.rows.map((row) => row.candidateOrdinal))]
    .sort((a, b) => a - b);
  return ordinals.map((ordinal) => {
    const row = input.snapshot.rows.find((candidate) => candidate.candidateOrdinal === ordinal);
    if (!row) throw new Error(`ACE_LIVE_DRY_SELECTED_ORDINAL_MISSING:${ordinal}`);
    return row;
  });
}

function assertStrictCanary(input: AceLiveDryInputV2) {
  if (input.ordinalMap.rowCount !== input.expectedCandidateCount ||
      input.snapshot.rowCount !== input.expectedCandidateCount) {
    throw new Error(`ACE_LIVE_DRY_CANDIDATE_COUNT_MISMATCH:${input.ordinalMap.rowCount}:${input.snapshot.rowCount}:${input.expectedCandidateCount}`);
  }
  const rows = selectedRows(input);
  if (rows.length !== input.expectedCandidateCount) {
    throw new Error(`ACE_LIVE_DRY_SELECTED_COUNT_MISMATCH:${rows.length}:${input.expectedCandidateCount}`);
  }
  const graphRevisions = [...new Set(rows.map((row) => row.graphRevision))];
  if (graphRevisions.length !== 1 || graphRevisions[0] === null) {
    throw new Error(`ACE_LIVE_DRY_GRAPH_REVISION_NOT_SINGLE_EXACT:${graphRevisions.map(String).join(',')}`);
  }
  if (graphRevisions[0] !== input.ace.graphRevision) {
    throw new Error(`ACE_LIVE_DRY_GRAPH_REVISION_MISMATCH:${graphRevisions[0]}:${input.ace.graphRevision}`);
  }
  if (rows.some((row) => row.sourceRevision === null)) {
    throw new Error('ACE_LIVE_DRY_SOURCE_REVISION_MISSING');
  }
}

async function main() {
  const { inputPath, reportPath } = parseArgs(process.argv.slice(2));
  const raw = JSON.parse(await readFile(inputPath, 'utf8')) as unknown;
  const input = aceLiveDryInputV2Schema.parse(raw);
  assertStrictCanary(input);

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
    graphRevision: input.ace.graphRevision,
  };
  const aceA = buildAceContextManifestAdmissionV1(admissionInput);
  const aceB = buildAceContextManifestAdmissionV1(admissionInput);

  if (aceA.manifest.identityChecksum !== aceB.manifest.identityChecksum ||
      aceA.selectedOrdinalSetChecksum !== aceB.selectedOrdinalSetChecksum ||
      aceA.sourceRevisionSetChecksum !== aceB.sourceRevisionSetChecksum) {
    throw new Error('ACE_LIVE_DRY_CONTEXT_REPLAY_MISMATCH');
  }
  if (aceA.sourceRevisionSetChecksum !== bundleA.sourceRevisionSetChecksum) {
    throw new Error(`ACE_LIVE_DRY_SOURCE_REVISION_SET_MISMATCH:${aceA.sourceRevisionSetChecksum}:${bundleA.sourceRevisionSetChecksum}`);
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
    graphRevisionSetChecksum: bundleA.graphRevisionSetChecksum,
    semanticRevisionSetChecksum: bundleA.semanticRevisionSetChecksum,
    bundleLogicalChecksum: bundleA.bundleLogicalChecksum,
    bundleEnvelopeChecksum: bundleA.bundleEnvelopeChecksum,
    envelopeVariantChecksum: envelopeVariant.bundleEnvelopeChecksum,
    aceManifestIdentityChecksum: aceA.manifest.identityChecksum,
    selectedOrdinalSetChecksum: aceA.selectedOrdinalSetChecksum,
    checks: {
      bundleReplayExact: true,
      logicalChecksumRequestIndependent: true,
      envelopeChecksumRequestBound: true,
      aceManifestReplayExact: true,
      sourceRevisionSetParity: true,
      candidateSourceAuthorityExact: true,
      graphRevisionSingleExact: true,
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
