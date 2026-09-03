import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { candidateOrdinalMapV1Schema } from '../../sveltekit-frontend/src/lib/server/atlas/features/canonical-candidate-v1.js';
import { candidateFeatureSnapshotV1Schema } from '../../sveltekit-frontend/src/lib/server/atlas/features/candidate-feature-snapshot-v1.js';
import { revisionAuthorityEnvelopeV1Schema } from '../../sveltekit-frontend/src/lib/server/atlas/identity/revision-authority-envelope-v1.js';
import {
  buildSearchRuntimeFeatureBundleV1,
  verifySearchRuntimeFeatureBundleV1,
} from '../../sveltekit-frontend/src/lib/server/atlas/retrieval/search-runtime-feature-bundle-provider-v1.js';

function parseArgs(argv: readonly string[]) {
  let ordinalMap: string | null = null;
  let snapshot: string | null = null;
  let revisionAuthority: string | null = null;
  let report = 'docs/reports/ace-live-dry-input-readiness-v2.json';

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--ordinal-map') ordinalMap = argv[++i] ?? null;
    else if (arg === '--snapshot') snapshot = argv[++i] ?? null;
    else if (arg === '--revision-authority') revisionAuthority = argv[++i] ?? null;
    else if (arg === '--report') report = argv[++i] ?? report;
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: npm exec -- tsx scripts/atlas/audit-ace-live-dry-input-readiness-v2.mts -- --ordinal-map <file> --snapshot <file> --revision-authority <file> [--report <file>]');
      process.exit(0);
    } else {
      throw new Error(`ACE_LIVE_DRY_READINESS_UNKNOWN_ARGUMENT:${arg}`);
    }
  }

  return {
    ordinalMap: ordinalMap ? resolve(ordinalMap) : null,
    snapshot: snapshot ? resolve(snapshot) : null,
    revisionAuthority: revisionAuthority ? resolve(revisionAuthority) : null,
    report: resolve(report),
  };
}

async function validateFile(label: string, path: string | null, schema: { safeParse(input: unknown): { success: boolean; error?: { issues?: unknown[] }; data?: unknown } }) {
  if (!path) return { label, status: 'MISSING_ARGUMENT' as const, path: null, issues: [] as unknown[] };
  try {
    const parsedJson = JSON.parse(await readFile(path, 'utf8')) as unknown;
    const parsed = schema.safeParse(parsedJson);
    return parsed.success
      ? { label, status: 'VALID' as const, path, issues: [] as unknown[], data: parsed.data }
      : { label, status: 'INVALID_SCHEMA' as const, path, issues: parsed.error?.issues ?? [] };
  } catch (error) {
    return {
      label,
      status: 'UNREADABLE' as const,
      path,
      issues: [error instanceof Error ? error.message : String(error)],
    };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const ordinal = await validateFile('CandidateOrdinalMapV1', args.ordinalMap, candidateOrdinalMapV1Schema);
  const snapshot = await validateFile('CandidateFeatureSnapshotV1', args.snapshot, candidateFeatureSnapshotV1Schema);
  const authority = await validateFile('RevisionAuthorityEnvelopeV1', args.revisionAuthority, revisionAuthorityEnvelopeV1Schema);

  const checks = [ordinal, snapshot, authority];
  const valid = checks.every((check) => check.status === 'VALID');
  const blockers = checks.filter((check) => check.status !== 'VALID').map((check) => `${check.label}:${check.status}`);

  let crossContractStatus: 'NOT_CHECKED' | 'PASS' | 'FAIL' = 'NOT_CHECKED';
  const crossContractErrors: string[] = [];
  let bundleLogicalChecksum: string | null = null;
  let bundleEnvelopeChecksum: string | null = null;

  if (valid) {
    const ordinalData = candidateOrdinalMapV1Schema.parse(ordinal.data);
    const snapshotData = candidateFeatureSnapshotV1Schema.parse(snapshot.data);
    const authorityData = revisionAuthorityEnvelopeV1Schema.parse(authority.data);

    try {
      const bundle = buildSearchRuntimeFeatureBundleV1({
        requestId: 'ace-live-dry-readiness-audit-v2',
        ordinalMap: ordinalData,
        snapshot: snapshotData,
        revisionAuthority: authorityData,
      });
      verifySearchRuntimeFeatureBundleV1(bundle);
      bundleLogicalChecksum = bundle.bundleLogicalChecksum;
      bundleEnvelopeChecksum = bundle.bundleEnvelopeChecksum;
    } catch (error) {
      crossContractErrors.push(`SERVER_FEATURE_BUNDLE_VERIFY_FAILED:${error instanceof Error ? error.message : String(error)}`);
    }

    if (ordinalData.ordinalMapChecksum !== snapshotData.ordinalMapChecksum) {
      crossContractErrors.push('ORDINAL_MAP_CHECKSUM_MISMATCH');
    }
    if (ordinalData.candidateSnapshotRevision !== snapshotData.candidateSnapshotRevision) {
      crossContractErrors.push('CANDIDATE_SNAPSHOT_REVISION_MISMATCH');
    }
    if (ordinalData.workspaceRevision !== snapshotData.workspaceRevision || ordinalData.workspaceRevision !== authorityData.workspaceRevision) {
      crossContractErrors.push('WORKSPACE_REVISION_MISMATCH');
    }
    if (ordinalData.rowCount !== snapshotData.rowCount) {
      crossContractErrors.push('CANDIDATE_COUNT_MISMATCH');
    }

    crossContractStatus = crossContractErrors.length === 0 ? 'PASS' : 'FAIL';
  }

  const ready = valid && crossContractStatus === 'PASS';
  const report = {
    schema: 'atlas.ace-live-dry-input-readiness.v2',
    status: ready ? 'ACE_LIVE_DRY_INPUT_READY' : 'ACE_LIVE_DRY_INPUT_BLOCKED',
    checks: checks.map(({ data: _data, ...check }) => check),
    crossContractStatus,
    crossContractErrors,
    blockers: [...blockers, ...crossContractErrors],
    sealedBundleVerification: {
      attempted: valid,
      passed: ready,
      bundleLogicalChecksum,
      bundleEnvelopeChecksum,
      candidateSourceAuthorityVerified: ready,
    },
    writesPerformed: false,
    cacheWritesPerformed: false,
    canonicalAuthority: false,
    nextCommand: ready
      ? 'npm exec -- tsx scripts/atlas/materialize-ace-live-dry-input-v2.mts -- --ordinal-map <file> --snapshot <file> --revision-authority <file> --request-id <id> --token-budget <n> --retrieval-policy-revision <rev> --ace-playbook-revision <rev> --representation-revision <rev>'
      : 'Provide only the missing/invalid authoritative artifacts; do not synthesize replacements.',
  };

  await mkdir(dirname(args.report), { recursive: true });
  await writeFile(args.report, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report));
  if (!ready) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
