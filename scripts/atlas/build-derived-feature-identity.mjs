#!/usr/bin/env node
import fs from 'node:fs/promises';
import { extractRepositoryFeatureEvidence } from './lib/extract-repository-feature-evidence.mjs';
import { deriveFeatureIdentity } from './lib/derive-feature-identity.mjs';
import { deriveFeatureIdentity as deriveFeatureIdentityV2 } from './lib/derive-feature-identityv2.mjs';
const readArg = (name) => {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : null;
};
const filePath = readArg('file') ?? process.argv[2];
const recordPath = readArg('record');
const sidecarPath = readArg('sidecar');
if (!filePath) {
  console.error(
    'Usage: node build-derived-feature-identity.mjs --file=<path> [--source-ref=<repo-relative-path>] [--record=<json>] [--sidecar=<json>] [--proposal-v2] [--feature-namespace=<namespace>]'
  );
  process.exit(2);
}
const evidence = await extractRepositoryFeatureEvidence(filePath);
const sourceRef = readArg('source-ref') ?? filePath;
const record = recordPath
  ? JSON.parse(await fs.readFile(recordPath, 'utf8'))
  : {
      source_ref: sourceRef,
      canonical_source_ref: sourceRef,
      file_path: sourceRef,
      feature_label: evidence.source_ref.split(/[\\/]/).at(-1),
      summary: null,
    };
const sidecar = sidecarPath ? JSON.parse(await fs.readFile(sidecarPath, 'utf8')) : {};
const context = {
  ...sidecar,
  featureNamespace: readArg('feature-namespace') ?? sidecar.featureNamespace,
  astEvidence: sidecar.astEvidence ?? evidence.ast_evidence,
  documentEvidence: {
    ...(evidence.document_evidence ?? {}),
    ...(sidecar.documentEvidence ?? {}),
    placeholders: evidence.placeholders ?? [],
  },
};
const result = {
  schema_version: 'atlas.derived-feature-identity-receipt.v1',
  record,
  evidence,
  context,
  identity: deriveFeatureIdentity(record, context),
};
if (process.argv.includes('--proposal-v2')) {
  result.identityProposalV2 = deriveFeatureIdentityV2(record, context);
}
console.log(JSON.stringify(result, null, 2));
