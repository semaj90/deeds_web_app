#!/usr/bin/env node
// Read-only audit: live taxonomy (domain_taxonomy_v1) + crosswalk (atlas_domain_vocabulary_crosswalk_v1) + NES LUT (palette vs atlas_nes_lut_v1).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateTaxonomy, normalizeLabel } from './lib/domain-taxonomy-contract-v1.mjs';
import { reviewDomainVocabularyCrosswalkV1, summarizeMissingFeatureIdsV1 } from './lib/domain-vocabulary-crosswalk-review-v1.mjs';
import { verifyPalette, roundTrip, comparePersisted } from './lib/nes-lut-roundtrip-v1.mjs';
import { NES_LUT_DOMAIN_PALETTE } from './lib/domain-taxonomy-nes-lut-batch-gemm-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = path.resolve(root, process.argv.find((a) => a.startsWith('--out='))?.slice(6) ?? '.tmp/atlas/taxonomy-nes-audit-20261027.json');
if (!out.startsWith(`${path.resolve(root, '.tmp/atlas')}${path.sep}`)) { console.error('OUTPUT_MUST_STAY_UNDER_TMP_ATLAS'); process.exit(2); }
const sha = (v) => `sha256:${crypto.createHash('sha256').update(v).digest('hex')}`;
const snapshotSql = `SELECT json_build_object(
  'database', current_database(),
  'serverVersion', current_setting('server_version'),
  'transactionSnapshot', pg_current_snapshot()::text,
  'taxonomyRows', (SELECT coalesce(json_agg(json_build_object('domain_id',domain_id,'label',label,'parent_domain_id',parent_domain_id,'is_active',is_active,'description',coalesce(description,''),'version',version,'deprecated_at',deprecated_at::text,'replaced_by',replaced_by) ORDER BY domain_id),'[]'::json) FROM domain_taxonomy_v1),
  'ontologyRows', (SELECT count(*) FROM atlas_domain_ontology),
  'crosswalkRows', (SELECT coalesce(json_agg(json_build_object('source_vocab',source_vocab,'source_value',source_value,'taxonomy_domain_id',taxonomy_domain_id,'match_method',match_method,'source_row_count',source_row_count,'crosswalk_version',crosswalk_version,'canonical',canonical) ORDER BY source_vocab,source_value),'[]'::json) FROM atlas_domain_vocabulary_crosswalk_v1),
  'lutRows', (SELECT coalesce(json_agg(json_build_object('domain_key',domain_key,'lut_byte',lut_byte,'nes_hex',nes_hex,'nes_byte',nes_byte,'label',label,'prior_weight',prior_weight,'taxonomy_domain_id',taxonomy_domain_id,'match_method',match_method,'lut_revision',lut_revision,'lut_checksum',lut_checksum,'canonical',canonical) ORDER BY lut_byte),'[]'::json) FROM atlas_nes_lut_v1),
  'featureMapRowCount', (SELECT count(*) FROM atlas_feature_map),
  'featureMapMissingRows', (SELECT coalesce(json_agg(json_build_object('normalized_path',normalized_path,'source_ref',source_ref,'feature_id',feature_id) ORDER BY normalized_path),'[]'::json) FROM atlas_feature_map WHERE nullif(btrim(feature_id),'') IS NULL)
)::text;`;
const snapshotLines = execFileSync('docker', ['exec', '-i', 'legal-ai-postgres', 'psql', '-X', '-qAt', '-U', 'legal_admin', '-d', 'legal_ai_db', '-v', 'ON_ERROR_STOP=1', '-f', '-'], {
  input: `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL statement_timeout = '20000'; ${snapshotSql} ROLLBACK;`,
  encoding: 'utf8',
  timeout: 30000,
}).trim().split('\n').filter((line) => line && !/^(BEGIN|ROLLBACK)$/.test(line));
const sourceSnapshot = JSON.parse(snapshotLines[0]);

// Taxonomy and dependent vocabularies come from one repeatable-read snapshot.
const taxRows = sourceSnapshot.taxonomyRows.map((row) => [row.domain_id, row.label, row.parent_domain_id ?? '', row.is_active ? 't' : 'f', row.description ?? '', String(row.version), row.deprecated_at ?? '', row.replaced_by ?? '']);
const doc = { version: Number([...new Set(taxRows.map((r) => r[5]))][0]), domains: taxRows.map(([id, label, parent, active, description]) => ({ id, label, parentId: parent || null, description, active: active === 't' })) };
const taxonomy = { ...validateTaxonomy(doc), versions: [...new Set(taxRows.map((r) => r[5]))], active: doc.domains.filter((d) => d.active).length, deprecated: taxRows.filter((r) => r[6]).length };
const cycle = (() => { const parent = new Map(doc.domains.map((d) => [d.id, d.parentId])); for (const id of parent.keys()) { const seen = new Set(); for (let cur = id; cur; cur = parent.get(cur)) { if (seen.has(cur)) return id; seen.add(cur); } } return null; })();
const ontologyRows = String(sourceSnapshot.ontologyRows);
const activeIds = new Set(doc.domains.filter((d) => d.active).map((d) => d.id));

// Crosswalk
const cross = sourceSnapshot.crosswalkRows.map((row) => ({ vocab: row.source_vocab, value: row.source_value, domain: row.taxonomy_domain_id ?? '', method: row.match_method, count: Number(row.source_row_count), version: row.crosswalk_version, canonical: row.canonical === true }));
const nameIndex = new Map(); for (const d of doc.domains) for (const n of [d.label, d.id]) nameIndex.set(normalizeLabel(n), d.id);
const dupKeys = cross.map((c) => `${c.vocab}|${c.value}`).filter((k, i, a) => a.indexOf(k) !== i);
const crosswalkReview = reviewDomainVocabularyCrosswalkV1(cross.map((row) => ({
  source_vocab: row.vocab,
  source_value: row.value,
  taxonomy_domain_id: row.domain,
  match_method: row.method,
  source_row_count: row.count,
  crosswalk_version: row.version,
  canonical: row.canonical,
})), doc.domains);
const featureMapTotal = Number(sourceSnapshot.featureMapRowCount);
const featureMapMissingRows = sourceSnapshot.featureMapMissingRows.map((row) => ({ normalized_path: row.normalized_path, source_ref: row.source_ref, feature_id: row.feature_id }));
const featureMapIdentity = summarizeMissingFeatureIdsV1(featureMapMissingRows, featureMapTotal);
const crosswalk = {
  rows: cross.length, versions: [...new Set(cross.map((c) => c.version))], methods: cross.reduce((m, c) => ((m[c.method] = (m[c.method] ?? 0) + 1), m), {}),
  anyCanonical: cross.some((c) => c.canonical), duplicateKeys: dupKeys.length,
  mappedToUnknownOrInactiveDomain: cross.filter((c) => c.domain && !activeIds.has(c.domain)).map((c) => `${c.value}->${c.domain}`),
  normalizedExactNotReproducible: cross.filter((c) => c.method === 'NORMALIZED_EXACT' && nameIndex.get(normalizeLabel(c.value)) !== c.domain).map((c) => `${c.value}->${c.domain}`),
  unresolvedLabels: cross.filter((c) => c.method === 'UNRESOLVED').length, unresolvedRowWeight: cross.filter((c) => c.method === 'UNRESOLVED').reduce((n, c) => n + c.count, 0), mappedRowWeight: cross.filter((c) => c.domain).reduce((n, c) => n + c.count, 0),
  review: crosswalkReview,
};

// NES LUT
const lutRows = sourceSnapshot.lutRows.map((row) => ({ domain_key: row.domain_key, lut_byte: row.lut_byte, nes_hex: row.nes_hex, nes_byte: row.nes_byte, label: row.label, prior_weight: row.prior_weight, taxonomy: row.taxonomy_domain_id ?? '', method: row.match_method, rev: row.lut_revision, checksum: row.lut_checksum, canonical: row.canonical ? 't' : 'f' }));
const nes = {
  palette: verifyPalette(NES_LUT_DOMAIN_PALETTE), roundTrip: roundTrip(NES_LUT_DOMAIN_PALETTE), persistedRows: lutRows.length,
  paletteVsPersisted: comparePersisted(NES_LUT_DOMAIN_PALETTE, lutRows),
  revisions: [...new Set(lutRows.map((r) => r.rev))], checksums: [...new Set(lutRows.map((r) => r.checksum))].length, anyCanonical: lutRows.some((r) => r.canonical === 't'),
  taxonomyMapped: lutRows.filter((r) => r.taxonomy).map((r) => `${r.domain_key}->${r.taxonomy}`), taxonomyUnresolved: lutRows.filter((r) => !r.taxonomy).map((r) => r.domain_key),
  taxonomyTargetsInactiveOrUnknown: lutRows.filter((r) => r.taxonomy && !activeIds.has(r.taxonomy)).map((r) => r.domain_key),
  paletteChecksumRecipe: 'NOT_VERIFIED: persisted lut_checksum recipe is not documented in the palette module',
};
const body = { schema: 'atlas.taxonomy-nes-readonly-audit.v2', mode: 'READ_ONLY', source: { database: sourceSnapshot.database, serverVersion: sourceSnapshot.serverVersion, transactionSnapshot: sourceSnapshot.transactionSnapshot }, taxonomy: { ...taxonomy, cycleAt: cycle, ontologyRows: Number(ontologyRows), ontologyRowsMatchTaxonomy: Number(ontologyRows) === doc.domains.length }, crosswalk, featureMapIdentity, nes, canonicalAuthority: false, writesPerformed: false };
const receiptSha256 = sha(JSON.stringify(body));
fs.writeFileSync(out, `${JSON.stringify({ ...body, receiptSha256 }, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ ...body, receiptSha256, output: path.relative(root, out) }, null, 1));
