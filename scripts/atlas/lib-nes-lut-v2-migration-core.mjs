/**
 * Parent Atlas NES palette v2 scratch migration core (no database connection here).
 * The canonical ontology remains in PostgreSQL; the NES LUT is non-canonical
 * routing metadata. Never mutate the v1 palette or v1 database rows.
 */
import { createHash } from 'node:crypto';

export const V1_REVISION = 'atlas.nes-lut.v1';
export const V2_DB_REVISION = 'atlas.nes-lut.v2-candidate';
export const V2_SOURCE_REF = 'scripts/atlas/data/nes-domain-palette-v2.candidate.json';
const sha256 = x => `sha256:${createHash('sha256').update(x).digest('hex')}`;
const requireOk = (ok, reason) => { if (!ok) throw new Error(reason); };
const literal = x => `'${String(x).replaceAll("'", "''")}'`;

export function validateVersionedPalette(v1, v2, crosswalk, v2FileBytes) {
  requireOk(v1?.schema === 'atlas.nes-domain-palette.v1', 'V1_SCHEMA_INVALID');
  requireOk(v2?.schema === 'atlas.nes-domain-palette.v2' && v2.status === 'CANDIDATE_NOT_APPLIED', 'V2_MUST_REMAIN_CANDIDATE');
  requireOk(crosswalk?.schema === 'atlas.domain-ontology-nes-crosswalk.v2-candidate' && crosswalk.status === 'CANDIDATE_NOT_APPLIED', 'CROSSWALK_MUST_REMAIN_CANDIDATE');
  requireOk(v2.baselineV1Checksum === v1.checksum, 'V1_BASELINE_UNBOUND');
  for (const item of [v1, v2, crosswalk]) {
    const {checksum, ...unsigned} = item;
    requireOk(checksum === sha256(JSON.stringify(unsigned)), 'ARTIFACT_CHECKSUM_INVALID');
  }
  requireOk(v2.revision === 'nes-domain-palette-v2-candidate' && crosswalk.paletteRevision === v2.revision && crosswalk.paletteChecksum === v2.checksum, 'CROSSWALK_REVISION_MISMATCH');
  requireOk(crosswalk.canonicalAuthority === false && crosswalk.writesPerformed === false && v2.canonicalAuthority === false, 'CANONICAL_AUTHORITY_FORBIDDEN');
  requireOk(Object.keys(v1.domains).length === 10 && Object.keys(v2.domains).length === 14, 'DOMAIN_COUNT_INVALID');
  requireOk(v2.unresolved.lutByte === 0 && v1.unresolved.lutByte === 0, 'UNRESOLVED_BYTE_DRIFT');
  for (const [key, value] of Object.entries(v1.domains)) requireOk(JSON.stringify(v2.domains[key]) === JSON.stringify(value), `V1_DOMAIN_DRIFT:${key}`);
  const bytes = new Set(), colors = new Set();
  for (const [key, value] of Object.entries(v2.domains)) {
    requireOk(/^[a-z]+(?:-[a-z]+)*$/.test(key), 'DOMAIN_KEY_INVALID');
    requireOk(Number.isInteger(value.lutByte) && value.lutByte >= 1 && value.lutByte <= 255 && !bytes.has(value.lutByte), 'DOMAIN_BYTE_COLLISION');
    requireOk(/^0x[0-3][0-9A-F]$/.test(value.nesHex) && !colors.has(value.nesHex), 'DOMAIN_COLOR_COLLISION');
    requireOk(/^DOM_[A-Z0-9_]+$/.test(value.label), 'DOMAIN_LABEL_INVALID');
    requireOk(typeof value.priorWeight === 'number' && value.priorWeight >= 0 && value.priorWeight <= 1, 'PRIOR_WEIGHT_INVALID');
    bytes.add(value.lutByte); colors.add(value.nesHex);
  }
  requireOk(crosswalk.rows.length === 17 && crosswalk.sourceGroupCount === 17 && crosswalk.paletteDomainCount === 14, 'CROSSWALK_COUNT_INVALID');
  requireOk(new Set(crosswalk.rows.map(r=>r.groupId)).size === 17, 'DUPLICATE_ONTOLOGY_GROUP');
  for (const r of crosswalk.rows) {
    requireOk(v2.domains[r.domain]?.lutByte === r.lutByte && v2.domains[r.domain]?.nesHex === r.nesHex && r.authoritativeLabel === false, 'CROSSWALK_DATA_DRIFT');
  }
  requireOk(Buffer.isBuffer(v2FileBytes) && v2FileBytes.byteLength > 0, 'V2_FILE_BYTES_MISSING');
  requireOk(JSON.stringify(JSON.parse(v2FileBytes.toString('utf8'))) === JSON.stringify(v2), 'V2_DISK_ARTIFACT_DRIFT');
  return { sourceSha256: sha256(v2FileBytes).slice(7), lutChecksum: v2.checksum.slice(7) };
}

export function assertScratchTarget(connectionString, env = process.env) {
  let u;
  try { u = new URL(connectionString); } catch { throw new Error('SCRATCH_DB_URL_INVALID'); }
  requireOk(['postgres:', 'postgresql:'].includes(u.protocol), 'SCRATCH_DB_PROTOCOL_INVALID');
  const db = decodeURIComponent(u.pathname.slice(1));
  requireOk(/^[a-z0-9_]+_scratch$/.test(db), 'SCRATCH_DB_NAME_INVALID');
  requireOk(['localhost', '127.0.0.1', '::1', '[::1]'].includes(u.hostname), 'SCRATCH_DB_HOST_NOT_LOOPBACK');
  return { db, host: u.hostname };
}

export function renderMigrationSql(v2, {sourceSha256, lutChecksum}) {
  requireOk(/^[a-f0-9]{64}$/.test(sourceSha256) && /^[a-f0-9]{64}$/.test(lutChecksum), 'SQL_SOURCE_DIGEST_INVALID');
  const entries = Object.entries(v2.domains).sort((a,b)=>a[1].lutByte-b[1].lutByte);
  requireOk(entries.length===14 && entries[0][1].lutByte===1 && entries.at(-1)[1].lutByte===14, 'SQL_PALETTE_INVALID');
  const values = entries.map(([domain,e])=>`    (${literal(domain)}, ${e.lutByte}, ${literal(e.nesHex)}, ${literal(e.label)}, ${e.priorWeight})`).join(',\n');
  return `-- Parent Atlas NES LUT v2 candidate (derived metadata only).\n-- Generated from exact candidate bytes; DO NOT edit by hand.\n-- INSERT-ONLY new lut_revision in existing atlas_nes_lut_v1.\n-- v1 remains immutable. Operator-controlled *_scratch transaction only.\n-- SQL never extends the canonical PostgreSQL domain ontology.\n-- A direct psql caller must explicitly SET LOCAL atlas.nes_lut_v2_write_allowed='1'\n-- inside a transaction, and must target an isolated *_scratch PostgreSQL 18 database.\nDO $nes_guard$\nBEGIN\n  IF current_database() !~ '^[a-z0-9_]+_scratch$'\n     OR current_setting('server_version_num')::int < 180000\n     OR current_setting('atlas.nes_lut_v2_write_allowed', true) IS DISTINCT FROM '1'\n  THEN RAISE EXCEPTION 'NES_LUT_V2_SCRATCH_GATE_REJECTED'; END IF;\nEND $nes_guard$;\n\nWITH candidate(domain_key, lut_byte, nes_hex, label, prior_weight) AS (\n  VALUES\n${values}\n), taxonomy AS (\n  SELECT domain_id FROM public.domain_taxonomy_v1 WHERE is_active = true\n)\nINSERT INTO public.atlas_nes_lut_v1\n  (lut_revision, domain_key, lut_byte, nes_hex, nes_byte, label, prior_weight, taxonomy_domain_id, match_method, source_ref, source_sha256, lut_checksum, canonical)\nSELECT ${literal(V2_DB_REVISION)}, c.domain_key, c.lut_byte, c.nes_hex,\n       ('x' || substring(c.nes_hex FROM 3))::bit(8)::int,\n       c.label, c.prior_weight, t.domain_id,\n       CASE WHEN t.domain_id IS NULL THEN 'UNRESOLVED' ELSE 'NORMALIZED_EXACT' END,\n       ${literal(V2_SOURCE_REF)}, ${literal(sourceSha256)}, ${literal(lutChecksum)}, false\nFROM candidate c LEFT JOIN taxonomy t ON t.domain_id = c.domain_key\nON CONFLICT (lut_revision, domain_key) DO NOTHING;\n`;
}

// The historic 20261018 SQL seed mistakenly assigned 'general' lut_byte=0.
// Do not normalize it silently or confuse it with unresolved. Block promotion.
export function assessV1DatabaseDrift(rows, v1) {
  // Report ALL byte/color discrepancies before deciding whether to acknowledge
  // the one documented historical seed defect. No historical writes occur.
  requireOk(rows.length === Object.keys(v1.domains).length, `V1_DB_ROW_COUNT_MISMATCH:${rows.length}`);
  const seen=new Set(), drift=[];
  for (const row of rows) {
    const expected=v1.domains[row.domain_key];
    requireOk(expected && !seen.has(row.domain_key), `V1_DB_DOMAIN_UNKNOWN_OR_DUPLICATE:${row.domain_key}`);
    seen.add(row.domain_key);
    requireOk(row.canonical===false, 'V1_DB_CANONICAL_FORBIDDEN');
    if(Number(row.lut_byte)!==expected.lutByte || row.nes_hex!==expected.nesHex){
      drift.push({domain:row.domain_key,actualByte:Number(row.lut_byte),expectedByte:expected.lutByte,
        actualColor:row.nes_hex,expectedColor:expected.nesHex});
    }
  }
  return drift;
}

export function isDocumentedGeneralZeroDrift(drifts) {
  return drifts.length===1 && drifts[0].domain==='general' && drifts[0].actualByte===0
    && drifts[0].expectedByte===10 && drifts[0].actualColor==='0x0F'
    && drifts[0].expectedColor==='0x0F';
}

export function verifyV1DatabaseRows(rows, v1) {
  requireOk(rows.length === Object.keys(v1.domains).length, `V1_DB_ROW_COUNT_MISMATCH:${rows.length}`);
  const seen=new Set();
  for (const row of rows) {
    const expected=v1.domains[row.domain_key];
    requireOk(expected && !seen.has(row.domain_key), `V1_DB_DOMAIN_UNKNOWN_OR_DUPLICATE:${row.domain_key}`);
    seen.add(row.domain_key);
    requireOk(Number(row.lut_byte)===expected.lutByte && row.nes_hex===expected.nesHex, `V1_DB_PALETTE_DRIFT:${row.domain_key}`);
    requireOk(row.canonical===false, 'V1_DB_CANONICAL_FORBIDDEN');
  }
  return true;
}

export function verifyV2DatabaseRows(rows, v2, digests, {complete=true}={}) {
  requireOk(!complete || rows.length===Object.keys(v2.domains).length, `V2_DB_ROW_COUNT_MISMATCH:${rows.length}`);
  const seen=new Set();
  for (const row of rows) {
    const e=v2.domains[row.domain_key];
    requireOk(e && !seen.has(row.domain_key), `V2_DB_DOMAIN_UNKNOWN_OR_DUPLICATE:${row.domain_key}`);
    seen.add(row.domain_key);
    requireOk(row.lut_revision===V2_DB_REVISION, 'V2_DB_REVISION_MISMATCH');
    requireOk(Number(row.lut_byte)===e.lutByte && row.nes_hex===e.nesHex && Number(row.nes_byte)===parseInt(e.nesHex.slice(2),16), `V2_DB_PALETTE_DRIFT:${row.domain_key}`);
    requireOk(row.label===e.label && Math.abs(Number(row.prior_weight)-e.priorWeight)<1e-5, `V2_DB_METADATA_DRIFT:${row.domain_key}`);
    requireOk(row.canonical===false && row.source_ref===V2_SOURCE_REF && row.source_sha256===digests.sourceSha256 && row.lut_checksum===digests.lutChecksum, `V2_DB_PROVENANCE_DRIFT:${row.domain_key}`);
    requireOk((row.taxonomy_domain_id===null && row.match_method==='UNRESOLVED') || (row.taxonomy_domain_id===row.domain_key && row.match_method==='NORMALIZED_EXACT'), `V2_DB_TAXONOMY_MISMATCH:${row.domain_key}`);
  }
  return true;
}
