#!/usr/bin/env node
/**
 * Parent Atlas NES LUT v2 (candidate) migration runner.
 *
 * --render-sql: produce deterministic *new* candidate SQL (no DB)
 * --plan: read-only PostgreSQL pre-image; default if no mode supplied
 * --rehearse: INSERT in *_scratch DB, then ROLLBACK; independently verify unchanged
 * --apply: INSERT in *_scratch DB, COMMIT; independently verify all 14 rows
 *
 * For BOTH write modes the operator must specify --allow-scratch-writes AND
 * ATLAS_SCRATCH_PG18_ALLOW_WRITES=1. This script NEVER writes production DBs.
 * No v1 UPDATE/DELETE or ontology writes in any mode.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate } from './build-nes-lut-palette-v2.mjs';
import {
  V1_REVISION, V2_DB_REVISION, validateVersionedPalette,
  renderMigrationSql, assertScratchTarget, assessV1DatabaseDrift, isDocumentedGeneralZeroDrift, verifyV2DatabaseRows,
} from './lib-nes-lut-v2-migration-core.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args=process.argv.slice(2);
const modes=['--render-sql','--plan','--rehearse','--apply'].filter(x=>args.includes(x));
if(modes.length>1) throw new Error('EXACTLY_ONE_MODE_REQUIRED');
const mode=modes[0]??'--plan';
const sqlPath=path.join(ROOT,'sveltekit-frontend/drizzle/manual/20261108_atlas_nes_lut_v2_candidate.sql');
const palettePath=path.join(ROOT,'scripts/atlas/data/nes-domain-palette-v2.candidate.json');
const crosswalkPath=path.join(ROOT,'docs/reports/domain-ontology-nes-v2-crosswalk.candidate.json');

function load() {
  // Competing palette provenance is a hard stop, even for SQL rendering.
  // The branch's v2-PROPOSED and this patch's v2.candidate have different
  // colors, labels, weights, and checksums. Never silently select one.
  const competing=path.join(ROOT,'scripts/atlas/data/nes-domain-palette-v2-PROPOSED.json');
  if(fs.existsSync(competing)) throw new Error('COMPETING_V2_CANDIDATES_NOT_RECONCILED');
  const expected=generate(ROOT);
  const v2Bytes=fs.readFileSync(palettePath);
  const v2=JSON.parse(v2Bytes.toString('utf8'));
  const crosswalk=JSON.parse(fs.readFileSync(crosswalkPath,'utf8'));
  if(JSON.stringify(v2)!==JSON.stringify(expected.palette) || JSON.stringify(crosswalk)!==JSON.stringify(expected.crosswalk)) {
    throw new Error('V2_CANDIDATE_ARTIFACT_STALE');
  }
  const v1=JSON.parse(fs.readFileSync(path.join(ROOT,'scripts/atlas/data/nes-domain-palette-v1.json'),'utf8'));
  const digests=validateVersionedPalette(v1,v2,crosswalk,v2Bytes);
  const sql=renderMigrationSql(v2,digests);
  return {v1,v2,crosswalk,digests,sql};
}

const readRows=`SELECT lut_revision,domain_key,lut_byte,nes_hex,nes_byte,label,prior_weight,
 taxonomy_domain_id,match_method,source_ref,source_sha256,lut_checksum,canonical
 FROM public.atlas_nes_lut_v1 WHERE lut_revision=$1 ORDER BY domain_key`;
function receiptOut(data) {
  const dir=path.join(ROOT,'.tmp','atlas');
  fs.mkdirSync(dir,{recursive:true});
  const name=`nes-lut-v2-${data.mode}-${new Date().toISOString().replace(/[-:.]/g,'')}.json`;
  const p=path.join(dir,name);
  fs.writeFileSync(p,JSON.stringify(data,null,2)+'\n',{flag:'wx'});
  process.stdout.write(JSON.stringify({status:data.status,mode:data.mode,baseline:data.baseline,rows:data.rows,committed:data.committed,report:path.relative(ROOT,p).replaceAll('\\','/')})+'\n');
}

async function main(){
  const {v1,v2,crosswalk,digests,sql}=load();
  if(mode==='--render-sql'){
    if(fs.existsSync(sqlPath)) {
      if(fs.readFileSync(sqlPath,'utf8')!==sql) throw new Error('SQL_CANDIDATE_DRIFT_REFUSE_OVERWRITE');
    } else {
      fs.mkdirSync(path.dirname(sqlPath),{recursive:true});
      fs.writeFileSync(sqlPath,sql,{flag:'wx'});
    }
    process.stdout.write(JSON.stringify({status:'SQL_CANDIDATE_VERIFIED',path:path.relative(ROOT,sqlPath),paletteChecksum:v2.checksum,canonicalAuthority:false,dbWrites:0})+'\n');
    return;
  }
  if(!fs.existsSync(sqlPath)||fs.readFileSync(sqlPath,'utf8')!==sql) throw new Error('MIGRATION_SQL_NOT_RENDERED_OR_DRIFTED');
  const connectionString=process.env.ATLAS_SCRATCH_PG18_URL;
  if(!connectionString) throw new Error('ATLAS_SCRATCH_PG18_URL_REQUIRED');
  const target=assertScratchTarget(connectionString);
  const wantsWrite=(mode==='--rehearse'||mode==='--apply');
  if(wantsWrite && (!args.includes('--allow-scratch-writes') || process.env.ATLAS_SCRATCH_PG18_ALLOW_WRITES!=='1')){
    throw new Error('SCRATCH_WRITE_APPROVAL_REQUIRED');
  }
  // Lazy import: the SQL candidate is renderable even without 'pg' installed.
  const {default: pg}=await import('pg');
  const pool=new pg.Pool({connectionString,max:2,connectionTimeoutMillis:5000,statement_timeout:20000,application_name:'atlas-nes-lut-v2-candidate'});
  let client;
  let committed=false,rolledBack=false,attempted=false;
  const report={schema:'atlas.nes-lut-v2-migration-receipt.v1',generatedAt:new Date().toISOString(),
    mode:mode.slice(2),database:target.db,host:target.host,paletteChecksum:v2.checksum,
    crosswalkChecksum:crosswalk.checksum,sourceSha256:digests.sourceSha256,dbRevision:V2_DB_REVISION,
    canonicalAuthority:false,commitAuthorized:false,committed:false,rolledBack:false,
    writesAttempted:false,rows:0,baseline:'NOT_RUN',status:'BLOCKED'};
  try {
    client=await pool.connect();
    await client.query(wantsWrite?'BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout = '20000ms'");
    const identity=(await client.query("SELECT current_database() AS db,current_setting('server_version_num')::int AS pg_version")).rows[0];
    if(identity.db!==target.db || identity.pg_version<180000) throw new Error('SCRATCH_DATABASE_IDENTITY_MISMATCH');
    const beforeV1=(await client.query(readRows,[V1_REVISION])).rows;
    const drifts=assessV1DatabaseDrift(beforeV1,v1);
    report.legacyDrift=drifts;
    if(drifts.length) {
      const acknowledgement=args.includes('--accept-legacy-v1-general-zero')
        && process.env.ATLAS_ACK_LEGACY_NES_GENERAL_ZERO==='1';
      if(!isDocumentedGeneralZeroDrift(drifts) || !acknowledgement) {
        throw new Error(isDocumentedGeneralZeroDrift(drifts)
          ? 'V1_DB_PALETTE_DRIFT:general:ACK_REQUIRED'
          : 'V1_DB_PALETTE_DRIFT:UNRECOGNIZED');
      }
      report.baseline='V1_DOCUMENTED_GENERAL_ZERO_DRIFT_ACKNOWLEDGED';
    } else {
      report.baseline='V1_DB_MATCHED';
    }
    const beforeV2=(await client.query(readRows,[V2_DB_REVISION])).rows;
    verifyV2DatabaseRows(beforeV2,v2,digests,{complete:false});
    report.rows=beforeV2.length;
    if(!wantsWrite){
      await client.query('ROLLBACK');rolledBack=true;
      report.status='READY_FOR_SCRATCH_REHEARSAL';report.rolledBack=true;
    }else{
      await client.query("SET LOCAL atlas.nes_lut_v2_write_allowed = '1'");
      await client.query(sql);
      attempted=true;
      const inside=(await client.query(readRows,[V2_DB_REVISION])).rows;
      verifyV2DatabaseRows(inside,v2,digests);
      report.rows=inside.length;
      if(mode==='--rehearse'){
        await client.query('ROLLBACK');rolledBack=true;
      }else{
        await client.query('COMMIT');committed=true;
      }
      // Independent connection verifies either rollback restored the exact
      // before-image or COMMIT made the complete candidate visible.
      const independent=await pool.connect();
      try {
        const post=(await independent.query(readRows,[V2_DB_REVISION])).rows;
        if(mode==='--rehearse' && JSON.stringify(post)!==JSON.stringify(beforeV2)) throw new Error('ROLLBACK_INDEPENDENT_READBACK_MISMATCH');
        if(mode==='--apply') verifyV2DatabaseRows(post,v2,digests);
      }finally{independent.release();}
      report.status=mode==='--rehearse'?'SCRATCH_REHEARSAL_ROLLED_BACK':'SCRATCH_APPLY_READBACK_PROVEN';
    }
    report.committed=committed;report.rolledBack=rolledBack;report.commitAuthorized=committed;
    report.writesAttempted=attempted;
    receiptOut(report);
  }catch(error){
    if(client && !committed && !rolledBack){try{await client.query('ROLLBACK');rolledBack=true;}catch{}}
    report.error=String(error?.message??error).slice(0,240);
    report.committed=committed;report.rolledBack=rolledBack;report.writesAttempted=attempted;
    receiptOut(report);process.exitCode=1;
  }finally{client?.release();await pool.end();}
}
main().catch(e=>{console.error('NES_LUT_V2_STOP:',String(e?.message??e).slice(0,300));process.exitCode=1;});
