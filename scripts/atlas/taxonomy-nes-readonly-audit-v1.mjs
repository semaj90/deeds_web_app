#!/usr/bin/env node
// Read-only audit: live taxonomy (domain_taxonomy_v1) + crosswalk (atlas_domain_vocabulary_crosswalk_v1) + NES LUT (palette vs atlas_nes_lut_v1).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateTaxonomy, normalizeLabel } from './lib/domain-taxonomy-contract-v1.mjs';
import { verifyPalette, roundTrip, comparePersisted } from './lib/nes-lut-roundtrip-v1.mjs';
import { NES_LUT_DOMAIN_PALETTE } from './lib/domain-taxonomy-nes-lut-batch-gemm-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = path.resolve(root, process.argv.find((a) => a.startsWith('--out='))?.slice(6) ?? '.tmp/atlas/taxonomy-nes-audit-20261027.json');
if (!out.startsWith(`${path.resolve(root, '.tmp/atlas')}${path.sep}`)) { console.error('OUTPUT_MUST_STAY_UNDER_TMP_ATLAS'); process.exit(2); }
const sha = (v) => `sha256:${crypto.createHash('sha256').update(v).digest('hex')}`;
const psql = (sql) => execFileSync('docker', ['exec', '-i', 'legal-ai-postgres', 'psql', '-U', 'legal_admin', '-d', 'legal_ai_db', '-At', '-F', '\t'], { input: `begin read only; ${sql} rollback;`, encoding: 'utf8' }).split('\n').filter((l) => l && !/^(BEGIN|ROLLBACK)$/.test(l)).map((l) => l.split('\t'));

// Taxonomy
const taxRows = psql("select domain_id, label, coalesce(parent_domain_id,''), is_active, coalesce(description,''), version, coalesce(deprecated_at::text,''), coalesce(replaced_by,'') from domain_taxonomy_v1 order by domain_id;");
const doc = { version: Number([...new Set(taxRows.map((r) => r[5]))][0]), domains: taxRows.map(([id, label, parent, active, description]) => ({ id, label, parentId: parent || null, description, active: active === 't' })) };
const taxonomy = { ...validateTaxonomy(doc), versions: [...new Set(taxRows.map((r) => r[5]))], active: doc.domains.filter((d) => d.active).length, deprecated: taxRows.filter((r) => r[6]).length };
const cycle = (() => { const parent = new Map(doc.domains.map((d) => [d.id, d.parentId])); for (const id of parent.keys()) { const seen = new Set(); for (let cur = id; cur; cur = parent.get(cur)) { if (seen.has(cur)) return id; seen.add(cur); } } return null; })();
const ontologyRows = psql('select count(*) from atlas_domain_ontology;')[0][0];
const activeIds = new Set(doc.domains.filter((d) => d.active).map((d) => d.id));

// Crosswalk
const cross = psql("select source_vocab, source_value, coalesce(taxonomy_domain_id,''), match_method, source_row_count, crosswalk_version, canonical from atlas_domain_vocabulary_crosswalk_v1 order by 1,2;").map(([vocab, value, domain, method, count, version, canonical]) => ({ vocab, value, domain, method, count: Number(count), version, canonical: canonical === 't' }));
const nameIndex = new Map(); for (const d of doc.domains) for (const n of [d.label, d.id]) nameIndex.set(normalizeLabel(n), d.id);
const dupKeys = cross.map((c) => `${c.vocab}|${c.value}`).filter((k, i, a) => a.indexOf(k) !== i);
const crosswalk = {
  rows: cross.length, versions: [...new Set(cross.map((c) => c.version))], methods: cross.reduce((m, c) => ((m[c.method] = (m[c.method] ?? 0) + 1), m), {}),
  anyCanonical: cross.some((c) => c.canonical), duplicateKeys: dupKeys.length,
  mappedToUnknownOrInactiveDomain: cross.filter((c) => c.domain && !activeIds.has(c.domain)).map((c) => `${c.value}->${c.domain}`),
  normalizedExactNotReproducible: cross.filter((c) => c.method === 'NORMALIZED_EXACT' && nameIndex.get(normalizeLabel(c.value)) !== c.domain).map((c) => `${c.value}->${c.domain}`),
  unresolvedLabels: cross.filter((c) => c.method === 'UNRESOLVED').length, unresolvedRowWeight: cross.filter((c) => c.method === 'UNRESOLVED').reduce((n, c) => n + c.count, 0), mappedRowWeight: cross.filter((c) => c.domain).reduce((n, c) => n + c.count, 0),
};

// NES LUT
const lutRows = psql('select domain_key, lut_byte, nes_hex, nes_byte, label, prior_weight, coalesce(taxonomy_domain_id,\'\'), match_method, lut_revision, lut_checksum, canonical from atlas_nes_lut_v1 order by lut_byte;').map(([domain_key, lut_byte, nes_hex, nes_byte, label, prior_weight, taxonomy, method, rev, checksum, canonical]) => ({ domain_key, lut_byte, nes_hex, nes_byte, label, prior_weight, taxonomy, method, rev, checksum, canonical }));
const nes = {
  palette: verifyPalette(NES_LUT_DOMAIN_PALETTE), roundTrip: roundTrip(NES_LUT_DOMAIN_PALETTE), persistedRows: lutRows.length,
  paletteVsPersisted: comparePersisted(NES_LUT_DOMAIN_PALETTE, lutRows),
  revisions: [...new Set(lutRows.map((r) => r.rev))], checksums: [...new Set(lutRows.map((r) => r.checksum))].length, anyCanonical: lutRows.some((r) => r.canonical === 't'),
  taxonomyMapped: lutRows.filter((r) => r.taxonomy).map((r) => `${r.domain_key}->${r.taxonomy}`), taxonomyUnresolved: lutRows.filter((r) => !r.taxonomy).map((r) => r.domain_key),
  taxonomyTargetsInactiveOrUnknown: lutRows.filter((r) => r.taxonomy && !activeIds.has(r.taxonomy)).map((r) => r.domain_key),
  paletteChecksumRecipe: 'NOT_VERIFIED: persisted lut_checksum recipe is not documented in the palette module',
};
const body = { schema: 'atlas.taxonomy-nes-readonly-audit.v1', mode: 'READ_ONLY', taxonomy: { ...taxonomy, cycleAt: cycle, ontologyRows: Number(ontologyRows), ontologyRowsMatchTaxonomy: Number(ontologyRows) === doc.domains.length }, crosswalk, nes, canonicalAuthority: false, writesPerformed: false };
const receiptSha256 = sha(JSON.stringify(body));
fs.writeFileSync(out, `${JSON.stringify({ ...body, receiptSha256 }, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ ...body, receiptSha256, output: path.relative(root, out) }, null, 1));
