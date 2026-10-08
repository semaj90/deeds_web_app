#!/usr/bin/env node
/** Read-only bounded crosswalk: persisted tuple -> atlas_evidence candidate.
 * Not an OpenSpec TaskCard/EvidenceCard admission verifier.
 * TODO: bind source authority audit and approved task/card predicate owner.
 */
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {REPO_ROOT,loadRepoEnv,resolveDatabaseUrl} from './connection-config.mjs';
const hash=x=>'sha256:'+createHash('sha256').update(JSON.stringify(x)).digest('hex');
const COLS={
  atlas_ontology_linked_tuples:['tuple_id','packet_key','source_ref','provenance','evidence_refs','evidence_state'],
  atlas_evidence:['evidence_id','source_ref','source_revision','evidence_revision','producer_revision','payload']
};
export function classifyCrosswalk(tuple, rows, available) {
  if(!tuple) return {verdict:'BLOCKED',reason:'TUPLE_NOT_FOUND',admitted:false};
  const provenance=tuple.provenance;
  if(!provenance||typeof provenance!=='object'||!provenance.sourceRevision||!provenance.workspaceRevision
     ||!provenance.evidenceCardChecksum||!provenance.taskRevision||!provenance.evidenceSpanChecksum)
    return {verdict:'BLOCKED',reason:'TUPLE_LINEAGE_MISSING',admitted:false};
  if(!available) return {verdict:'BLOCKED',reason:'ATLAS_EVIDENCE_NOT_DEPLOYED',admitted:false};
  const ids=tuple.evidence_refs;
  if(!Array.isArray(ids)||!ids.length) return {verdict:'BLOCKED',reason:'NO_EVIDENCE_REFS',admitted:false};
  if(ids.length!==new Set(ids).size) return {verdict:'BLOCKED',reason:'DUPLICATE_EVIDENCE_REFS',admitted:false};
  if(rows.length!==ids.length) return {verdict:'BLOCKED',reason:'EVIDENCE_IDS_NOT_UNIQUE_OR_MISSING',admitted:false};
  const actual=new Set(rows.map(x=>x.evidence_id));
  if(ids.some(id=>!actual.has(id))) return {verdict:'BLOCKED',reason:'EVIDENCE_REF_NOT_FOUND',admitted:false};
  if(rows.some(x=>x.source_ref!==tuple.source_ref||x.source_revision!==provenance.sourceRevision))
    return {verdict:'BLOCKED',reason:'SOURCE_REF_OR_REVISION_MISMATCH',admitted:false};
  return {verdict:'LEDGER_CROSSWALK_MATCHED',admitted:false,
    evidenceAdmission:'NOT_PROVEN',taskCardAdmission:'NOT_PROVEN',sourceExecution:'NOT_PROVEN',
    matchedEvidenceCount:rows.length,
    todo:'TODO: verify actual TaskCard/EvidenceCard receipt and authoritative source-execution membership'};
}
export function receipt(tupleId, result) {
  const body={schema:'atlas.tuple-evidence-crosswalk.v1',tupleId,result,writes:false,admissionProven:false};
  return {...body,checksum:hash(body)};
}
export function verifyReceipt(data) {
  const {checksum,...body}=data;
  if(hash(body)!==checksum) throw new Error('CROSSWALK_RECEIPT_MISMATCH');
  return true;
}
async function main(){
  const tupleId=process.env.ATLAS_TUPLE_ID;
  if(!tupleId||tupleId.length>512) throw new Error('ATLAS_TUPLE_ID_REQUIRED');
  const output=path.resolve(process.env.ATLAS_CROSSWALK_REPORT ??
    path.join(REPO_ROOT,'.tmp/atlas/tuple-evidence-crosswalk-v1.json'));
  const scratch=path.resolve(REPO_ROOT,'.tmp');
  if(!output.startsWith(scratch+path.sep)||!output.endsWith('.json'))throw new Error('SCRATCH_REPORT_PATH_REQUIRED');
  const pool=new pg.Pool({connectionString:resolveDatabaseUrl(loadRepoEnv(process.env)),max:1});
  const client=await pool.connect();let report;
  try{
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout = '15000ms'");
    const columns=(await client.query(
      "SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1::text[])",
      [Object.keys(COLS)])).rows;
    const missing=Object.fromEntries(Object.entries(COLS).map(([table,required])=>[
      table,required.filter(column=>!columns.some(c=>c.table_name===table&&c.column_name===column))
    ]));
    let verdict;
    if(missing.atlas_ontology_linked_tuples.length) verdict={verdict:'BLOCKED',reason:'TUPLE_COLUMNS_MISSING',missing:missing.atlas_ontology_linked_tuples,admitted:false};
    else {
      const tuples=(await client.query(
        'SELECT tuple_id,packet_key,source_ref,provenance,evidence_refs,evidence_state FROM public.atlas_ontology_linked_tuples WHERE tuple_id=$1 LIMIT 2',
        [tupleId])).rows;
      if(tuples.length!==1) verdict={verdict:'BLOCKED',reason:tuples.length?'AMBIGUOUS_TUPLE':'TUPLE_NOT_FOUND',admitted:false};
      else if(missing.atlas_evidence.length) verdict=classifyCrosswalk(tuples[0],[],false);
      else {
        const ids=tuples[0].evidence_refs;
        const rows=Array.isArray(ids)&&ids.length&&ids.length<=32?
          (await client.query(
            'SELECT evidence_id,source_ref,source_revision,evidence_revision,producer_revision,payload FROM public.atlas_evidence WHERE evidence_id=ANY($1::text[])',
            [ids])).rows:[];
        verdict=classifyCrosswalk(tuples[0],rows,true);
      }
    }
    report=receipt(tupleId,verdict);
    await client.query('ROLLBACK');
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
  finally{client.release();await pool.end();}
  await mkdir(path.dirname(output),{recursive:true});
  await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  verifyReceipt(JSON.parse(await readFile(output,'utf8')));
  console.log(JSON.stringify({verdict:report.result.verdict,reason:report.result.reason??null,report:output,checksum:report.checksum}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main().catch(e=>{console.error('EVIDENCE_CROSSWALK_FAILED',e.message);process.exitCode=1;});
