#!/usr/bin/env tsx

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import { materializeWorkspaceRevisionOriginV1 } from '$lib/server/atlas/indexing/workspace-revision-origin-runtime-v1.js';
import { evaluateGraphifyWorkspaceManifestCompletenessV1 } from '$lib/server/atlas/indexing/graphify-workspace-manifest-completeness-v1.js';
import { classifyGraphifySourceInventorySchemaV2 } from '$lib/server/atlas/indexing/graphify-source-inventory-schema-v2.js';
import { loadAtlasEnv } from './load-atlas-env.mjs';

await loadAtlasEnv();
const HERE=path.dirname(fileURLToPath(import.meta.url));
const FRONTEND=path.resolve(HERE,'../..');
const REPO_ROOT=path.resolve(FRONTEND,'..');
const apply=process.argv.includes('--apply');
const sourceArgIndex=process.argv.indexOf('--source');
const requestedSource=sourceArgIndex>=0?process.argv[sourceArgIndex+1]?.replaceAll('\\','/'):null;
const limit=Math.max(1,Math.min(5000,Number(process.env.ATLAS_GRAPHIFY_SOURCE_LIMIT??(requestedSource?1:100))));
const output=path.resolve(REPO_ROOT,process.env.ATLAS_GRAPHIFY_SOURCE_INVENTORY_PLAN_OUT??'docs/reports/graphify-source-inventory-plan-v3.json');
const producerRevision='atlas.graphify-source-inventory-writer.2026-08-22.v3';
const parserContractVersion='graphify.parser.v0.1';
const extractionContractVersion='graphify.extractor.v0.1';

if(apply&&process.env.ATLAS_GRAPHIFY_SOURCE_INVENTORY_APPLY!=='1')throw new Error('GRAPHIFY_SOURCE_INVENTORY_APPLY_CONFIRMATION_REQUIRED');
if(apply&&process.env.ATLAS_NON_PRODUCTION_DATABASE!=='1')throw new Error('GRAPHIFY_SOURCE_INVENTORY_NON_PRODUCTION_DATABASE_REQUIRED');
if(apply&&requestedSource)throw new Error('GRAPHIFY_DURABLE_APPLY_REQUIRES_FULL_MANIFEST_NOT_SINGLE_SOURCE');

const origin=materializeWorkspaceRevisionOriginV1({workspaceRoot:REPO_ROOT,repositoryId:'semaj90/deeds_web_app',producerRevision});
let selected=origin.bindings;
if(!apply){if(requestedSource)selected=selected.filter(b=>b.sourceRef===requestedSource);else selected=selected.slice(0,limit);}
if(selected.length===0)throw new Error(`GRAPHIFY_SOURCE_INVENTORY_SELECTION_EMPTY:${requestedSource??limit}`);

const plan:Record<string,unknown>={schemaVersion:'atlas.graphify-source-inventory-plan.v3',mode:apply?'APPLY_NON_PRODUCTION_FULL_MANIFEST':'DRY_RUN',readOnly:!apply,canonicalWriteAttempted:false,durableOwnerBound:false,workspaceRevision:origin.record.workspaceRevision,sourceManifestDigest:origin.record.sourceManifestDigest,sourceManifestSourceCount:origin.record.sourceCount,repositoryRevision:origin.record.baseCommitOid,selectedWriteCount:selected.length,skippedSourceCount:origin.skipped.length,records:selected.map(b=>({sourceRef:b.sourceRef,codeSourceRevision:b.sourceRevision,contentHash:b.contentDigest,byteLength:b.byteLength,gitBlobOid:b.gitBlobOid})),authority:{workspaceRevisionOwner:'WorkspaceRevisionRecordV1',sourceRevisionOwner:'CodeSourceRevisionV1',workspaceRevisionTableColumn:'graphify_runs.workspace_revision',sourceManifestDigestTableColumn:'graphify_runs.source_manifest_digest',sourceManifestSourceCountTableColumn:'graphify_runs.source_manifest_source_count',codeSourceRevisionTableColumn:'graphify_files.code_source_revision',repositoryRevisionTableColumn:'graphify_runs.repository_revision',legacyFileSourceRevisionColumn:'graphify_files.source_revision',gitCoordinatesAreProvenanceOnly:true},graphMayConsumeWorkspaceRevision:false,nextGate:apply?'FULL_MANIFEST_TRANSACTIONAL_READBACK':'REVIEW_DRY_RUN_THEN_EXPLICIT_NON_PRODUCTION_APPLY'};
await mkdir(path.dirname(output),{recursive:true});await writeFile(output,`${JSON.stringify(plan,null,2)}\n`,'utf8');

if(apply){
  const databaseUrl=process.env.DATABASE_URL;if(!databaseUrl)throw new Error('DATABASE_URL_REQUIRED');
  const workspaceId=process.env.ATLAS_GRAPHIFY_WORKSPACE_ID?.trim();if(!workspaceId||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(workspaceId))throw new Error('ATLAS_GRAPHIFY_WORKSPACE_ID_UUID_REQUIRED');
  if(selected.length!==origin.record.sourceCount)throw new Error(`GRAPHIFY_DURABLE_APPLY_REQUIRES_COMPLETE_MANIFEST:${selected.length}:${origin.record.sourceCount}`);
  const pool=new pg.Pool({connectionString:databaseUrl,max:1});const client=await pool.connect();
  try{
    const tables=await client.query<{table_name:string}>(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('graphify_runs','graphify_files')`);
    const names=new Set(tables.rows.map(r=>r.table_name));const cols=await client.query<{table_name:string;column_name:string}>(`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('graphify_runs','graphify_files')`);
    const schema=classifyGraphifySourceInventorySchemaV2({graphifyRunsPresent:names.has('graphify_runs'),graphifyFilesPresent:names.has('graphify_files'),runColumns:cols.rows.filter(r=>r.table_name==='graphify_runs').map(r=>r.column_name),fileColumns:cols.rows.filter(r=>r.table_name==='graphify_files').map(r=>r.column_name)});
    const runColumnSet=new Set(cols.rows.filter(r=>r.table_name==='graphify_runs').map(r=>r.column_name));
    if(!schema.v2Ready||!runColumnSet.has('source_manifest_source_count'))throw new Error(`GRAPHIFY_MANIFEST_COMPLETENESS_V3_MIGRATION_REQUIRED:${[...schema.missingRunColumns,...schema.missingFileColumns,...(runColumnSet.has('source_manifest_source_count')?[]:['source_manifest_source_count'])].join(',')}`);
    await client.query('BEGIN');
    try{
      const runResult=await client.query<{run_id:string}>(`INSERT INTO graphify_runs (workspace_id,repository_revision,workspace_revision,source_manifest_digest,source_manifest_source_count,parser_contract_version,extraction_contract_version,status,dry_run,configuration,completed_at) VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,'COMPLETED',false,$8::jsonb,now()) ON CONFLICT (workspace_id,workspace_revision,parser_contract_version) WHERE workspace_revision IS NOT NULL DO UPDATE SET repository_revision=EXCLUDED.repository_revision,source_manifest_digest=EXCLUDED.source_manifest_digest,source_manifest_source_count=EXCLUDED.source_manifest_source_count,extraction_contract_version=EXCLUDED.extraction_contract_version,status='COMPLETED',dry_run=false,configuration=EXCLUDED.configuration,completed_at=now() RETURNING run_id`,[workspaceId,origin.record.baseCommitOid,origin.record.workspaceRevision,origin.record.sourceManifestDigest,origin.record.sourceCount,parserContractVersion,extractionContractVersion,JSON.stringify({producerRevision,fullManifest:true,sourceCount:origin.record.sourceCount})]);
      const runId=runResult.rows[0]?.run_id;if(!runId)throw new Error('GRAPHIFY_RUN_WRITE_DID_NOT_RETURN_RUN_ID');
      for(const b of origin.bindings){await client.query(`INSERT INTO graphify_files (workspace_id,source_ref,source_revision,code_source_revision,content_hash,byte_length,first_seen_run_id,last_seen_run_id) VALUES ($1::uuid,$2,$3,$4,$5,$6,$7::uuid,$7::uuid) ON CONFLICT (workspace_id,source_ref,code_source_revision) WHERE code_source_revision IS NOT NULL DO UPDATE SET source_revision=EXCLUDED.source_revision,content_hash=EXCLUDED.content_hash,byte_length=EXCLUDED.byte_length,last_seen_run_id=EXCLUDED.last_seen_run_id`,[workspaceId,b.gitBlobOid,b.sourceRef,b.sourceRevision,b.contentDigest,b.byteLength,runId]);}
      const rr=await client.query<{run_id:string;workspace_revision:string;source_manifest_digest:string;source_manifest_source_count:number}>(`SELECT run_id,workspace_revision,source_manifest_digest,source_manifest_source_count FROM graphify_runs WHERE run_id=$1::uuid`,[runId]);if(rr.rowCount!==1)throw new Error('GRAPHIFY_RUN_READBACK_MISSING');
      const sr=await client.query<{source_ref:string;code_source_revision:string;content_hash:string;byte_length:string|number;last_seen_run_id:string}>(`SELECT source_ref,code_source_revision,content_hash,byte_length,last_seen_run_id FROM graphify_files WHERE workspace_id=$1::uuid AND last_seen_run_id=$2::uuid ORDER BY source_ref`,[workspaceId,runId]);
      const row=rr.rows[0]!;const completeness=evaluateGraphifyWorkspaceManifestCompletenessV1({workspaceRecord:origin.record,sourceBindings:origin.bindings,persistedRun:{runId:row.run_id,workspaceRevision:row.workspace_revision,sourceManifestDigest:row.source_manifest_digest,sourceManifestSourceCount:Number(row.source_manifest_source_count)},persistedSources:sr.rows.map(r=>({sourceRef:r.source_ref,codeSourceRevision:r.code_source_revision,contentHash:String(r.content_hash).replace(/^sha256:/,'').toLowerCase(),byteLength:Number(r.byte_length),lastSeenRunId:r.last_seen_run_id})),producerRevision});
      if(!completeness.complete||!completeness.graphMayConsumeWorkspaceRevision)throw new Error(`GRAPHIFY_FULL_MANIFEST_READBACK_REJECTED:${completeness.status}:${completeness.blockers.join('|')}`);
      await client.query('COMMIT');plan.canonicalWriteAttempted=true;plan.durableOwnerBound=true;plan.graphMayConsumeWorkspaceRevision=true;plan.runId=runId;plan.completenessReceipt=completeness;plan.nextGate='INDEPENDENT_READ_ONLY_COMPLETENESS_PROOF';
    }catch(error){await client.query('ROLLBACK');throw error;}
  }finally{client.release();await pool.end();}
}
await writeFile(output,`${JSON.stringify(plan,null,2)}\n`,'utf8');console.log(JSON.stringify({status:apply?'APPLIED_NON_PRODUCTION_FULL_MANIFEST_READBACK_VERIFIED':'DRY_RUN_PROVEN',output,workspaceRevision:origin.record.workspaceRevision,sourceManifestDigest:origin.record.sourceManifestDigest,sourceManifestSourceCount:origin.record.sourceCount,selectedWriteCount:selected.length,canonicalWriteAttempted:plan.canonicalWriteAttempted,graphMayConsumeWorkspaceRevision:plan.graphMayConsumeWorkspaceRevision},null,2));
