#!/usr/bin/env tsx
import fs from 'node:fs/promises';
import path from 'node:path';

function arg(name: string, fallback?: string) { const p=`--${name}=`; const i=process.argv.slice(2).find(v=>v.startsWith(p)); if(i)return i.slice(p.length); const n=process.argv.indexOf(`--${name}`); return n>=0?process.argv[n+1]:fallback; }
async function state(label:string, raw:string|undefined){ if(!raw)return{label,supplied:false,exists:false,path:null,bytes:null}; const p=path.resolve(raw); try{const s=await fs.stat(p);return{label,supplied:true,exists:s.isFile(),path:p,bytes:s.isFile()?s.size:null};}catch{return{label,supplied:true,exists:false,path:p,bytes:null};}}

async function main(){
  const semanticDefault=path.resolve('..','.tmp','atlas-vector-snapshots','vector-snapshot-5k-768.parquet');
  const files=await Promise.all([
    state('CandidateOrdinalMapV1',arg('ordinal-map')),
    state('semantic_768 parquet',arg('semantic-parquet',semanticDefault)),
    state('CandidateFeatureColumnarV1 JSON',arg('feature-columnar')),
    state('exact CandidateOrdinalSetV1 JSON',arg('exact-candidate-set')),
  ]);
  const missing=files.filter(f=>!f.exists).map(f=>f.label);
  console.log(JSON.stringify({schema:'atlas.sample-query-corpus-readiness.v1',status:missing.length===0?'SAMPLE_QUERY_CORPUS_INPUTS_PRESENT_UNVALIDATED':'SAMPLE_QUERY_CORPUS_INPUTS_INCOMPLETE',files,missing,knownRepoProducers:{semanticParquet:'scripts/atlas/duckdb/freeze-vector-snapshot-5k-768.mts',candidateOrdinalMapJson:null,candidateFeatureColumnarCorpusJson:null,exactCandidateOrdinalSetJson:null},blockers:['semantic parquet row order is packet_key order and must be joined by packetKey','ANN-local ordinals without candidateSnapshotRevision + ordinalMapChecksum are not target truth','EXACT_TOP_K requires CandidateOrdinalSetV1.approximate=false','all inputs must share one frozen CandidateOrdinal world'],noStoreAccess:true,canonicalWritesAttempted:false},null,2));
  process.exitCode=missing.length===0?0:2;
}
main().catch(e=>{console.error(e instanceof Error?e.stack??e.message:String(e));process.exitCode=1;});
