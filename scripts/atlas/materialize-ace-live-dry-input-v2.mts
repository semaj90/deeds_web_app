import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
  aceLiveDryInputV2Schema,
  resolveAceLiveDryGraphRevisionV2,
  selectedAceLiveDryRowsV2,
  validateAceLiveDryCanaryV2,
} from '../../sveltekit-frontend/src/lib/server/atlas/context/ace-live-dry-input-v2.js';
import { candidateOrdinalMapV1Schema } from '../../sveltekit-frontend/src/lib/server/atlas/features/canonical-candidate-v1.js';
import { candidateFeatureSnapshotV1Schema } from '../../sveltekit-frontend/src/lib/server/atlas/features/candidate-feature-snapshot-v1.js';
import { revisionAuthorityEnvelopeV1Schema } from '../../sveltekit-frontend/src/lib/server/atlas/identity/revision-authority-envelope-v1.js';
import {
  buildSearchRuntimeFeatureBundleV1,
  verifySearchRuntimeFeatureBundleV1,
} from '../../sveltekit-frontend/src/lib/server/atlas/retrieval/search-runtime-feature-bundle-provider-v1.js';

interface Args {
  ordinalMap: string | null;
  snapshot: string | null;
  revisionAuthority: string | null;
  requestId: string | null;
  tokenBudget: number | null;
  retrievalPolicyRevision: string | null;
  acePlaybookRevision: string | null;
  representationRevision: string | null;
  ontologyRevision: string | null;
  modelRevision: string | null;
  promptTemplateRevision: string | null;
  expectedCandidateCount: number;
  selectedOrdinals: number[] | undefined;
  output: string;
  report: string;
}

function parseOrdinalList(value: string): number[] {
  const parsed = value.split(',').map((item) => Number(item.trim()));
  if (parsed.length === 0 || parsed.some((item) => !Number.isInteger(item) || item < 0)) {
    throw new Error(`ACE_LIVE_DRY_INPUT_SELECTED_ORDINALS_INVALID:${value}`);
  }
  return [...new Set(parsed)].sort((a, b) => a - b);
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = {
    ordinalMap: null,
    snapshot: null,
    revisionAuthority: null,
    requestId: null,
    tokenBudget: null,
    retrievalPolicyRevision: null,
    acePlaybookRevision: null,
    representationRevision: null,
    ontologyRevision: null,
    modelRevision: null,
    promptTemplateRevision: null,
    expectedCandidateCount: 15,
    selectedOrdinals: undefined,
    output: '.tmp/atlas/ace-live-dry-input-v2.json',
    report: 'docs/reports/ace-live-dry-input-materialization-v2.json',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[++i] ?? null;
    if (arg === '--ordinal-map') args.ordinalMap = next();
    else if (arg === '--snapshot') args.snapshot = next();
    else if (arg === '--revision-authority') args.revisionAuthority = next();
    else if (arg === '--request-id') args.requestId = next();
    else if (arg === '--token-budget') args.tokenBudget = Number(next());
    else if (arg === '--retrieval-policy-revision') args.retrievalPolicyRevision = next();
    else if (arg === '--ace-playbook-revision') args.acePlaybookRevision = next();
    else if (arg === '--representation-revision') args.representationRevision = next();
    else if (arg === '--ontology-revision') args.ontologyRevision = next();
    else if (arg === '--model-revision') args.modelRevision = next();
    else if (arg === '--prompt-template-revision') args.promptTemplateRevision = next();
    else if (arg === '--expected-candidate-count') args.expectedCandidateCount = Number(next());
    else if (arg === '--selected-ordinals') args.selectedOrdinals = parseOrdinalList(next() ?? '');
    else if (arg === '--output') args.output = next() ?? args.output;
    else if (arg === '--report') args.report = next() ?? args.report;
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: npm exec -- tsx scripts/atlas/materialize-ace-live-dry-input-v2.mts -- --ordinal-map <file> --snapshot <file> --revision-authority <file> --request-id <id> --token-budget <n> --retrieval-policy-revision <rev> --ace-playbook-revision <rev> --representation-revision <rev> [--ontology-revision <rev>] [--model-revision <rev>] [--prompt-template-revision <rev>] [--selected-ordinals 0,1,...] [--expected-candidate-count 15] [--output <file>] [--report <file>]');
      process.exit(0);
    } else {
      throw new Error(`ACE_LIVE_DRY_INPUT_UNKNOWN_ARGUMENT:${arg}`);
    }
  }
  return args;
}

function requireString(value: string | null, code: string): string {
  if (!value?.trim()) throw new Error(code);
  return value.trim();
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(path), 'utf8')) as unknown;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!Number.isInteger(args.expectedCandidateCount) || args.expectedCandidateCount <= 0) {
    throw new Error('ACE_LIVE_DRY_INPUT_EXPECTED_CANDIDATE_COUNT_INVALID');
  }
  if (!Number.isInteger(args.tokenBudget) || (args.tokenBudget ?? 0) <= 0) {
    throw new Error('ACE_LIVE_DRY_INPUT_TOKEN_BUDGET_INVALID');
  }

  const ordinalMapPath = requireString(args.ordinalMap, 'ACE_LIVE_DRY_INPUT_ORDINAL_MAP_REQUIRED');
  const snapshotPath = requireString(args.snapshot, 'ACE_LIVE_DRY_INPUT_SNAPSHOT_REQUIRED');
  const authorityPath = requireString(args.revisionAuthority, 'ACE_LIVE_DRY_INPUT_REVISION_AUTHORITY_REQUIRED');

  const ordinalMap = candidateOrdinalMapV1Schema.parse(await readJson(ordinalMapPath));
  const snapshot = candidateFeatureSnapshotV1Schema.parse(await readJson(snapshotPath));
  const revisionAuthority = revisionAuthorityEnvelopeV1Schema.parse(await readJson(authorityPath));

  const bundle = buildSearchRuntimeFeatureBundleV1({
    requestId: requireString(args.requestId, 'ACE_LIVE_DRY_INPUT_REQUEST_ID_REQUIRED'),
    ordinalMap,
    snapshot,
    revisionAuthority,
  });
  verifySearchRuntimeFeatureBundleV1(bundle);

  const partial = {
    schema: 'atlas.ace-live-dry-input.v2' as const,
    expectedCandidateCount: args.expectedCandidateCount,
    ordinalMap,
    snapshot,
    revisionAuthority,
    ace: {
      requestId: bundle.requestId,
      selectedOrdinals: args.selectedOrdinals,
      tokenBudget: args.tokenBudget!,
      retrievalPolicyRevision: requireString(args.retrievalPolicyRevision, 'ACE_LIVE_DRY_INPUT_RETRIEVAL_POLICY_REVISION_REQUIRED'),
      acePlaybookRevision: requireString(args.acePlaybookRevision, 'ACE_LIVE_DRY_INPUT_ACE_PLAYBOOK_REVISION_REQUIRED'),
      representationRevision: requireString(args.representationRevision, 'ACE_LIVE_DRY_INPUT_REPRESENTATION_REVISION_REQUIRED'),
      ontologyRevision: args.ontologyRevision,
      modelRevision: args.modelRevision,
      promptTemplateRevision: args.promptTemplateRevision,
      graphRevision: null as string | null,
    },
  };

  const provisional = aceLiveDryInputV2Schema.parse(partial);
  const selectedRows = selectedAceLiveDryRowsV2(provisional);
  const graphRevision = resolveAceLiveDryGraphRevisionV2(selectedRows);
  const input = aceLiveDryInputV2Schema.parse({
    ...partial,
    ace: {
      ...partial.ace,
      graphRevision,
    },
  });
  const canary = validateAceLiveDryCanaryV2(input);

  const output = resolve(args.output);
  const reportPath = resolve(args.report);
  await mkdir(dirname(output), { recursive: true });
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(output, `${JSON.stringify(input, null, 2)}\n`, 'utf8');

  const report = {
    schema: 'atlas.ace-live-dry-input-materialization-receipt.v2',
    status: 'ACE_LIVE_DRY_INPUT_MATERIALIZED',
    output,
    requestId: input.ace.requestId,
    expectedCandidateCount: input.expectedCandidateCount,
    selectedCandidateCount: canary.selectedRows.length,
    workspaceRevision: input.ordinalMap.workspaceRevision,
    candidateSnapshotRevision: input.ordinalMap.candidateSnapshotRevision,
    ordinalMapChecksum: input.ordinalMap.ordinalMapChecksum,
    snapshotChecksum: input.snapshot.snapshotChecksum,
    revisionAuthorityChecksum: input.revisionAuthority.authorityChecksum,
    bundleLogicalChecksum: bundle.bundleLogicalChecksum,
    graphAdmissionMode: canary.graphAdmissionMode,
    graphRevision: canary.graphRevision,
    callerOwnedRevisions: {
      retrievalPolicyRevision: input.ace.retrievalPolicyRevision,
      acePlaybookRevision: input.ace.acePlaybookRevision,
      representationRevision: input.ace.representationRevision,
      ontologyRevision: input.ace.ontologyRevision ?? null,
      modelRevision: input.ace.modelRevision ?? null,
      promptTemplateRevision: input.ace.promptTemplateRevision ?? null,
    },
    sharedCanaryValidation: true,
    syntheticTimestampRevisionsRejected: true,
    writesPerformed: false,
    databaseWritesPerformed: false,
    qdrantWritesPerformed: false,
    graphWritesPerformed: false,
    cacheWritesPerformed: false,
    canonicalAuthority: false,
    nextCommand: `npm exec -- tsx scripts/atlas/prove-ace-live-dry-v2.mts -- --input ${output}`,
  } as const;

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
