#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { normalizeRef, sha256hex } from './normalize-source-ref-id.mjs';

const repoRoot = process.cwd().replaceAll('\\','/');
const scanRoots = [path.join(repoRoot,'sveltekit-frontend','src'), path.join(repoRoot,'src')];
const outCalls = '.tmp/calls.jsonl';
const outSummary = '.tmp/calls-summary.json';
const outIdentity = '.tmp/identity-catalog.jsonl';

// normalizeRef and sha256hex are reused from normalize-source-ref-id.mjs

function walkDir(root){
  const files = [];
  try{
    const entries = fs.readdirSync(root, { withFileTypes: true });
    for(const e of entries){
      const full = path.join(root, e.name);
      if(e.isDirectory()){
        const name = e.name.toLowerCase();
        if(['node_modules','.svelte-kit','.vite','dist','build','coverage'].includes(name)) continue;
        files.push(...walkDir(full));
      } else if(e.isFile() && /\.(ts|tsx|js|mjs|svelte|jsx|cts)$/.test(e.name)) files.push(full);
    }
  }catch(e){}
  return files;
}

function escapeRegExp(s){
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readFileSafe(p){ try{ return fs.readFileSync(p,'utf8'); }catch(e){ return ''; } }

fs.mkdirSync('.tmp',{recursive:true});

// collect source files
let files = [];
for(const r of scanRoots){ if(fs.existsSync(r)) files.push(...walkDir(r)); }

const callsStream = fs.createWriteStream(outCalls,{flags:'w'});
const unresolvedStream = fs.createWriteStream('.tmp/calls-unresolved.jsonl',{flags:'w'});
const identityMap = new Map(); // normalized -> id
const symbolMap = new Map();

let totalCalls = 0;

for(const f of files){
  const rel = path.relative(repoRoot, f).replaceAll('\\','/');
  const normalizedSource = normalizeRef(rel);
  const sourceRefId = sha256hex(normalizedSource);
  identityMap.set(`sourceRef:${normalizedSource}`, sourceRefId);

  const content = readFileSafe(f);
  if(!content) continue;

  // find import statements
  const importRe = /import\s+([^;]+?)\s+from\s+['"]([^'"]+)['"]/g;
  const imports = [];
  let m;
  while((m = importRe.exec(content))){
    const spec = m[1].trim();
    const src = m[2].trim();
    // parse spec: default, named, namespace
    const named = [];
    const defaultMatch = spec.match(/^([\w$]+)/);
    if(defaultMatch) named.push({ local: defaultMatch[1], imported: 'default' });
    const namedMatch = spec.match(/\{([^}]+)\}/);
    if(namedMatch){
      const parts = namedMatch[1].split(',').map(s=>s.trim()).filter(Boolean);
      for(const p of parts){ const [a,b] = p.split(/\s+as\s+/); named.push({ imported: a.trim(), local: (b||a).trim() }); }
    }
    const namespaceMatch = spec.match(/\*\s+as\s+([\w$]+)/);
    if(namespaceMatch) named.push({ imported: '*', local: namespaceMatch[1] });
    imports.push({ specifiers: named, src });
  }

  // for each import spec, search for usage as a call
  for(const imp of imports){
    for(const sp of imp.specifiers){
      const local = sp.local;
      // find occurrences like local( or local. or local?.(
      const escapedLocal = escapeRegExp(local);
      const callRe = new RegExp('\\b' + escapedLocal + '\\s*\\(', 'g');
      let mm;
      while((mm = callRe.exec(content))){
        totalCalls += 1;
        const charIdx = mm.index;
        const linesBefore = content.slice(0,charIdx).split(/\\r?\\n/);
        const lineNum = linesBefore.length;
        const lineStart = lineNum;
        const lineEnd = lineNum;

        // approximate callerSymbol by searching backward for nearest 'function name' or 'const name' declaration
        const before = content.slice(0,charIdx);
        let callerSymbol = '<module>';
        const fnMatch = before.match(/function\s+([A-Za-z0-9_$]+)\s*\(/g);
        if(fnMatch){ const last = fnMatch[fnMatch.length-1]; const nm = last.match(/function\s+([A-Za-z0-9_$]+)/); if(nm) callerSymbol = nm[1]; }
        else {
          const constMatch = before.match(/const\s+([A-Za-z0-9_$]+)\s*=\s*\(?/g);
          if(constMatch){ const last = constMatch[constMatch.length-1]; const nm = last.match(/const\s+([A-Za-z0-9_$]+)/); if(nm) callerSymbol = nm[1]; }
        }

        const calleeSymbol = sp.imported || local;
        const calleeImportSource = imp.src;

        const callerSymbolId = sha256hex(`${normalizedSource}::${callerSymbol}`);
        const callRecord = {
          sourceRef: rel,
          normalizedSourceRef: normalizedSource,
          sourceRefId,
          callerSymbol,
          callerSymbolId,
          calleeSymbol,
          calleeImportSource,
          lineStart,
          lineEnd,
          confidence: 0.9
        };

        // record symbol ids
        const symbolKey = `symbol:${calleeImportSource}#${calleeSymbol}`;
        if(!symbolMap.has(symbolKey)) symbolMap.set(symbolKey, sha256hex(symbolKey));

        // unresolved if import can't be resolved to a local file
        const resolved = resolveImportToFile(calleeImportSource, f);
        if(!resolved){ unresolvedStream.write(JSON.stringify(callRecord)+'\n'); }

        callsStream.write(JSON.stringify(callRecord)+'\n');
      }
    }
  }
}

callsStream.end();

// identity catalog: emit sourceRefs and symbols
const idStream = fs.createWriteStream(outIdentity,{flags:'w'});
for(const [k,v] of identityMap.entries()){
  const kind = k.split(':')[0];
  const normalized = k.split(':').slice(1).join(':');
  idStream.write(JSON.stringify({ kind: kind==='sourceRef'?'sourceRef':kind, normalizedValue: normalized, id: v })+'\n');
}
for(const [k,v] of symbolMap.entries()){
  const parts = k.split('#');
  const src = parts[0].replace(/^symbol:/,'');
  const sym = parts[1];
  idStream.write(JSON.stringify({ kind: 'symbol', normalizedValue: `${src}#${sym}`, id: v })+'\n');
}
idStream.end();
unresolvedStream.end();

// summary
// compute summary with top callers and unresolved stats
const callsLines = fs.existsSync(outCalls)? fs.readFileSync(outCalls,'utf8').split(/\r?\n/).filter(Boolean).map(l=>JSON.parse(l)) : [];
const unresolvedLines = fs.existsSync('.tmp/calls-unresolved.jsonl')? fs.readFileSync('.tmp/calls-unresolved.jsonl','utf8').split(/\r?\n/).filter(Boolean).map(l=>JSON.parse(l)) : [];

const callerCounts = {};
for(const c of callsLines) callerCounts[c.callerSymbol] = (callerCounts[c.callerSymbol]||0)+1;
const topCallers = Object.entries(callerCounts).sort((a,b)=>b[1]-a[1]).slice(0,20);
const unresolvedByCallee = {};
for(const u of unresolvedLines) unresolvedByCallee[u.calleeSymbol] = (unresolvedByCallee[u.calleeSymbol]||0)+1;

const summary = { runAt: new Date().toISOString(), totalFiles: files.length, totalCalls, callsEmitted: callsLines.length, unresolvedCount: unresolvedLines.length, identityEntries: Array.from(new Set([...identityMap.keys(), ...Array.from(symbolMap.keys())])).length, topCallers, topUnresolvedCallees: Object.entries(unresolvedByCallee).sort((a,b)=>b[1]-a[1]).slice(0,20), sampleCalls: callsLines.slice(0,10) };
fs.writeFileSync(outSummary, JSON.stringify(summary, null, 2));

console.log('Calls extraction completed. Outputs:', outCalls, outSummary, outIdentity, '.tmp/calls-unresolved.jsonl');

function resolveImportToFile(importSrc, sourceFile){
  if(!importSrc || typeof importSrc !== 'string') return false;
  // treat bare module specifiers as unresolved
  if(!importSrc.startsWith('.') && !importSrc.startsWith('/') && !importSrc.startsWith('$') && !importSrc.includes('src/') && !importSrc.includes('sveltekit-frontend')) return false;
  const tryPaths = [];
  if(importSrc.startsWith('.')){
    const basedir = path.dirname(sourceFile);
    tryPaths.push(path.resolve(basedir, importSrc));
  } else if(importSrc.startsWith('$lib/')){
    tryPaths.push(path.join(repoRoot,'sveltekit-frontend','src', importSrc.slice(5)));
  } else if(importSrc.startsWith('/')){
    tryPaths.push(path.join(repoRoot, importSrc));
  } else {
    tryPaths.push(path.join(repoRoot, importSrc));
    tryPaths.push(path.join(repoRoot, 'sveltekit-frontend', importSrc));
  }
  const exts = ['.ts','.tsx','.js','.mjs','.svelte','.cts','.jsx'];
  for(const p of tryPaths){
    try{
      if(fs.existsSync(p) && fs.statSync(p).isFile()) return true;
      for(const e of exts){ if(fs.existsSync(p+e)) return true; }
      for(const e of exts){ if(fs.existsSync(path.join(p,'index'+e))) return true; }
    }catch(e){}
  }
  return false;
}
