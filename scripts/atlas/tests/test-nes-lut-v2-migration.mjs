import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateVersionedPalette, assertScratchTarget, renderMigrationSql,
  verifyV1DatabaseRows, assessV1DatabaseDrift, isDocumentedGeneralZeroDrift, verifyV2DatabaseRows, V2_DB_REVISION, V2_SOURCE_REF,
} from '../lib-nes-lut-v2-migration-core.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const load=(p)=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
const v1=load('fixtures/nes-domain-palette-v1.json');
const v2=load('scripts/atlas/data/nes-domain-palette-v2.candidate.json');
const cross=load('docs/reports/domain-ontology-nes-v2-crosswalk.candidate.json');
const bytes=fs.readFileSync(path.join(ROOT,'scripts/atlas/data/nes-domain-palette-v2.candidate.json'));
const digests=validateVersionedPalette(v1,v2,cross,bytes);
const dbrow=(domain,info,rev,meta={})=>({
  lut_revision:rev,domain_key:domain,lut_byte:info.lutByte,nes_hex:info.nesHex,
  nes_byte:parseInt(info.nesHex.slice(2),16),label:info.label,prior_weight:info.priorWeight,
  taxonomy_domain_id:null,match_method:'UNRESOLVED',source_ref:V2_SOURCE_REF,
  source_sha256:digests.sourceSha256,lut_checksum:digests.lutChecksum,canonical:false,...meta
});
test('source files, checksums and 14/17 coverage are pinned',()=>{
  assert.equal(validateVersionedPalette(v1,v2,cross,bytes).lutChecksum,v2.checksum.slice(7));
  assert.equal(cross.rows.length,17);
  assert.equal(v2.domains.ui.lutByte,2);
  assert.equal(v2.domains.compiler.lutByte,11);
});
test('tampered crosswalk checksum or v1 bytes fail closed',()=>{
  const changed=structuredClone(cross);changed.rows[0].lutByte=99;
  assert.throws(()=>validateVersionedPalette(v1,v2,changed,bytes),/ARTIFACT_CHECKSUM_INVALID/);
  const bad=structuredClone(v2);bad.domains.ui.nesHex='0x11';
  assert.throws(()=>validateVersionedPalette(v1,bad,cross,bytes),/ARTIFACT_CHECKSUM_INVALID/);
});
test('scratch-only DB identity rejects production, remote and malformed host',()=>{
  assert.deepEqual(assertScratchTarget('postgres://localhost:5434/atlas_v2_scratch'),{db:'atlas_v2_scratch',host:'localhost'});
  assert.throws(()=>assertScratchTarget('postgres://localhost:5432/legal_ai_db'),/SCRATCH_DB_NAME_INVALID/);
  assert.throws(()=>assertScratchTarget('postgres://db.internal/atlas_v2_scratch'),/SCRATCH_DB_HOST_NOT_LOOPBACK/);
  assert.throws(()=>assertScratchTarget('https://localhost/atlas_v2_scratch'),/SCRATCH_DB_PROTOCOL_INVALID/);
});
test('SQL is insert-only, candidate revision, scratch-gated and checksum-bound',()=>{
  const s=renderMigrationSql(v2,digests);
  assert.match(s,/NES_LUT_V2_SCRATCH_GATE_REJECTED/);
  assert.match(s,/current_database\(\)/);
  assert.match(s,/atlas\.nes-lut\.v2-candidate/);
  assert.match(s,/ON CONFLICT \(lut_revision, domain_key\) DO NOTHING/);
  assert.match(s,new RegExp(digests.sourceSha256));
  assert.equal((s.match(/DOM_/g)||[]).length,14);
  assert.doesNotMatch(s,/\b(?:UPDATE|DELETE|TRUNCATE|DROP|ALTER)\s+(?:TABLE\s+)?(?:public\.)?atlas_nes_lut_v1\b/i);
  const emitted=fs.readFileSync(path.join(ROOT,'sveltekit-frontend/drizzle/manual/20261108_atlas_nes_lut_v2_candidate.sql'),'utf8');
  assert.equal(emitted,s);
});
test('v1 stored baseline must match authoritative palette; historic general=0 blocks',()=>{
  const rows=Object.entries(v1.domains).map(([d,e])=>dbrow(d,e,'atlas.nes-lut.v1'));
  assert.equal(verifyV1DatabaseRows(rows,v1),true);
  const drift=structuredClone(rows);drift.find(r=>r.domain_key==='general').lut_byte=0;
  assert.throws(()=>verifyV1DatabaseRows(drift,v1),/V1_DB_PALETTE_DRIFT:general/);
  const onlyKnown=assessV1DatabaseDrift(drift,v1);
  assert.equal(isDocumentedGeneralZeroDrift(onlyKnown),true);
  drift[0].lut_byte=42;
  assert.equal(isDocumentedGeneralZeroDrift(assessV1DatabaseDrift(drift,v1)),false);
});
test('v2 correct readback, collisions, invalid provenance, or fake authority',()=>{
  const rows=Object.entries(v2.domains).map(([d,e])=>dbrow(d,e,V2_DB_REVISION));
  assert.equal(verifyV2DatabaseRows(rows,v2,digests),true);
  const wrong=structuredClone(rows);wrong[0].canonical=true;
  assert.throws(()=>verifyV2DatabaseRows(wrong,v2,digests),/V2_DB_PROVENANCE_DRIFT/);
  const duplicate=[rows[0],rows[0]];
  assert.throws(()=>verifyV2DatabaseRows(duplicate,v2,digests,{complete:false}),/V2_DB_DOMAIN_UNKNOWN_OR_DUPLICATE/);
});
test('partial existing v2 candidate rows may be verified but not promoted',()=>{
  const one=[dbrow('compiler',v2.domains.compiler,V2_DB_REVISION)];
  assert.equal(verifyV2DatabaseRows(one,v2,digests,{complete:false}),true);
  assert.throws(()=>verifyV2DatabaseRows(one,v2,digests),/V2_DB_ROW_COUNT_MISMATCH/);
});
