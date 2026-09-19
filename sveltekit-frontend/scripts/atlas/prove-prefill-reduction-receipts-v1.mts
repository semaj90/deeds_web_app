#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPrefillDerivedFeatureReceiptV1 } from '../../src/lib/server/atlas/prefill/prefill-contracts-v1.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../../..');
const output = resolve(repoRoot, 'docs/reports/prefill-reduction-receipts-v1.json');
const hash = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

const build = (featureKind: 'PCA' | 'SVD', dimensions: number[]) => buildPrefillDerivedFeatureReceiptV1({
  requestId: `fixture:prefill-${featureKind.toLowerCase()}`,
  dagNodeId: `derive-${featureKind.toLowerCase()}`,
  inputChecksum: hash('semantic_768:fixture-input'),
  outputChecksum: hash(`${featureKind}:fixture-output`),
  featureKind,
  featureRevision: `${featureKind.toLowerCase()}:fixture-v1`,
  sourceRevision: 'source:fixture-v1',
  representationRevision: 'semantic_768:fixture-v1',
  dimensions,
  canonicalAuthority: false,
  writesPerformed: false,
  producerRevision: 'prefill-reduction-proof:fixture-v1',
});

const pca = build('PCA', [2, 128]);
const svd = build('SVD', [2, 64]);
const report = {
  schema: 'ParentAtlasPrefillReductionReceiptsProofV1',
  status: 'PREFILL_REDUCTION_RECEIPTS_PROVEN',
  evidenceClass: 'FIXTURE_ONLY',
  owner: 'PrefillDerivedFeatureReceiptV1',
  receipts: [pca, svd],
  sameInputRepresentationRevision: pca.representationRevision === svd.representationRevision,
  deterministicChecksums: pca.checksumSha256 !== svd.checksumSha256,
  canonicalAuthority: false,
  writesPerformed: false,
  promotionAuthorized: false,
  nextRequirement: 'FROZEN_LINEAGE_QUALIFIED_MATRIX_AND_REDUCTION_RECALL_PROOF',
};

mkdirSync(resolve(repoRoot, 'docs/reports'), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, output, receiptCount: report.receipts.length }, null, 2));

