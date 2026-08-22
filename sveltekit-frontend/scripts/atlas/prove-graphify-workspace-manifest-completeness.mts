#!/usr/bin/env tsx
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadAtlasEnv } from './load-atlas-env.mjs';
import { materializeWorkspaceRevisionOriginV1 } from '$lib/server/atlas/indexing/workspace-revision-origin-runtime-v1.js';
import { evaluateGraphifyWorkspaceManifestCompletenessV1 } from '$lib/server/atlas/indexing/graphify-workspace-manifest-completeness-v1.js';

await loadAtlasEnv();
const HERE=path.dirname(fileURLToPath(import.meta.url));const FRONTEND=path.resolve(HERE,'../..');const REPO_ROOT=path.resolve(FRONTEND,'..');
const DATABASE_URL=process.env.DATABASE_URL;if(!DATABASE_URL)throw new Error('DATABASE_URL_REQUIRED');
const PRODUCER='atlas.graphify-workspace-manifest-completeness.proof.v1';
const OUTPUT=path.resolve(REPO_ROOT,process.env.ATLAS_GRAPHIFY_MANIFEST_COMPLETENESS_OUT??'docs/reports/graphify-workspace-manifest-completeness.json');
const origin=materializeWorkspaceRevisionOriginV1({workspaceRoot:REPO_ROOT,repositoryId:'semaj90/deeds_web_app',producerRevision:PRODUCER});
const pool=new pg.Pool({connectionString:DATABASE_URL,max:1,connectionTimeoutMillis:5000,statement_timeout:15000});
const client=await pool.connect();
try{
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const cols=await client.query<{table_name:string;column_name:string}>(`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('graphify_runs','graphify_files')`);
  const runs=new Set(cols.rows.filter(r=>r.table_name==='graphify_runs').map(r=>r.column_name));const files=new Set(cols.rows.filter(r=>r.table_name==='graphify_files').map(r=>r.column_name));
  const missingRun=['run_id','workspace_revision','source_manifest_digest','source_manifest_source_count'].filter(x=>!runs.has(x));const missingFile=['source_ref','code_source_revision','content_hash','byte_length','last_seen_run_id'].filter(x=>!files.has(x));
  if(missingRun.length||missingFile.length){console.log(JSON.stringify({status:'GRAPHIFY_MANIFEST_COMPLETENESS_V3_MIGRATION_REQUIRED',missingRunColumns:missingRun,missingFileColumns:missingFile,workspaceRevision:origin.record.workspaceRevision,canonicalWritesAttempted:false},null,2));process.exitCode=3;return;}
  const rr=await client.query<{run_id:string;workspace_revision:string;source_manifest_digest:string;source_manifest_source_count:number}>(`SELECT run_id,workspace_revision,source_manifest_digest,source_manifest_source_count FROM graphify_runs WHERE workspace_revision=$1 AND lower(source_manifest_digest)=lower($2) ORDER BY completed_at DESC NULLS LAST,started_at DESC,run_id`,[origin.record.workspaceRevision,origin.record.sourceManifestDigest]);
  if(rr.rowCount===0){console.log(JSON.stringify({status:'PERSISTED_WORKSPACE_MANIFEST_NOT_FOUND',workspaceRevision:origin.record.workspaceRevision,sourceManifestDigest:origin.record.sourceManifestDigest,canonicalWritesAttempted:false},null,2));process.exitCode=3;return;}
  if(rr.rowCount!==1){console.log(JSON.stringify({status:'PERSISTED_WORKSPACE_MANIFEST_AMBIGUOUS',matchingRunCount:rr.rowCount,workspaceRevision:origin.record.workspaceRevision,canonicalWritesAttempted:false},null,2));process.exitCode=3;return;}
  const run=rr.rows[0]!;const sr=await client.query<{source_ref:string;code_source_revision:string;content_hash:string;byte_length:string|number;last_seen_run_id:string}>(`SELECT source_ref,code_source_revision,content_hash,byte_length,last_seen_run_id FROM graphify_files WHERE last_seen_run_id=$1 ORDER BY source_ref`,[run.run_id]);
  const receipt=evaluateGraphifyWorkspaceManifestCompletenessV1({workspaceRecord:origin.record,sourceBindings:origin.bindings,persistedRun:{runId:run.run_id,workspaceRevision:run.workspace_revision,sourceManifestDigest:run.source_manifest_digest,sourceManifestSourceCount:Number(run.source_manifest_source_count)},persistedSources:sr.rows.map(r=>({sourceRef:String(r.source_ref).replaceAll('\\','/').replace(/^\.\//,''),codeSourceRevision:r.code_source_revision,contentHash:String(r.content_hash).replace(/^sha256:/,'').toLowerCase(),byteLength:Number(r.byte_length),lastSeenRunId:r.last_seen_run_id})),producerRevision:PRODUCER});
  await mkdir(path.dirname(OUTPUT),{recursive:true});await writeFile(OUTPUT,`${JSON.stringify({...receipt,workspaceOrigin:{record:origin.record,skipped:origin.skipped}},null,2)}\n`,'utf8');
  console.log(JSON.stringify({status:receipt.complete?'GRAPHIFY_WORKSPACE_MANIFEST_COMPLETE':receipt.status,workspaceRevision:receipt.workspaceRevision,runId:receipt.runId,expectedSourceCount:receipt.expectedSourceCount,persistedSourceCount:receipt.persistedSourceCount,matchedSourceCount:receipt.matchedSourceCount,graphMayConsumeWorkspaceRevision:receipt.graphMayConsumeWorkspaceRevision,blockers:receipt.blockers,canonicalWritesAttempted:false,output:OUTPUT},null,2));
  if(!receipt.complete)process.exitCode=3;
}finally{try{await client.query('ROLLBACK');}catch{}client.release();await pool.end();}
