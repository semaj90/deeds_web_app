import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outputDirectory = path.join(root, '.tmp/atlas');
const digest = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const query = `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '30s';
SELECT json_build_object(
  'snapshot', pg_current_snapshot()::text,
  'observedAt', transaction_timestamp(),
  'mappingRows', (SELECT coalesce(json_agg(row_to_json(m) ORDER BY feature_id, normalized_path), '[]'::json)
    FROM (SELECT feature_id, normalized_path, source_ref FROM atlas_feature_map) m),
  'productCandidates', (SELECT coalesce(json_agg(row_to_json(f) ORDER BY feature_id), '[]'::json)
    FROM (SELECT feature_id, feature_key, feature_label, domain, status, feature_revision,
      producer_revision, source_revision FROM atlas_fi_features) f)
);
ROLLBACK;`;
const captured = execFileSync('docker', ['exec', '-i', 'legal-ai-postgres', 'psql', '-XqAt',
  '-v', 'ON_ERROR_STOP=1', '-U', 'legal_admin', '-d', 'legal_ai_db'], {
  input: query, encoding: 'utf8', timeout: 45_000, maxBuffer: 16 * 1024 * 1024, windowsHide: true,
});
const census = JSON.parse(captured.trim());
const groups = new Map();
for (const row of census.mappingRows) {
  if (!row.feature_id) continue;
  if (!groups.has(row.feature_id)) groups.set(row.feature_id, []);
  groups.get(row.feature_id).push(row);
}
const records = [];
for (const [localFeatureId, occurrences] of groups) {
  const sourceRefs = [...new Set(occurrences.map(row => row.source_ref).filter(Boolean))].sort();
  if (sourceRefs.length < 2) continue;
  records.push({
    recordKind: 'MULTI_SOURCE_LOCAL_ID', localFeatureId, sourceNamespace: null,
    sourceRefCount: sourceRefs.length, sourceRefs, occurrences,
    reviewPriority: localFeatureId.includes('.') ? 'HIGH' : 'NORMAL',
    equivalenceStatus: 'UNKNOWN', canonicalFeatureId: null, mappingDecision: 'NOT_MAPPED',
    missingEvidence: ['REVIEWED_NAMESPACE', 'SOURCE_WORKSPACE_REVISION_BINDINGS', 'REVIEWED_EQUIVALENCE'],
  });
}
records.sort((left, right) => left.reviewPriority === right.reviewPriority
  ? left.localFeatureId.localeCompare(right.localFeatureId, 'en')
  : left.reviewPriority === 'HIGH' ? -1 : 1);
for (const candidate of census.productCandidates) {
  records.push({ recordKind: 'PRODUCT_FEATURE_CANDIDATE', candidate,
    equivalenceStatus: 'UNKNOWN', canonicalFeatureId: null, mappingDecision: 'NOT_MAPPED' });
}
const manifest = records.map(record => JSON.stringify(record)).join('\n') + '\n';
const summary = {
  schema: 'atlas.identity-review-manifest.v2', observedAt: census.observedAt, databaseSnapshot: census.snapshot,
  query, queryChecksum: digest(query), inputChecksum: digest(JSON.stringify(census)),
  mappingRows: census.mappingRows.length,
  multiSourceIdsCovered: records.filter(record => record.recordKind === 'MULTI_SOURCE_LOCAL_ID').length,
  dottedIdsPrioritized: records.filter(record => record.reviewPriority === 'HIGH').length,
  productCandidatesCovered: census.productCandidates.length,
  sourceReferencesCompleteWithinSnapshot: true,
  manifestChecksum: digest(manifest), autoMappedCount: 0, canonicalIdsMinted: 0,
  canonicalAuthority: false, productionWritesPerformed: 0,
};
fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(path.join(outputDirectory, 'identity-review-census-input-v2.json'), JSON.stringify(census) + '\n');
fs.writeFileSync(path.join(outputDirectory, 'identity-review-manifest-v2.jsonl'), manifest);
fs.writeFileSync(path.join(outputDirectory, 'identity-review-manifest-summary-v2.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ ...summary, query: undefined }));
