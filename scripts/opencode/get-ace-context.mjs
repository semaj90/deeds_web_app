#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve('..', '..');
function readIfExists(p){ try { return fs.readFileSync(p,'utf8'); } catch(e){ return ''; } }

function parseEnv(text){
  const vars = new Set();
  for (const line of text.split(/\r?\n/)){
    const m = line.match(/^\s*([A-Z0-9_]{3,})\s*=/);
    if(m) vars.add(m[1]);
  }
  return [...vars];
}

function walk(dir, extFilter){
  const files = [];
  const stack = [dir];
  while(stack.length){
    const d = stack.pop();
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch(e){ continue; }
    for(const name of ents){
      if(name.isDirectory()){
        if(['node_modules','.git','vendor','dist'].includes(name.name)) continue;
        stack.push(path.join(d,name.name));
      } else {
        const p = path.join(d,name.name);
        if(!extFilter || extFilter.includes(path.extname(name.name))) files.push(p);
      }
    }
  }
  return files;
}

function grepFiles(regex, root){
  const hits = new Set();
  const files = walk(root);
  for(const f of files){
    try{
      const txt = fs.readFileSync(f,'utf8');
      if(regex.test(txt)) hits.add(path.relative(process.cwd(), f));
    }catch(e){}
  }
  return [...hits];
}

async function main(){
  const repoRoot = path.resolve(process.cwd());
  const out = {
    featureId: 'env-module',
    generatedAt: new Date().toISOString(),
    ownerFiles: [],
    envVars: [],
    runtimeServices: [],
    sourceRefs: [],
    packageScripts: {},
    mcpToolFiles: [],
    storageLane: [],
    retrievalLane: [],
    dynamicHealth: {},
    missingPieces: [],
    nextSteps: []
  };

  // read env files
  const envText = readIfExists(path.join(repoRoot,'.env')) + '\n' + readIfExists(path.join(repoRoot,'.env.example')) + '\n' + readIfExists(path.join(repoRoot,'.env.local'));
  out.envVars = parseEnv(envText);

  // package.json scripts
  try{
    const pkg = JSON.parse(readIfExists(path.join(repoRoot,'package.json')) || '{}');
    out.packageScripts = pkg.scripts || {};
    if(Object.keys(out.packageScripts).length) out.sourceRefs.push('package.json:scripts');
  }catch(e){}

  // runtime matrix
  const runtime = readIfExists(path.join(repoRoot,'RUNTIME_MATRIX.md')) || readIfExists(path.join(repoRoot,'docs','RUNTIME_MATRIX.md'));
  if(runtime) {
    const services = [];
    ['Ollama','Qdrant','Redis','PostgreSQL','TurboQuant','Seaweed','MinIO','Bifrost','MCP','TRACE','LLAMA','QDRANT','EMBEDDING'].forEach(keyword=>{
      if(new RegExp(keyword,'i').test(runtime)) services.push(keyword);
    });
    out.runtimeServices = [...new Set(services)];
    out.sourceRefs.push('RUNTIME_MATRIX.md');
  }

  // MCP related search
  out.mcpToolFiles = grepFiles(/\bMCP\b|mcp\/server|TRACE_MCP_URL|FastMCP/i, repoRoot).slice(0,100);
  out.sourceRefs.push(...out.mcpToolFiles.slice(0,10));

  // env/reference owners
  const envRefFiles = grepFiles(/\b(OLLAMA|QDRANT|REDIS|POSTGRES|DATABASE_URL|SEAWEED|MINIO|TURBO|BIFROST)\b/i, repoRoot);
  out.ownerFiles = envRefFiles.slice(0,500);

  // storage lane detection
  if(out.envVars.includes('SEAWEED_S3_PORT') || out.envVars.includes('MINIO_PORT')){
    out.storageLane.push('SeaweedFS/S3 (seaweed override)');
  }
  if(out.envVars.includes('MINIO_PORT')) out.storageLane.push('MinIO (legacy)');

  // retrieval lane detection
  if(out.envVars.includes('QDRANT_URL') || out.runtimeServices.includes('Qdrant')) out.retrievalLane.push('Qdrant (semantic)');
  if(out.envVars.includes('REDIS_URL') || out.envVars.includes('REDIS')) out.retrievalLane.push('Redis L1 (exact)');
  if(out.envVars.includes('BIFROST_URL') || out.envVars.includes('BIFROST')) out.retrievalLane.push('Bifrost L2 (semantic cache)');

  // dynamic health probes guess
  out.dynamicHealth = {
    postgres: Boolean(process.env.DATABASE_URL || out.envVars.includes('DATABASE_URL') || out.envVars.includes('PGHOST')),
    redis: Boolean(process.env.REDIS_URL || out.envVars.includes('REDIS_URL') || out.envVars.includes('REDIS')),
    qdrant: Boolean(process.env.QDRANT_URL || out.envVars.includes('QDRANT_URL')),
    ollama: Boolean(process.env.OLLAMA_URL || out.envVars.includes('OLLAMA_URL'))
  };

  if(!out.envVars.length) out.missingPieces.push('.env not present or no env keys discovered');
  if(!out.ownerFiles.length) out.missingPieces.push('No files referencing runtime envs found');
  if(!out.mcpToolFiles.length) out.missingPieces.push('No MCP tool references discovered');

  out.nextSteps.push('Verify Redis/Qdrant/Postgres endpoints and credentials');
  out.nextSteps.push('Publish .opencode/ace-context.json to ace:opencode:context:<hash> in Redis if available');
  out.nextSteps.push('Add smoke probes for Ollama and Qdrant in scripts/opencode/probes');

  // write output file
  const outDir = path.join(repoRoot,'.opencode');
  try{ fs.mkdirSync(outDir, { recursive: true }); } catch(e){}
  const outPath = path.join(outDir,'ace-context.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

  console.log(JSON.stringify(out, null, 2));
  console.log('\nWrote:', outPath);
}

main().catch(err=>{ console.error(err); process.exit(1); });
