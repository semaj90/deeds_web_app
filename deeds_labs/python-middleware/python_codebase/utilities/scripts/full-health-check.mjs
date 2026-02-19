#!/usr/bin/env node
/**
 * full-health-check.mjs
 * Standalone health aggregator (mirrors earlier one-liner) producing JSON.
 */
import { spawnSync } from 'child_process';
import os from 'os';

function tryCmd(cmd, args, opts={}){ try { return spawnSync(cmd, args, { encoding:'utf8', ...opts }); } catch { return { status:1, stdout:'', stderr:'' }; } }

async function httpJson(url, fallback){
  try { const r = await fetch(url); if(!r.ok) return fallback; return await r.json(); } catch { return fallback; }
}
async function httpText(url){ try { const r = await fetch(url); if(!r.ok) return null; return await r.text(); } catch { return null; } }

async function main(){
  const result = { timestamp: new Date().toISOString() };

  // PostgreSQL
  const psqlPaths = [
    'C:/Program Files/PostgreSQL/17/bin/psql.exe',
    'C:/Program Files/PostgreSQL/16/bin/psql.exe',
    'C:/Program Files/PostgreSQL/15/bin/psql.exe',
    'psql'
  ];
  const psql = psqlPaths.find(p => { const r = tryCmd(p, ['--version']); return r.status===0; });
  if(psql){
    const version = tryCmd(psql, ['-U','postgres','-h','localhost','-d','legal_ai_db','-c','select version();']);
    result.postgres_version = version.stdout.split('\n').find(l=>l.includes('PostgreSQL')) || 'unknown';
    const ext = tryCmd(psql, ['-U','postgres','-h','localhost','-d','legal_ai_db','-t','-c','select count(*) from pg_extension where extname=\'vector\';']);
    result.pgvector_installed = /1/.test(ext.stdout);
  } else {
    result.postgres_version = 'psql-not-found';
    result.pgvector_installed = false;
  }

  // Redis (6379 default) and optional 4005
  const redisPort = process.env.REDIS_PORT || '6379';
  const redisTcp = tryCmd('powershell', ['-NoProfile','-Command',`(Test-NetConnection -ComputerName localhost -Port ${redisPort} -WarningAction SilentlyContinue).TcpTestSucceeded` ]);
  result[`redis_${redisPort}`] = /True/i.test(redisTcp.stdout);
  const redisAlt = tryCmd('powershell', ['-NoProfile','-Command',"(Test-NetConnection -ComputerName localhost -Port 4005 -WarningAction SilentlyContinue).TcpTestSucceeded" ]);
  result.redis_4005 = /True/i.test(redisAlt.stdout);

  // Qdrant
  const qdrant = await httpJson('http://localhost:6333/collections',{ collections:[] });
  result.qdrant_collections = qdrant.collections?.length || 0;

  // MinIO
  const minioLive = await httpText('http://localhost:9000/minio/health/live');
  result.minio_live = !!minioLive;

  // Ollama
  const ollama = await httpJson('http://localhost:11434/api/version',{version:'unreachable'});
  result.ollama_version = ollama.version;

  // Frontend quick check
  const fe = await httpText('http://localhost:5173');
  result.frontend_ok = !!fe;

  // Vector search passive status and active smoke query
  const vectorStatus = await httpText('http://localhost:5173/api/ai/vector-search');
  result.vector_status_ok = !!vectorStatus;
  try {
    const smoke = await fetch('http://localhost:5173/api/ai/vector-search', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'contract liability terms', model: 'claude', limit: 2 })
    });
    const sj = smoke.ok ? await smoke.json() : {};
    result.vector_smoke_count = Array.isArray(sj.results) ? sj.results.length : 0;
  } catch { result.vector_smoke_count = 0; }

  // GPU
  const nvsmi = tryCmd('nvidia-smi', ['--query-gpu=name,memory.total,memory.used,utilization.gpu,power.draw,power.limit','--format=csv,noheader']);
  if(nvsmi.status===0){
    const line = nvsmi.stdout.trim().split('\n')[0] || '';
    const parts = line.split(',').map(s=>s.trim());
    result.gpu = { name: parts[0], memTotal: parts[1], memUsed: parts[2], utilization: parts[3], powerDraw: parts[4], powerLimit: parts[5] };
  } else {
    result.gpu = 'unavailable';
  }

  // CPU per-core load sample
  result.cpu = { cores: os.cpus().length, samples: os.cpus().map(c=>c.times) };

  // MCP Context7 multi-core health (optional)
  const mcp = await httpText('http://localhost:4100/health');
  result.mcp_context7_ok = !!mcp;

  console.log(JSON.stringify(result,null,2));
}
main();
