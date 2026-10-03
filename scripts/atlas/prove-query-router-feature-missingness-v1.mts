#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RETRIEVAL_ROUTER_TENSOR_MANIFEST_V2 } from '../../sveltekit-frontend/src/lib/server/atlas/classification/retrieval-router-tensor-manifest-v2.js';
import {
  QUERY_FEATURE_ORDER_V1,
  flattenQueryFeaturesV1,
  projectQueryFeaturesV1,
} from '../../sveltekit-frontend/src/lib/server/atlas/neural-routing/query-feature-projection-v1.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const reportPath = path.join(root, 'docs', 'reports', 'query-router-feature-missingness-v1.json');
const row = projectQueryFeaturesV1('hello');
const values = flattenQueryFeaturesV1(row);
let incompleteRejected = false;
try {
  flattenQueryFeaturesV1({ ...row, hasUrl: undefined });
} catch {
  incompleteRejected = true;
}
const report = {
  schema: 'atlas.query-router-feature-missingness-proof.v1',
  generatedAt: new Date().toISOString(),
  status: QUERY_FEATURE_ORDER_V1.length === 26
    && RETRIEVAL_ROUTER_TENSOR_MANIFEST_V2.queryFeatureOrder.join('|') === QUERY_FEATURE_ORDER_V1.join('|')
    && values.length === 26
    && Array.from(values).every(Number.isFinite)
    && row.retrievalTermDensity === 0
    && incompleteRejected
    ? 'ROUTE_FEATURE_ORDER_AND_MISSINGNESS_PROVEN'
    : 'ROUTE_FEATURE_ORDER_AND_MISSINGNESS_FAILED',
  featureRevision: 'atlas.query-feature-projection.v1',
  featureCount: QUERY_FEATURE_ORDER_V1.length,
  manifestRevision: RETRIEVAL_ROUTER_TENSOR_MANIFEST_V2.revision,
  measuredAbsence: 'FINITE_ZERO',
  unavailableFeaturePolicy: 'REJECT_MISSING_FIELD',
  canonicalAuthority: false,
  writesPerformed: false,
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, reportPath: path.relative(root, reportPath).replaceAll('\\', '/') }, null, 2));
