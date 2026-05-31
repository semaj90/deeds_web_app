#!/usr/bin/env node
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { performance } from 'perf_hooks';
import { Worker } from 'worker_threads';

function parseArgs(){
  const args = process.argv.slice(2);
  const opts = { glob: null, limit: 0, batchSize: 64, iterations: 1, help:false };
  for(let i=0;i<args.length;i++){
    const a = args[i];
    if(a==='--glob'){ opts.glob = args[++i]; }
    else if(a==='--limit'){ opts.limit = Number(args[++i]||0); }
    else if(a==='--batch-size'){ opts.batchSize = Number(args[++i]||64); }
    else if(a==='--iterations'){ opts.iterations = Number(args[++i]||1); }
    else if(a==='--help'){ opts.help = true; }
  }
  return opts;
}

function now(){ return new Date().toISOString(); }

function globToRegex(glob){
  if(!glob) return null;
  // very small glob -> regex converter supporting ** and *
  let s = glob.replace(/[-/\\^$+?.()|[\]{}]/g,'\\$&');
  s = s.replace(/\\\*\\\*\\\//g, '(?:.*\\/)');
  s = s.replace(/\\\*\\\*/g, '.*');
  s = s.replace(/\\\*/g, '[^\\/]*');
  return new RegExp('^'+s+'$');
}

async function walkAndCollect(root, regex, excluded, limit){
  const out = [];
  async function walk(dir){
    const ents = await fs.readdir(dir, { withFileTypes: true });
    for(const e of ents){
      const p = path.join(dir, e.name);
      const rel = path.relative(process.cwd(), p);
      if(excluded.some(ex => rel.startsWith(ex))) continue;
      if(e.isDirectory()) await walk(p);
      else if(e.isFile()){
        if(regex){ if(!regex.test(rel)) return; }
        const ext = path.extname(e.name).toLowerCase();
        if(['.json','.ndjson','.jsonl','.txt','.js','.ts'].includes(ext)){
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

function statsForTimes(times){
  const sorted = [...times].sort((a,b)=>a-b);
  const sum = times.reduce((a,b)=>a+b,0);
  const avg = sum / times.length || 0;
  function p(n){ const idx = Math.floor(n/100*sorted.length); return sorted[Math.min(idx, sorted.length-1)] || 0; }
  return { total_ms: sum, avg_ms: avg, p50: p(50), p95: p(95), p99: p(99) };
}

async function loadNative(nodePath){
  return require(nodePath);
}

async function run(){
  const opts = parseArgs();
  if(opts.help){ console.log('Usage: --glob <pattern> --limit N --batch-size N --iterations N'); process.exit(0); }

  const excluded = ['node_modules',' .svelte-kit',' .vite','dist','build','coverage','generated'].map(s=>s.trim());
  const globRegex = opts.glob? globToRegex(opts.glob) : null;
  const root = process.cwd();
  const files = await walkAndCollect(root, globRegex, excluded, opts.limit || 0);
  if(files.length===0){ console.log('No files collected'); process.exit(0); }

  // read contents once
  const contents = [];
  for(const f of files){
    try{ const txt = await fs.readFile(f,'utf8'); contents.push({path:f, text:txt, len: Buffer.byteLength(txt,'utf8')}); }
    catch(e){ contents.push({path:f, text:'', len:0}); }
  }

  const total_files = contents.length;
  const total_bytes = contents.reduce((a,b)=>a+b.len,0);

  console.log(`Collected ${total_files} files, ${Math.round(total_bytes/1024)} KB`);

  const results = { startedAt: now(), total_files, total_bytes, runs: [] };

  // prepare native if available
  let native = null;
  try{
    const candidate = path.join(process.cwd(),'simd-bridge','rust-simdjson','target','release','simd_bridge_rs.node');
    if(existsSync(candidate)) native = await loadNative(candidate);
  }catch(e){ native = null; }

  // worker-pool class (CommonJS .cjs)
  const WorkerPool = require(path.join(process.cwd(),'simd-bridge','worker-pool.cjs'));

  for(let iter=0; iter<opts.iterations; iter++){
    console.log('Iteration', iter+1,'/',opts.iterations);
    // A. native async direct
    if(native && (typeof native.parseBatchAsync === 'function' || typeof native.parse_batch_async === 'function')){
      const fn = native.parseBatchAsync || native.parse_batch_async;
      const batchTimes = [];
      const okCount = { ok:0, err:0 };
      const memBefore = process.memoryUsage().rss/1024/1024;
      const t0 = performance.now();
      for(let i=0;i<contents.length;i+=opts.batchSize){
        const slice = contents.slice(i, i+opts.batchSize).map(c=>c.text);
        const s = performance.now();
        try{
          // napi async may be Promise-returning
          const out = await fn(slice);
          const e = performance.now();
          batchTimes.push(e-s);
          // out may be array or object
          if(Array.isArray(out)) okCount.ok += out.length;
          else okCount.err += 0;
        }catch(err){
          batchTimes.push(performance.now()-s);
          okCount.err += slice.length;
        }
      }
      const t1 = performance.now();
      const memAfter = process.memoryUsage().rss/1024/1024;
      const stat = statsForTimes(batchTimes);
      results.runs.push({ mode: 'native-async', iteration: iter+1, total_ms: t1-t0, batches: batchTimes.length, ok: okCount.ok, err: okCount.err, memBefore, memAfter, ...stat });
      console.log('native-async', results.runs[results.runs.length-1]);
    }

    // B. worker pool
    {
      const pool = new WorkerPool(path.join(process.cwd(),'simd-bridge','worker.cjs'));
      const batchTimes = [];
      const okCount = { ok:0, err:0 };
      const memBefore = process.memoryUsage().rss/1024/1024;
      const t0 = performance.now();
      for(let i=0;i<contents.length;i+=opts.batchSize){
        const slice = contents.slice(i,i+opts.batchSize).map(c=>c.text);
        const s = performance.now();
        try{
          const out = await pool.exec({ type: 'parse', contents: slice });
          const e = performance.now();
          batchTimes.push(e-s);
          if(out && out.parsedCount) okCount.ok += out.parsedCount;
        }catch(err){ batchTimes.push(performance.now()-s); okCount.err += Math.min(opts.batchSize, contents.length - i); }
      }
      const t1 = performance.now();
      const memAfter = process.memoryUsage().rss/1024/1024;
      pool.destroy();
      const stat = statsForTimes(batchTimes);
      results.runs.push({ mode: 'worker-pool', iteration: iter+1, total_ms: t1-t0, batches: batchTimes.length, ok: okCount.ok, err: okCount.err, memBefore, memAfter, ...stat });
      console.log('worker-pool', results.runs[results.runs.length-1]);
    }

    // C. baseline JSON.parse
    {
      const batchTimes = [];
      const okCount = { ok:0, err:0 };
      const memBefore = process.memoryUsage().rss/1024/1024;
      const t0 = performance.now();
      for(let i=0;i<contents.length;i+=opts.batchSize){
        const slice = contents.slice(i,i+opts.batchSize);
        const s = performance.now();
        for(const c of slice){
          try{ JSON.parse(c.text); okCount.ok++; }catch(e){ okCount.err++; }
        }
        batchTimes.push(performance.now()-s);
      }
      const t1 = performance.now();
      const memAfter = process.memoryUsage().rss/1024/1024;
      const stat = statsForTimes(batchTimes);
      results.runs.push({ mode: 'json-parse', iteration: iter+1, total_ms: t1-t0, batches: batchTimes.length, ok: okCount.ok, err: okCount.err, memBefore, memAfter, ...stat });
      console.log('json-parse', results.runs[results.runs.length-1]);
    }
  }

  // write reports
  const outJson = path.join(process.cwd(), '.tmp', 'simd-parser-benchmark.json');
  await fs.mkdir(path.dirname(outJson), { recursive: true });
  await fs.writeFile(outJson, JSON.stringify(results, null, 2), 'utf8');
  const md = ['# SIMD parser benchmark', `started: ${now()}`, '', '## Summary', '', JSON.stringify(results, null, 2)].join('\n');
  const outMd = path.join(process.cwd(), '.tmp', 'simd-parser-benchmark.md');
  await fs.writeFile(outMd, md, 'utf8');
  console.log('Benchmark reports written to', outJson, outMd);
}

run().catch(e=>{ console.error(e); process.exit(1); });
