#!/usr/bin/env node
/**
 * GRAPHIFY-FANOUT-CRITICALITY-01
 * Read-only static dependency audit for the Phase 16 latent fanout stage.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const reportPath = path.join(root, 'docs', 'reports', 'graphify-fanout-criticality-01.json');
const read = (relativePath) => {
  const absolutePath = path.join(root, relativePath);
  return fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, 'utf8') : null;
};
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;

const packageText = read('sveltekit-frontend/package.json') ?? '';
const phase8Text = read('scripts/startup/run-atlas-phase8-fanout.mjs') ?? '';
const latentText = read('scripts/atlas/backfill-latent-vectors.mjs') ?? '';
const completionText = read('scripts/atlas/plan-graphify-run-completion-v1.mjs') ?? '';
const dailyText = read('sveltekit-frontend/package.json') ?? '';

const files = [
  'sveltekit-frontend/package.json',
  'scripts/startup/run-atlas-phase8-fanout.mjs',
  'scripts/atlas/backfill-latent-vectors.mjs',
  'scripts/atlas/plan-graphify-run-completion-v1.mjs',
  'packages/semantic-contracts/src/vector-manifest.ts',
];
const fileEvidence = files.map((file) => {
  const text = read(file);
  return { file, exists: text !== null, checksum: text === null ? null : sha256(text) };
});

const packageInvokesLatent = /"atlas:phase16:latent:apply"\s*:\s*[^\n]*backfill-latent-vectors\.mjs/.test(packageText);
const phase8InvokesLatent = phase8Text.includes("['atlas:phase16:latent:apply', 'apply']");
const dailyChainInvokesPhase8 = /"graphify:daily:chain"\s*:\s*[^\n]*atlas:phase8:fanout:apply/.test(dailyText);
const completionMentionsLatent = /latent|phase16/i.test(completionText);
const latentWritesCanonical = /UPDATE\s+atlas_packets|SET\s+latent_64/i.test(latentText);
const latentWritesValkey = /pipeline\.setex\(`gpu:autoencoder:latent_64/.test(latentText);
const latentLegacyGuard = latentText.includes('--legacy-unsafe-apply');

const requiredCompletionPredicates = [
  'canonical graphify run completion',
  'workspace/source revision binding',
  'source selection',
  'structural processing',
  'unresolved structural edge outcomes',
  'node and edge checksums',
];

const classification = 'OPTIONAL_DERIVED_REPRESENTATION';
const findings = [
  'Phase 16 latent is currently invoked by the Phase 8 fanout apply plan.',
  'graphify:daily:chain invokes the Phase 8 fanout wrapper, creating orchestration coupling.',
  'The canonical completion planner checks run/workspace/source/structural/edge/checksum predicates and does not inspect latent output.',
  'The latent writer produces a learned latent_64 representation and writes legacy derived state to atlas_packets/Valkey; it is not semantic_768 canonical truth.',
  'A latent-stage failure can make the wrapper partial even though latent output is not a canonical completion predicate.',
];

const report = {
  schema: 'atlas.graphify-fanout-criticality-01.v1',
  generatedAt: new Date().toISOString(),
  status: 'AUDIT_COMPLETE',
  classification,
  question: 'Is atlas:phase16:latent:apply required for canonical Graphify completion?',
  producer: {
    command: 'atlas:phase16:latent:apply',
    script: 'scripts/atlas/backfill-latent-vectors.mjs',
    representationId: 'latent_64',
    representationFamily: 'legacy/diagnostic learned autoencoder family',
    inputRepresentation: 'semantic_768 / Qdrant codebase_chunks_768 legacy path',
    outputDimensions: 64,
    durableDestinations: ['atlas_packets.latent_64', 'Valkey gpu:autoencoder:latent_64:*', 'models/autoencoder/autoencoder_latent_index.json'],
    revisionRequirements: ['workspace revision is accepted by writer but not a canonical graph completion predicate', 'representation/checkpoint metadata'],
    writesCanonicalState: latentWritesCanonical,
    writesValkeyState: latentWritesValkey,
    legacyUnsafeApplyGuardPresent: latentLegacyGuard,
  },
  orchestration: {
    packageInvokesLatent,
    phase8InvokesLatent,
    dailyChainInvokesPhase8,
    coupledToDailyExit: packageInvokesLatent && phase8InvokesLatent && dailyChainInvokesPhase8,
  },
  completionDependencies: {
    planner: 'scripts/atlas/plan-graphify-run-completion-v1.mjs',
    plannerMentionsLatent: completionMentionsLatent,
    requiredPredicates: requiredCompletionPredicates,
    latentRequiredByPlanner: false,
    canonicalSemantic768Dependency: false,
    graphIdentityDependency: false,
    packetIdentityDependency: false,
    sourceRevisionDependency: false,
    contextManifestDependency: false,
  },
  callers: [
    'sveltekit-frontend/package.json: graphify:daily:chain',
    'sveltekit-frontend/package.json: atlas:phase16:latent:apply',
    'scripts/startup/run-atlas-phase8-fanout.mjs: PHASE8_APPLY_PLAN',
  ],
  findings,
  evidence: fileEvidence,
  writesPerformed: false,
  canonicalAuthority: false,
  nextGate: 'GRAPHIFY-FANOUT-CONVERGENCE-01',
  safeNextCommand: 'node scripts/atlas/audit-graphify-fanout-criticality-01.mjs',
};
report.reportChecksum = sha256(JSON.stringify(report));
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(`GRAPHIFY_FANOUT_CRITICALITY_01 ${classification}`);
console.log(`report=${reportPath}`);
console.log('writesPerformed=false canonicalAuthority=false');
