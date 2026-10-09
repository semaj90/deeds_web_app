#!/usr/bin/env node
/** Read-only TUPLE-STORE-03 proof. A persisted tuple is NOT admitted evidence.
 * Only known table/column names are selected; absent relations block safely.
 * TODO: bind fact/card/source execution via deployed, independently audited owner.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { REPO_ROOT, loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

export const TABLE = 'atlas_ontology_linked_tuples';
export const REQUIRED = ['tuple_id','provenance','evidence_span','evidence_state','source_ref','packet_key','evidence_refs'];
const hash = v => 'sha256:' + createHash('sha256').update(JSON.stringify(v)).digest('hex');
const LINEAGE = ['sourceRevision','workspaceRevision','taskRevision','evidenceCardChecksum','evidenceSpanChecksum'];

export function assessTuple(row, expected = {}) {
  if (!row) return { verdict:'BLOCKED',reason:'TUPLE_NOT_FOUND',admitted:false };
  if (!row.provenance || typeof row.provenance !== 'object' || Array.isArray(row.provenance))
    return { verdict:'BLOCKED',reason:'PROVENANCE_ABSENT',admitted:false };
  if (typeof row.tuple_id !== 'string' || !row.tuple_id ||
      typeof row.source_ref !== 'string' || !row.source_ref)
    return { verdict:'BLOCKED',reason:'TUPLE_IDENTITY_MISSING',admitted:false };
  const missing=LINEAGE.filter(k=>typeof row.provenance[k]!=='string' || !row.provenance[k].trim());
  if(missing.length) return {verdict:'BLOCKED',reason:'PROVENANCE_INCOMPLETE',missing,admitted:false};
  for(const [key,value] of Object.entries(expected)) {
    if(!LINEAGE.includes(key)) throw new Error('UNKNOWN_EXPECTED_FIELD');
    if(row.provenance[key]!==value) return {verdict:'BLOCKED',reason:'EXPECTED_PROVENANCE_MISMATCH',field:key,admitted:false};
  }
  return {verdict:'PERSISTED_TUPLE_VERIFIED',admitted:false,
    evidenceAdmission:'NOT_PROVEN',sourceSpan:'NOT_INDEPENDENTLY_VERIFIED',
    provenanceDigest:hash(row.provenance),spanDigest:row.evidence_span ? hash(row.evidence_span) : null,
    todo:'TODO: verify source bytes, task/evidence admission predicate, real execution and checksum'};
}
export function sealReceipt(tupleId, assessment, catalog) {
  const body={schema:'atlas.ontology-tuple-readback.v1',tupleId,assessment,catalog,
    canonicalWrites:false,admissionProven:false,sourceBytesReopened:false};
  return {...body,checksum:hash(body)};
}
export function verifyReceipt(receipt) {
  const {checksum,...body}=receipt;
  if(checksum!==hash(body)) throw new Error('TUPLE_RECEIPT_READBACK_MISMATCH');
  return true;
}
async function main() {
  const tupleId=process.env.ATLAS_TUPLE_ID;
  if(!tupleId || tupleId.length>512) throw new Error('ATLAS_TUPLE_ID_REQUIRED');
  const output=path.resolve(process.env.ATLAS_TUPLE_READBACK_REPORT ??
    path.join(REPO_ROOT,'.tmp/atlas/ontology-tuple-readback-v1.json'));
  const scratch=path.resolve(REPO_ROOT,'.tmp');
  if(!output.startsWith(scratch+path.sep)||!output.endsWith('.json')) throw new Error('SCRATCH_REPORT_PATH_REQUIRED');
  const pool=new pg.Pool({connectionString:resolveDatabaseUrl(loadRepoEnv(process.env)),max:1});
  const client=await pool.connect();
  let receipt;
  try {
    await client.query('BEGIN');
    await client.query('SET TRANSACTION READ ONLY');
    await client.query("SET LOCAL statement_timeout = '15000ms'");
    const cols=(await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1",
      [TABLE])).rows.map(x=>x.column_name);
    const missing=REQUIRED.filter(x=>!cols.includes(x));
    if(missing.length) receipt=sealReceipt(tupleId,
      {verdict:'BLOCKED',reason:'MISSING_DEPLOYED_COLUMNS',missing,admitted:false},
      {table:TABLE,availableColumns:cols.sort()});
    else {
      const rows=(await client.query(
        'SELECT tuple_id,provenance,evidence_span,evidence_state,source_ref,packet_key,evidence_refs FROM public.atlas_ontology_linked_tuples WHERE tuple_id=$1 LIMIT 2',
        [tupleId])).rows;
      const verdict=rows.length===1 ? assessTuple(rows[0]) :
        {verdict:'BLOCKED',reason:rows.length===0?'TUPLE_NOT_FOUND':'AMBIGUOUS_TUPLE',admitted:false};
      receipt=sealReceipt(tupleId,verdict,{table:TABLE,matchCount:rows.length});
    }
    await client.query('ROLLBACK');
  } catch(e) {await client.query('ROLLBACK').catch(()=>{});throw e;}
  finally {client.release();await pool.end();}
  await mkdir(path.dirname(output),{recursive:true});
  await writeFile(output,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
  verifyReceipt(JSON.parse(await readFile(output,'utf8')));
  console.log(JSON.stringify({verdict:receipt.assessment.verdict,reason:receipt.assessment.reason??null,
    path:output,checksum:receipt.checksum}));
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main().catch(e=>{console.error('TUPLE_READBACK_FAILED',e.message);process.exitCode=1;});
