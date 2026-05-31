#!/usr/bin/env node
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

function parseArgs(){
  const args = process.argv.slice(2);
  const opts = { glob: null, limit: 0, batchSize: 64, mode: 'auto', workerThresholdFiles: 64, workerThresholdBytes: 4*1024*1024, dryRun:false };
  for(let i=0;i<args.length;i++){
    const a = args[i];
    if(a==='--glob') opts.glob = args[++i];
    else if(a==='--limit') opts.limit = Number(args[++i]||0);
    else if(a==='--batch-size') opts.batchSize = Number(args[++i]||64);
    else if(a==='--mode') opts.mode = args[++i]||'auto';
    else if(a==='--worker-threshold-files') opts.workerThresholdFiles = Number(args[++i]||64);
    else if(a==='--worker-threshold-bytes') opts.workerThresholdBytes = Number(args[++i]||opts.workerThresholdBytes);
    else if(a==='--dry-run') opts.dryRun = true;
    else if(a==='--help') { console.log('Usage: --mode auto|direct|worker|node --glob <pattern> --limit N --batch-size N'); process.exit(0); }
  }
  return opts;
}

function globToRegex(glob){ if(!glob) return null; let s = glob.replace(/[-/\\^$+?.()|[\]{}]/g,'\\$&'); s = s.replace(/\\\*\\\*\\\//g,'(?:.*\\/)'); s = s.replace(/\\\*\\\*/g, '.*'); s = s.replace(/\\\*/g, '[^\\/]*'); return new RegExp('^'+s+'$'); }

async function walkAndCollect(root, regex, excluded, limit){
  const out = [];
  async function walk(dir){
    const ents = await fs.readdir(dir, { withFileTypes: true });
    for(const e of ents){
      const p = path.join(dir, e.name);
      const rel = path.relative(process.cwd(), p);
      const relNorm = rel.split(path.sep).join('/').toLowerCase();
      // robust exclude: match directory segments anywhere in the relative path
      if(excluded.some(ex => {
        const e = ex.toLowerCase();
        return relNorm === e || relNorm.startsWith(e + '/') || relNorm.includes('/' + e + '/');
      })) continue;
      if(e.isDirectory()) await walk(p);
      else if(e.isFile()){
        if(regex){ if(!regex.test(rel)) continue; }
        const ext = path.extname(e.name).toLowerCase();
        if(['.json','.ndjson','.jsonl'].includes(ext)){
          out.push(p);
          if(limit && out.length>=limit) return;
        }
      }
    }
  }
  if(!existsSync(root)) return out;
  await walk(root);
  return out;
}

function statsForTimes(times){ const sorted = [...times].sort((a,b)=>a-b); const sum = times.reduce((a,b)=>a+b,0); const avg = sum / times.length || 0; function p(n){ const idx = Math.floor(n/100*sorted.length); return sorted[Math.min(idx, sorted.length-1)] || 0; } return { total_ms: sum, avg_ms: avg, p50: p(50), p95: p(95), p99: p(99) } }

async function loadNative(nodePath){ try{ return require(nodePath); }catch(e){ return null; } }

async function main(){
  const opts = parseArgs();
  const excluded = ['node_modules','.svelte-kit','.vite','dist','build','coverage','generated','.cache','.python311','.venv','.svelte-error-fixes-backup','.opencode','venv','__pycache__','docs','docker','.git','.tmp'];
  const globRegex = opts.glob? globToRegex(opts.glob) : null;
  const root = process.cwd();
  const files = await walkAndCollect(root, globRegex, excluded, opts.limit || 0);
  if(files.length===0){ console.error('No files collected'); process.exit(1); }

  const contents = [];
  for(const f of files){
    try{
      const txt = await fs.readFile(f,'utf8');
      const ext = path.extname(f).toLowerCase();
      if(ext === '.ndjson' || ext === '.jsonl'){
        // split into lines and push each non-empty line as a separate content entry
        const lines = txt.split(/\r?\n/);
        for(let i=0;i<lines.length;i++){
          const line = lines[i].trim();
          if(line.length===0) continue;
          contents.push({ path: f, text: line, len: Buffer.byteLength(line,'utf8'), line_no: i+1 });
        }
      } else {
        contents.push({path:f, text:txt, len: Buffer.byteLength(txt,'utf8')});
      }
    }catch(e){ contents.push({path:f, text:'', len:0}); }
  }

  const total_files = contents.length;
  const total_bytes = contents.reduce((a,b)=>a+b.len,0);
  const nativeCandidate = path.join(process.cwd(),'simd-bridge','rust-simdjson','target','release','simd_bridge_rs.node');
  const native = await loadNative(nativeCandidate);
  const nativeAvailable = !!native && (typeof native.parseBatchAsync === 'function' || typeof native.parse_batch_async === 'function' || typeof native.parseBatch === 'function' || typeof native.parse_batch === 'function');

  // Decide routing
  let chosenMode = opts.mode;
  if(chosenMode === 'auto'){
    if(total_files <= opts.workerThresholdFiles && total_bytes <= opts.workerThresholdBytes) chosenMode = 'direct'; else chosenMode = 'worker';
  }

  const results = { startedAt: new Date().toISOString(), total_files, total_bytes, mode: chosenMode, nativeAvailable };

  // Prepare worker pool if needed
  let WorkerPool = null;
  if(chosenMode === 'worker'){
    try{ WorkerPool = require(path.join(process.cwd(),'simd-bridge','worker-pool.cjs')); }catch(e){ WorkerPool = null; }
  }

  // Execute parsing (instrument per-file timings + parser_mode)
  const t0 = performance.now();
  let parsedResults = [];

  // Prefilter obvious non-JSON files by checking first non-whitespace char
  function firstNonWs(s){ const m = /\S/.exec(s); return m? m[0] : null; }
  const candidates = [];
  for(let idx=0; idx<contents.length; idx++){
    const txt = contents[idx].text || '';
    const ch = firstNonWs(txt);
    const allow = ch && (ch === '{' || ch === '[' || ch === '"' || ch === '-' || (ch >= '0' && ch <= '9') || ch === 't' || ch === 'f' || ch === 'n');
    if(!allow){
      parsedResults.push({ input_index: idx, ok:false, byte_len: contents[idx].len, json_kind:null, error_message: 'not_json', parser_mode: 'prefilter', parse_ms: 0 });
    } else {
      candidates.push({ input_index: idx, text: txt, len: contents[idx].len });
    }
  }

  const workItems = candidates; // items to actually parse

  if(chosenMode === 'direct' && nativeAvailable){
    const fn = native.parseBatchAsync || native.parse_batch_async || native.parseBatch || native.parse_batch;
    // call in batches
    const batchSize = opts.batchSize;
    for(let i=0;i<workItems.length;i+=batchSize){
      const sliceItems = workItems.slice(i,i+batchSize);
      const slice = sliceItems.map(c=>c.text);
      const b0 = performance.now();
      try{
        const out = await fn(slice);
        const b1 = performance.now();
        const batch_ms = b1 - b0;
        // out expected array of JSON strings or values
        if(Array.isArray(out)){
          const per = batch_ms / Math.max(1, out.length);
          for(let j=0;j<out.length;j++){
            const candidate = sliceItems[j];
            const idx = candidate.input_index;
            const raw = out[j];
            if(raw==null){ parsedResults.push({ input_index: idx, ok:false, byte_len: candidate.len, json_kind: null, error_message: 'null result', parser_mode: 'native', parse_ms: per }); }
            else { parsedResults.push({ input_index: idx, ok:true, byte_len: candidate.len, json_kind: typeof raw, error_message: null, parser_mode: 'native', parse_ms: per }); }
          }
        } else {
          // unknown shape
          const per = batch_ms / Math.max(1, slice.length);
          for(let j=0;j<sliceItems.length;j++){ const candidate = sliceItems[j]; const idx = candidate.input_index; parsedResults.push({ input_index: idx, ok:false, byte_len: candidate.len, json_kind:null, error_message:'unexpected native output', parser_mode: 'native', parse_ms: per }); }
        }
      }catch(err){ const b1 = performance.now(); const batch_ms = b1 - b0; const per = batch_ms / Math.max(1, slice.length); for(let j=0;j<slice.length;j++){ const idx=i+j; parsedResults.push({ input_index: idx, ok:false, byte_len: contents[idx].len, json_kind:null, error_message: String(err), parser_mode: 'native', parse_ms: per }); } }
    }
  } else if(chosenMode === 'worker' && WorkerPool){
    const pool = new WorkerPool(path.join(process.cwd(),'simd-bridge','worker.cjs'));
    const batchSize = opts.batchSize;
    for(let i=0;i<workItems.length;i+=batchSize){
      const sliceItems = workItems.slice(i,i+batchSize);
      const slice = sliceItems.map(c=>c.text);
      const b0 = performance.now();
      try{
        const out = await pool.exec({ type: 'parse', contents: slice });
        const b1 = performance.now();
        const batch_ms = b1 - b0;
        // Normalize possible worker responses:
        // - worker may return the inner result object (with .result array)
        // - worker may return the array directly
        // - worker may return { success, parsedCount, result }
        let parsedArray = null;
        if(Array.isArray(out)) parsedArray = out;
        else if(out && Array.isArray(out.result)) parsedArray = out.result;
        else if(out && out.result && Array.isArray(out.result.result)) parsedArray = out.result.result; // defensive

        if(parsedArray){
          const per = batch_ms / Math.max(1, parsedArray.length);
          for(let j=0;j<parsedArray.length;j++){
            const candidate = sliceItems[j]; const idx = candidate.input_index; const v = parsedArray[j];
            if(v === null){
              // try node JSON.parse fallback for the individual item
              try{ JSON.parse(candidate.text); parsedResults.push({ input_index: idx, ok:true, byte_len: candidate.len, json_kind: 'object', error_message: null, parser_mode: 'node-fallback', parse_ms: per }); }
              catch(e){ parsedResults.push({ input_index: idx, ok:false, byte_len: candidate.len, json_kind: null, error_message: 'parse error in worker', parser_mode: 'worker', parse_ms: per }); }
            } else {
              parsedResults.push({ input_index: idx, ok:true, byte_len: candidate.len, json_kind: typeof v, error_message: null, parser_mode: 'worker', parse_ms: per });
            }
          }
        } else {
            // If worker returned an explicit error, attempt local JSON.parse fallback per-item
            const per = batch_ms / Math.max(1, slice.length);
          if(out && out.success === false && out.error){
            for(let j=0;j<sliceItems.length;j++){
              const candidate = sliceItems[j]; const idx = candidate.input_index;
              try{ JSON.parse(candidate.text); parsedResults.push({ input_index: idx, ok:true, byte_len: candidate.len, json_kind: 'object', error_message: null, parser_mode: 'node-fallback', parse_ms: per }); }
              catch(parseErr){ parsedResults.push({ input_index: idx, ok:false, byte_len: candidate.len, json_kind:null, error_message: 'worker error: '+String(out.error), parser_mode: 'worker', parse_ms: per }); }
            }
          } else {
            // capture returned shape for debugging
            for(let j=0;j<sliceItems.length;j++){ const candidate = sliceItems[j]; const idx = candidate.input_index; parsedResults.push({ input_index: idx, ok:false, byte_len: candidate.len, json_kind:null, error_message: 'worker unexpected output - ' + JSON.stringify(out).slice(0,200), parser_mode: 'worker', parse_ms: per }); }
          }
        }
      }catch(err){ const b1 = performance.now(); const batch_ms = b1 - b0; const per = batch_ms / Math.max(1, slice.length); for(let j=0;j<slice.length;j++){ const idx=i+j; parsedResults.push({ input_index: idx, ok:false, byte_len: contents[idx].len, json_kind:null, error_message: String(err), parser_mode: 'worker', parse_ms: per }); } }
    }
    if(pool && typeof pool.destroy === 'function') pool.destroy();
  } else {
    // fallback to JSON.parse one-by-one
    for(let k=0;k<workItems.length;k++){
      const candidate = workItems[k];
      const b0 = performance.now();
      try{ JSON.parse(candidate.text); const b1 = performance.now(); parsedResults.push({ input_index: candidate.input_index, ok:true, byte_len: candidate.len, json_kind: 'object', error_message: null, parser_mode: 'node', parse_ms: b1-b0 }); }
      catch(e){ const b1 = performance.now(); parsedResults.push({ input_index: candidate.input_index, ok:false, byte_len: candidate.len, json_kind: null, error_message: String(e), parser_mode: 'node', parse_ms: b1-b0 }); }
    }
  }

  const t1 = performance.now();
  const total_ms = t1 - t0;
  const ok_count = parsedResults.filter(r=>r.ok).length;
  const err_count = parsedResults.length - ok_count;

  results.total_ms = total_ms;
  results.ok_count = ok_count;
  results.err_count = err_count;
  results.parsed = parsedResults;

  // write report
  const outJson = path.join(process.cwd(), '.tmp', 'simd-adaptive-parser.json');
  await fs.mkdir(path.dirname(outJson), { recursive: true });
  await fs.writeFile(outJson, JSON.stringify(results, null, 2), 'utf8');
  const md = ['# Adaptive JSON Parser', `started: ${results.startedAt}`, '', '## Summary', '', JSON.stringify({ total_files, total_bytes, mode: chosenMode, nativeAvailable, total_ms, ok_count, err_count }, null, 2)].join('\n');
  const outMd = path.join(process.cwd(), '.tmp', 'simd-adaptive-parser.md');
  await fs.writeFile(outMd, md, 'utf8');

  // Produce validation report summarizing failures and per-file telemetry
  const val = { generatedAt: new Date().toISOString(), total_files, ok_count, err_count, nativeAvailable, mode: chosenMode, samples: [] };
  // collect top errors
  const errors = parsedResults.filter(r=>!r.ok).slice(0,50).map(r=>({ input_index: r.input_index, path: contents[r.input_index]?.path || null, line_no: contents[r.input_index]?.line_no || null, error: r.error_message, parser_mode: r.parser_mode, parse_ms: r.parse_ms }));
  val.errors = errors;
  // aggregate parser mode stats
  const byMode = {};
  for(const r of parsedResults){
    const m = r.parser_mode || 'unknown';
    byMode[m] = byMode[m] || { count:0, ok:0, err:0, total_ms:0 };
    byMode[m].count += 1;
    if(r.ok) byMode[m].ok += 1; else byMode[m].err += 1;
    byMode[m].total_ms += (r.parse_ms||0);
  }
  val.by_mode = byMode;
  const valJson = path.join(process.cwd(), '.tmp', 'simd-native-bridge-validation.json');
  await fs.writeFile(valJson, JSON.stringify(val, null, 2), 'utf8');
  const valMd = path.join(process.cwd(), '.tmp', 'simd-native-bridge-validation.md');
  const mdLines = [];
  mdLines.push('# SIMD Native Bridge Validation Report');
  mdLines.push(`generated: ${val.generatedAt}`);
  mdLines.push('');
  mdLines.push('## Summary');
  mdLines.push('');
  mdLines.push(`- total_files: ${total_files}`);
  mdLines.push(`- ok_count: ${ok_count}`);
  mdLines.push(`- err_count: ${err_count}`);
  mdLines.push(`- chosen_mode: ${chosenMode}`);
  mdLines.push(`- nativeAvailable: ${nativeAvailable}`);
  mdLines.push('');
  mdLines.push('## By Mode');
  for(const k of Object.keys(byMode)){
    const b = byMode[k];
    mdLines.push(`- ${k}: count=${b.count} ok=${b.ok} err=${b.err} avg_ms=${(b.total_ms / Math.max(1,b.count)).toFixed(2)}`);
  }
  mdLines.push('');
  mdLines.push('## Sample Errors (first 20)');
  for(const e of errors.slice(0,20)) mdLines.push(`- [${e.input_index}] ${e.path} — ${e.error} (parser=${e.parser_mode} ms=${e.parse_ms})`);
  await fs.writeFile(valMd, mdLines.join('\n'), 'utf8');

  console.log('Adaptive parse complete. Report:', outJson, outMd);
  console.log('Validation report:', valJson, valMd);
  process.exit(0);
}

main().catch(e=>{ console.error(e); process.exit(1); });
