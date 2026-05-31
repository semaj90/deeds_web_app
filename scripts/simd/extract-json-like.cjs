#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function safeParse(s){ try{ return JSON.parse(s); }catch(e){ return null } }

function heuristicsExtract(content){
  const found = [];
  // 1) try split on '}' followed by newline and '{' (common concatenated JSON)
  const parts = content.split(/}\s*\n\s*\{/g);
  if(parts.length>1){
    for(let i=0;i<parts.length;i++){
      let p = parts[i];
      if(i!==0) p = '{'+p; if(i!==parts.length-1) p = p+'}';
      const parsed = safeParse(p);
      if(parsed) found.push(parsed);
    }
    if(found.length>1) return found;
  }
  // 2) line-wise JSON
  const lines = content.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  for(const l of lines){
    if(l.startsWith('{') && l.endsWith('}')){
      const p = safeParse(l);
      if(p) found.push(p);
    }
  }
  if(found.length>0) return found;
  // 3) regex approximate: capture {...} non-greedy
  const regex = /\{[^\}]{20,}?\}/g; // require at least some content
  let m;
  while((m = regex.exec(content)) !== null){
    const p = safeParse(m[0]); if(p) found.push(p);
  }
  return found;
}

function processFile(inPath){
  const outPath = inPath + '.retry-extracted.items.jsonl';
  if(!fs.existsSync(inPath)) return {file:inPath,status:'missing'};
  const raw = fs.readFileSync(inPath,'utf8').trim();
  // try to parse line per line (file may contain multiple JSON lines)
  const lines = raw.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  const recovered = [];
  for(const l of lines){
    const obj = safeParse(l);
    if(!obj) continue;
    // If it's a chunk object with content, apply heuristics
    if(obj.content && typeof obj.content === 'string'){
      const ext = heuristicsExtract(obj.content);
      if(ext && ext.length>0){
        for(const e of ext) recovered.push(e);
        continue;
      }
    }
    // otherwise if it's already a plausible item
    recovered.push(obj);
  }
  if(recovered.length>0){
    const payload = recovered.map(r=>JSON.stringify(r)).join('\n') + '\n';
    fs.writeFileSync(outPath, payload, 'utf8');
    return {file:inPath, out: outPath, status:'recovered', count: recovered.length};
  }
  return {file:inPath, status:'nothing'};
}

if(require.main === module){
  const args = process.argv.slice(2);
  if(args.length===0) return console.error('Usage: node extract-json-like.cjs <file1> [file2]...');
  const results = [];
  for(const a of args){
    try{ results.push(processFile(a)); }
    catch(e){ results.push({file:a, status:'error', error:String(e)}); }
  }
  const report = path.join(process.cwd(), '.tmp', 'repairs', 'unwrapped', 'extract-json-like.' + new Date().toISOString().replace(/[:.]/g,'-') + '.json');
  fs.writeFileSync(report, JSON.stringify({created:new Date().toISOString(), results}, null, 2), 'utf8');
  console.log('Wrote', report);
}
