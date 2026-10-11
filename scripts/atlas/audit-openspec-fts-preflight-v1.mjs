#!/usr/bin/env node
/**
 * Read-only OpenSpec FTS preflight; NEVER migrates or imports task data.
 * Reuses the existing parser/compiler and SQL DDL authority. No redundant parser.
 * A passing source audit does NOT establish deployed indexes or retrieval reachability.
 */
import {createHash} from 'node:crypto';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const OWNERS=Object.freeze({
 parser:'packages/parent-atlas/src/core/openspec-evidence-compiler.ts',
 ingestion:'packages/parent-atlas/src/core/openspec-repository-ingestion.ts',
 schema:'sveltekit-frontend/src/lib/server/db/openspec-evidence-schema.ts',
 retrievalSql:'sveltekit-frontend/drizzle/manual/20261001_openspec_evidence_retrieval_v1.sql',
});
export function classifySourceSet(inputs){
 const missing=Object.keys(OWNERS).filter(k=>!inputs[k]);
 const sql=inputs.retrievalSql??'';
 const dbSchema=inputs.schema??'';
 return {schema:'atlas.openspec-fts-preflight.v1',status:missing.length?'BLOCKED_MISSING_OWNER':'SOURCE_PREFLIGHT_ONLY',
  missing,sqlChecks:{
   nativeFts:/to_tsvector\s*\(/i.test(sql)&&/USING\s+gin/i.test(sql),
   trigramChallenger:/gin_trgm_ops/i.test(sql),
   indexCreationRequiresApproval:/CREATE\s+INDEX/i.test(sql),
   declarationsExist:/pgTable\s*\(/.test(dbSchema),
  },
  parserOwner:'openspec-evidence-compiler.ts',
  retrievalOwner:'PostgreSQL native FTS (not pg_search)',
  sourceOnly:true,dbWrites:false,deployedIndexVerified:false,
  todo:[
   'TODO: compare parser task identities and line anchors with existing OpenSpec workboard on frozen source revision',
   'TODO: confirm DDL ordering, migration checksum and deployed catalog; never invoke drizzle-kit push or auto-migrate',
   'TODO: approve/apply existing SQL only in separately authorized deployment, then read back indexes',
   'TODO: run bounded tsquery + EXPLAIN (ANALYZE, BUFFERS) after deployment and compare relevance fixtures',
   'TODO: consolidate duplicate WORKSTATION task aliases in reviewed task files, preserving history',
  ]};
}
const checksum=b=>'sha256:'+createHash('sha256').update(JSON.stringify(b)).digest('hex');
export async function inspect(root=ROOT){
 const text={};const fingerprints={};
 for(const [key,rel] of Object.entries(OWNERS)){
  const p=path.resolve(root,rel);
  try{
   const s=await stat(p);
   if(s.size>2_000_000) throw new Error('SOURCE_TOO_LARGE');
   const content=await readFile(p,'utf8');
   text[key]=content;
   fingerprints[key]={path:rel,bytes:s.size,sha256:'sha256:'+createHash('sha256').update(content).digest('hex')};
  }catch(e){if(e.code!=='ENOENT')throw e;text[key]=null;fingerprints[key]={path:rel,missing:true};}
 }
 const body={...classifySourceSet(text),files:fingerprints};
 return {...body,checksum:checksum(body)};
}
export function verify(report){const {checksum:actual,...body}=report;
 if(actual!==checksum(body))throw new Error('PREFLIGHT_CHECKSUM_MISMATCH');return true;}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 inspect().then(r=>{verify(r);process.stdout.write(JSON.stringify(r,null,2)+'\n');})
  .catch(e=>{console.error('OPENSPEC_FTS_PREFLIGHT_FAILED',e.message);process.exitCode=1;});
}
