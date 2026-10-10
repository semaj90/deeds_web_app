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
export const PACKET_TABLE = 'atlas_packets';
export const REQUIRED = ['tuple_id','provenance','evidence_span','evidence_state','source_ref','packet_key','evidence_refs'];
export const REQUIRED_PACKET = ['packet_key','source_ref','source_revision','workspace_revision_key'];
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
  if (typeof row.packet_key !== 'string' || !row.packet_key || row.packet_key !== row.canonical_packet_key)
    return { verdict:'BLOCKED',reason:'CANONICAL_PACKET_BINDING_MISSING',admitted:false };
  if (row.source_ref !== row.packet_source_ref)
    return { verdict:'BLOCKED',reason:'CANONICAL_PACKET_SOURCE_MISMATCH',admitted:false };
  if (typeof row.packet_source_revision !== 'string' || row.provenance.sourceRevision !== row.packet_source_revision)
    return { verdict:'BLOCKED',reason:'CANONICAL_PACKET_SOURCE_REVISION_MISMATCH',admitted:false };
  if (typeof row.packet_workspace_revision !== 'string' || row.provenance.workspaceRevision !== row.packet_workspace_revision)
    return { verdict:'BLOCKED',reason:'CANONICAL_PACKET_WORKSPACE_REVISION_MISMATCH',admitted:false };
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
    const columnRows=(await client.query(
      "SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name = ANY($1::text[])",
      [[TABLE,PACKET_TABLE]])).rows;
    const columnsByTable=Object.fromEntries([TABLE,PACKET_TABLE].map(table => [table,
      columnRows.filter(row => row.table_name === table).map(row => row.column_name)]));
    const missing={
      [TABLE]:REQUIRED.filter(column => !columnsByTable[TABLE].includes(column)),
      [PACKET_TABLE]:REQUIRED_PACKET.filter(column => !columnsByTable[PACKET_TABLE].includes(column)),
    };
    if(missing[TABLE].length || missing[PACKET_TABLE].length) receipt=sealReceipt(tupleId,
      {verdict:'BLOCKED',reason:'MISSING_DEPLOYED_COLUMNS',missing,admitted:false},
      {tables:columnsByTable});
    else {
      const rows=(await client.query(
        `SELECT t.tuple_id,t.provenance,t.evidence_span,t.evidence_state,t.source_ref,t.packet_key,t.evidence_refs,
                p.packet_key AS canonical_packet_key,p.source_ref AS packet_source_ref,
                p.source_revision AS packet_source_revision,p.workspace_revision_key AS packet_workspace_revision
           FROM public.atlas_ontology_linked_tuples t
           LEFT JOIN public.atlas_packets p ON p.packet_key=t.packet_key
          WHERE t.tuple_id=$1
          LIMIT 2`,
        [tupleId])).rows;
      const verdict=rows.length===1 ? assessTuple(rows[0]) :
        {verdict:'BLOCKED',reason:rows.length===0?'TUPLE_NOT_FOUND':'AMBIGUOUS_TUPLE',admitted:false};
      receipt=sealReceipt(tupleId,verdict,{tables:columnsByTable,matchCount:rows.length});
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
