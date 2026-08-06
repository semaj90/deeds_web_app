#!/usr/bin/env node
import fs from 'node:fs/promises';
import { extractRepositoryFeatureEvidence } from './lib/extract-repository-feature-evidence.mjs';
import { deriveFeatureIdentity } from './lib/derive-feature-identity.mjs';
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
    'Usage: node build-derived-feature-identity.mjs --file=<path> [--record=<json>] [--sidecar=<json>]'
  );
  process.exit(2);
}
const evidence = await extractRepositoryFeatureEvidence(filePath);
const record = recordPath
  ? JSON.parse(await fs.readFile(recordPath, 'utf8'))
  : {
      source_ref: filePath,
      canonical_source_ref: filePath,
      file_path: filePath,
      feature_label: evidence.source_ref.split(/[\\/]/).at(-1),
      summary: null,
    };
const sidecar = sidecarPath ? JSON.parse(await fs.readFile(sidecarPath, 'utf8')) : {};
const context = {
  ...sidecar,
  astEvidence: sidecar.astEvidence ?? evidence.ast_evidence,
  documentEvidence: {
    ...(evidence.document_evidence ?? {}),
    ...(sidecar.documentEvidence ?? {}),
    placeholders: evidence.placeholders ?? [],
  },
};
console.log(
  JSON.stringify(
    {
      schema_version: 'atlas.derived-feature-identity-receipt.v1',
      record,
      evidence,
      context,
      identity: deriveFeatureIdentity(record, context),
    },
    null,
    2
  )
);
