import fs from 'node:fs';
import path from 'node:path';
import { normalizePath } from './repo-walk.mjs';

function existing(paths) {
  const out=[];
  for(const p of paths){ if(!p)continue; try{if(fs.statSync(p).isFile())out.push(p);}catch{} }
  return [...new Set(out)];
}

function candidateArtifacts(root){
  const explicit=process.env.ATLAS_GRAPHIFY_GRAPH_PATH;
  const fixed=[explicit,path.join(root,'codebase-graph.json'),path.join(root,'docs/reports/codebase-graph.json'),path.join(root,'docs/reports/graphify-codebase-graph.json')];
  try{
    for(const name of fs.readdirSync(path.join(root,'docs/reports'))){
      if(/graphify.*\.json$/i.test(name)) fixed.push(path.join(root,'docs/reports',name));
    }
  }catch{}
  return existing(fixed);
}

function rel(root, p){
  const normalized=normalizePath(p);
  if(path.isAbsolute(p)) return normalizePath(path.relative(root,p));
  return normalized.replace(/^\.\//,'');
}

export function readGraphifyEvidence(root, knownFilePaths){
  const known=new Set(knownFilePaths);
  const edges=[]; const treeNodes=new Map(); const artifacts=[]; const skippedArtifacts=[];
  const maxBytes=Number(process.env.ATLAS_GRAPHIFY_MAX_BYTES ?? 268435456);
  for(const artifactPath of candidateArtifacts(root)){
    let stat; try{stat=fs.statSync(artifactPath);}catch{continue;}
    if(stat.size>maxBytes){skippedArtifacts.push({path:normalizePath(path.relative(root,artifactPath)),bytes:stat.size,reason:'GRAPHIFY_ARTIFACT_TOO_LARGE'});continue;}
    let parsed; try{parsed=JSON.parse(fs.readFileSync(artifactPath,'utf8'));}catch{continue;}
    artifacts.push(normalizePath(path.relative(root,artifactPath)));
    const stack=[parsed]; let visited=0;
    while(stack.length && visited<2_000_000){
      const value=stack.pop(); visited++;
      if(Array.isArray(value)){ for(const x of value) stack.push(x); continue; }
      if(!value || typeof value!=='object') continue;
      const o=value;
      const file=typeof o.file_path==='string'?o.file_path:typeof o.filePath==='string'?o.filePath:typeof o.path==='string'?o.path:null;
      const nodeId=o.tree_node_id??o.treeNodeId??o.node_id??o.nodeId;
      if(file && nodeId!=null){ const rp=rel(root,file); if(known.has(rp)) treeNodes.set(rp,(treeNodes.get(rp)??0)+1); }
      const fromRaw=o.from_file??o.fromFile??o.source_file??o.sourceFile??o.from;
      const toRaw=o.to_file??o.toFile??o.target_file??o.targetFile??o.to;
      if(typeof fromRaw==='string'&&typeof toRaw==='string'){
        const from=rel(root,fromRaw), to=rel(root,toRaw);
        if(known.has(from)&&known.has(to)) edges.push({from,to,relation:String(o.relation??o.kind??o.type??'graphify_relation')});
      }
      for(const child of Object.values(o)) if(child && typeof child==='object') stack.push(child);
    }
  }
  const uniqueEdges=[...new Map(edges.map((e)=>[`${e.from}\0${e.to}\0${e.relation}`,e])).values()].sort((a,b)=>a.from.localeCompare(b.from)||a.to.localeCompare(b.to)||a.relation.localeCompare(b.relation));
  return {artifacts,skippedArtifacts,edges:uniqueEdges,treeNodes:Object.fromEntries([...treeNodes.entries()].sort())};
}
