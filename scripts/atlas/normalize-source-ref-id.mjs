#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const repoRoot = process.cwd().replaceAll('\\','/');
const outPreview = '.tmp/source-ref-normalization-preview.jsonl';
const outReport = '.tmp/source-ref-normalization-report.md';

function safeReadJSON(p){ try{ return JSON.parse(fs.readFileSync(p,'utf8')); }catch(e){ return null; } }
function readNDJSON(p){ if(!fs.existsSync(p)) return []; return fs.readFileSync(p,'utf8').split(/\r?\n/).filter(Boolean).map(l=>{ try{return JSON.parse(l);}catch(e){return {_raw:l};}}); }

function normalizeRef(r){
  if(!r || typeof r !== 'string') return '';
  let s = String(r).trim();
  // strip prefixes
  s = s.replace(/^file:\/\//i,'').replace(/^file:/i,'');
  // normalize slashes
  s = s.replace(/\\/g, '/');
  // strip workspace roots when safe
  const roots = [repoRoot, 'sveltekit-frontend/', './sveltekit-frontend/', 'src/'];
  for(const root of roots){
    if(!root) continue;
    const rnorm = root.replaceAll('\\','/');
    if(s.toLowerCase().startsWith(rnorm.toLowerCase())){
      s = s.slice(rnorm.length);
      break;
    }
  }
  // collapse duplicated src/src/ -> src/
  s = s.replace(/(^|\/)src\/src\//i, '$1src/');
  // remove leading ./ or /
  s = s.replace(/^\.?\//, '');
  // remove trailing line anchors like :123 or #L1
  s = s.replace(/#L\d+(?:-L\d+)?$/,'').replace(/:\d+(?::\d+)?$/,'');
  // collapse duplicate slashes
  s = s.replace(/\/+/g, '/');
  s = s.replace(/^\/+|\/+$/g, '');
  return s;
}

function sha256hex(s){ return crypto.createHash('sha256').update(String(s)).digest('hex'); }

// gather refs from inputs
const inputs = [];
const astPath = '.tmp/ast-neo4j-dryrun.json';
const ledgerPath = '.opencode/outcome-ledger.ndjson';
const debugPath = '.tmp/phase19b-cache-config-join-debug.json';

if(fs.existsSync(astPath)){ inputs.push({type:'ast', path: astPath, body: safeReadJSON(astPath)}); }
if(fs.existsSync(ledgerPath)){ inputs.push({type:'ledger', path: ledgerPath, body: readNDJSON(ledgerPath)}); }
if(fs.existsSync(debugPath)){ inputs.push({type:'debug', path: debugPath, body: safeReadJSON(debugPath)}); }

const found = {}; // originalRef -> Set of normalized forms + sources

function record(original, normalized, src){
  if(!original) return;
  const key = String(original);
  if(!found[key]) found[key] = { originals: new Set(), normals: new Set(), sources: new Set() };
  found[key].originals.add(key);
  found[key].normals.add(normalized);
  if(src) found[key].sources.add(src);
}

// scan ledger entries
for(const inp of inputs){
  if(inp.type==='ledger'){
    for(const row of inp.body){
      const refs = row.sourceRefs || row.sourceRef || row.source || row.source_ref || null;
      const arr = Array.isArray(refs)? refs : (refs? [refs] : []);
      for(const r of arr){ const n = normalizeRef(r); record(r, n, 'ledger:'+inp.path); }
    }
  }
  if(inp.type==='ast' && inp.body){
    // naive traversal: look for keys named sourceRef, sourceRefs, file, path, filePath
    function walk(obj, ctx){
      if(!obj || typeof obj !== 'object') return;
      for(const [k,v] of Object.entries(obj)){
        if(/sourceRefs?|filePath|file|path|source_ref|source/i.test(k) && (typeof v === 'string' || Array.isArray(v))){
          const arr = Array.isArray(v)? v : [v];
          for(const r of arr){ const n = normalizeRef(r); record(r,n,'ast:'+inp.path); }
        }
        if(typeof v === 'object') walk(v, k);
      }
    }
    walk(inp.body, null);
  }
  if(inp.type==='debug' && inp.body){
    // debug JSON may contain arrays of refs
    try{ const text = JSON.stringify(inp.body); const m = text.matchAll(/([A-Za-z0-9_\\-\\.\\/]+cache-config\\.ts)/g); for(const x of m){ const r = x[1]; const n = normalizeRef(r); record(r,n,'debug:'+inp.path); } }catch(e){}
  }
}

// produce outputs
fs.mkdirSync('.tmp',{recursive:true});
const previewStream = fs.createWriteStream(outPreview,{flags:'w'});

let totalRefs = 0;
const normalsSet = new Set();
const duplicates = [];
const ambiguous = [];

for(const [orig,v] of Object.entries(found)){
  totalRefs += 1;
  const normals = Array.from(v.normals).filter(Boolean);
  normals.forEach(n=>normalsSet.add(n));
  const recordObj = { originalRef: orig, normalizedCandidates: normals, normalized: normals.length===1?normals[0]:null, sourceRefId: normals.length===1? sha256hex(normals[0]) : null, sources: Array.from(v.sources) };
  previewStream.write(JSON.stringify(recordObj)+'\n');
  if(normals.length>1) ambiguous.push(recordObj);
  if(normals.length>1 || (normals.length===1 && Array.from(v.sources).length>1 && normals[0].includes('cache-config.ts')===false && orig.includes('/')===false)){
    duplicates.push(recordObj);
  }
}

previewStream.end();

// build report
let md = '# SourceRef Normalization Report\n\n';
md += `Run at: ${new Date().toISOString()}\n\n`;
md += `Inputs scanned: ${inputs.map(i=>i.path).join(', ') || 'none found'}\n\n`;
md += `Total refs scanned: ${totalRefs}\n`;
md += `Unique normalized refs: ${normalsSet.size}\n`;
md += `Duplicate/ambiguous refs: ${ambiguous.length}\n\n`;
md += 'Top 20 unresolved / path-shape mismatches:\n\n';
// compute top unresolved by normalized forms count
const unresolved = Object.entries(found).map(([orig,v])=>({ orig, normals: Array.from(v.normals) })).filter(x=>x.normals.length>1).slice(0,20);
for(const u of unresolved){ md += `- original: ${u.orig} -> candidates: ${u.normals.join(' | ')}\n`; }

// cache-config before/after examples
md += '\nCache-config examples (before -> normalized -> id)\n\n';
const cacheExamples = Object.entries(found).filter(([o,v])=> o.toLowerCase().includes('cache-config.ts')).slice(0,20);
for(const [o,v] of cacheExamples){ const normals = Array.from(v.normals); const norm = normals.length===1?normals[0]:'(ambiguous)'; const id = normals.length===1? sha256hex(norm): '(none)'; md += `- ${o} -> ${norm} -> ${id}\n`; }

md += '\nNotes:\n- This is a dry-run identity pass. No DB or vector writes performed.\n- If normalized value is null, multiple candidates were found; manual review required.\n';

fs.writeFileSync(outReport, md);

console.log('Normalization preview written to', outPreview);
console.log('Report written to', outReport);
// exports for reuse
export { normalizeRef, sha256hex };
