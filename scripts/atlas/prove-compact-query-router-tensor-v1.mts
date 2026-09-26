#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildRetrievalRouterTensorV2,
  RETRIEVAL_ROUTER_TENSOR_REVISION_V2,
} from '../../sveltekit-frontend/src/lib/server/atlas/classification/retrieval-router-tensor-manifest-v2.js';
import {
  checksumRetrievalRouterTensorV2,
  projectCompactQueryRouterTensorV1,
} from '../../sveltekit-frontend/src/lib/server/atlas/classification/project-compact-query-router-tensor-v1.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const reportPath = path.join(root, 'docs', 'reports', 'compact-query-router-tensor-projection-v1.json');
const source = buildRetrievalRouterTensorV2({
  classificationMrl128: Array.from({ length: 128 }, (_, index) => index / 100),
  ontologyMask32: Array.from({ length: 32 }, (_, index) => index + 200),
  queryFeatures: Array.from({ length: 26 }, (_, index) => index + 300),
  operationFlags16: Array.from({ length: 16 }, (_, index) => index + 400),
  runtimeResource16: Array.from({ length: 16 }, (_, index) => index + 500),
  graphToolStructure16: Array.from({ length: 16 }, (_, index) => index + 600),
});
const projected = projectCompactQueryRouterTensorV1({
  sourceTensorRevision: RETRIEVAL_ROUTER_TENSOR_REVISION_V2,
  sourceTensor: source,
  sourceTensorChecksum: checksumRetrievalRouterTensorV2(source),
});
const classificationParity = Array.from(projected.tensor.slice(0, 128)).every((value, index) => value === source[index]);
const queryFeatureParity = Array.from(projected.tensor.slice(128)).every((value, index) => value === source[160 + index]);
const report = {
  schema: 'atlas.compact-query-router-tensor-projection-proof.v1',
  generatedAt: new Date().toISOString(),
  status: classificationParity && queryFeatureParity && projected.tensor.length === 154
    ? 'ROUTER_TENSOR_PROJECTION_PARITY_PROVEN'
    : 'ROUTER_TENSOR_PROJECTION_PARITY_FAILED',
  source: {
    revision: projected.sourceTensorRevision,
    width: projected.sourceWidth,
    checksum: projected.sourceTensorChecksum,
  },
  output: {
    width: projected.tensorWidth,
    checksum: projected.tensorChecksum,
    classificationMrl128Parity: classificationParity,
    deterministicQueryFeatures26Parity: queryFeatureParity,
  },
  sections: projected.sections,
  evidenceAuthority: false,
  canonicalAuthority: false,
  writesPerformed: false,
  nextGate: 'ROUTE-MISSINGNESS-01',
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, outputWidth: report.output.width, reportPath: path.relative(root, reportPath).replaceAll('\\', '/') }, null, 2));
