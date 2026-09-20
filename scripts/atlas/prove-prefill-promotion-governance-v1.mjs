import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const reportPath = join(root, 'docs', 'reports', 'prefill-promotion-governance-v1.json');
const evidence = [
  'sveltekit-frontend/src/lib/server/atlas/prefill/prefill-contracts-v1.ts',
  'sveltekit-frontend/src/lib/server/atlas/classification/retrieval-executor-policy-v2.ts',
  'sveltekit-frontend/src/lib/server/atlas/orchestration/atlas-execution-pipeline-v1.ts',
  'docs/reports/current-lineage-closure-v1.json',
  'docs/reports/prefill-dag-fixture-v1.json',
  'docs/reports/gpu-executor-capability-v1.json',
];

const present = evidence.filter((file) => existsSync(join(root, file)));
const missing = evidence.filter((file) => !present.includes(file));
const lineageReportPath = join(root, 'docs', 'reports', 'current-lineage-closure-v1.json');
const fixtureReportPath = join(root, 'docs', 'reports', 'prefill-dag-fixture-v1.json');
let lineage = null;
let fixture = null;
try {
  lineage = JSON.parse(readFileSync(lineageReportPath, 'utf8'));
} catch {
  lineage = null;
}
try {
  fixture = JSON.parse(readFileSync(fixtureReportPath, 'utf8'));
} catch {
  fixture = null;
}

const fixtureReplayProven = fixture?.status === 'PREFILL_DAG_REPLAY_PROVEN'
  && fixture?.evidenceClass === 'FIXTURE_ONLY'
  && fixture?.replay?.sameManifestChecksum === true
  && fixture?.replay?.samePromptChecksum === true
  && fixture?.replay?.sameSegmentOrdering === true
  && fixture?.canonicalAuthority === false
  && fixture?.writesPerformed === false;

const receipt = {
  schema: 'atlas.prefill-promotion-governance.v1',
  status: 'GOVERNANCE_RULES_PROVEN_PROMOTION_BLOCKED',
  proofScope: 'GOVERNANCE_CONTRACT_ONLY',
  maturityModel: ['WRITTEN', 'WIRED', 'PROVEN', 'PROMOTED'],
  semantics: {
    writtenMeansArtifactOrCodeExistsOnly: true,
    wiredRequiresRuntimeCallPath: true,
    provenRequiresReplayAndReceipt: true,
    promotedRequiresExplicitDecision: true,
  },
  currentState: {
    written: present.length > 0,
    wired: false,
    proven: fixtureReplayProven,
    promoted: false,
    canonicalAuthority: false,
    writesPerformed: false,
    promotionAuthorized: false,
    lineageStatus: lineage?.status ?? 'UNAVAILABLE',
    lineageRequiredForPromotion: true,
  },
  safety: {
    executorPromotionBlockedUntilLineage: true,
    canonicalVectorCacheDatabaseWritesBlocked: true,
    deterministicCpuReferenceFallbackRequired: true,
    rollback: 'Disable challenger and retain receipts/history; do not delete evidence.',
  },
  evidence: present,
  fixtureReplay: {
    report: 'docs/reports/prefill-dag-fixture-v1.json',
    status: fixture?.status ?? 'UNAVAILABLE',
    proven: fixtureReplayProven,
    liveRetrievalExecuted: fixture?.liveRetrievalExecuted ?? false,
    modelPrefillExecuted: fixture?.modelPrefillExecuted ?? false,
  },
  missingEvidence: missing,
  evidenceChecksum: `sha256:${createHash('sha256').update(JSON.stringify(present)).digest('hex')}`,
  nextGate: 'CURRENT_SOURCE_AUTHORITY_AND_LIVE_EXECUTOR_READBACK',
};

writeFileSync(reportPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: receipt.status, report: reportPath, writesPerformed: false }, null, 2));
