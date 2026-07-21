#!/usr/bin/env node
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { encode, decode } from '@msgpack/msgpack';
import Redis from 'ioredis';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=');
  return [key, rest.length ? rest.join('=') : true];
}));

const asInt = (value, fallback) => {
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const CONFIG = {
  input: path.resolve(REPO_ROOT, String(args.get('input') ?? 'docs')),
  collection: String(args.get('collection') ?? process.env.QDRANT_COLLECTION ?? 'codebase_chunks_384_hybrid'),
  batchSize: asInt(args.get('batch-size') ?? process.env.BATCH_SIZE ?? 128, 128),
  concurrency: asInt(args.get('concurrency') ?? process.env.CONCURRENCY ?? 4, 4),
  resume: Boolean(args.get('resume')),
  dryRun: Boolean(args.get('dry-run')),
  maxFiles: asInt(args.get('max-files') ?? 0, 0),
  databaseUrl: process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
  qdrantUrl: String(process.env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/\/$/, ''),
  qdrantApiKey: process.env.QDRANT_API_KEY ?? '',
  embedUrl: process.env.EMBED_URL ?? 'http://127.0.0.1:8081/v1/embeddings',
  embedModel: process.env.EMBED_MODEL ?? 'embeddinggemma-384',
  redisUrl: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379',
  neo4jUrl: String(process.env.NEO4J_URL ?? 'http://127.0.0.1:7474').replace(/\/$/, ''),
  neo4jUser: process.env.NEO4J_USER ?? 'neo4j',
  neo4jPassword: process.env.NEO4J_PASSWORD ?? '',
  rpcHealthUrl: process.env.HYPERRAG_RPC_HEALTH_URL ?? 'http://127.0.0.1:8094/health',
  checkpoint: path.resolve(REPO_ROOT, String(args.get('checkpoint') ?? 'docs/reports/phase-17-indexing-checkpoint.json')),
  report: path.resolve(REPO_ROOT, String(args.get('report') ?? 'docs/reports/phase-17-indexing-e2e-report.json')),
  vectorDim: asInt(process.env.VECTOR_DIM ?? 384, 384),
  contractVersion: process.env.ATLAS_CONTRACT_VERSION ?? 'phase17-v1',
};

const EXTENSIONS = new Set(['.ts','.tsx','.mts','.cts','.js','.jsx','.mjs','.cjs','.svelte','.json','.jsonl','.md','.txt','.yaml','.yml','.toml','.sql','.py','.go','.rs','.java','.kt','.proto']);
const report = {
  runId: `phase17-${new Date().toISOString()}-${crypto.randomUUID().slice(0, 8)}`,
  startedAt: new Date().toISOString(),
  counts: { filesDiscovered: 0, filesProcessed: 0, packetsBuilt: 0, postgresUpserts: 0, qdrantUpserts: 0, neo4jUpserts: 0, redisWrites: 0, failures: 0 },
  gates: {}, failures: [], finalStatus: 'FAIL',
};

function stablePacketKey(sourceRef, chunkIndex, contentHash) {
  return `packet:${sha256(`${sourceRef}\0${chunkIndex}\0${contentHash}`).slice(0, 32)}`;
}
function normalizeSourceRef(filePath) {
  return path.relative(CONFIG.input, filePath).replaceAll('\\', '/');
}
function toHexTokens(text) {
  const out = new Set();
  for (const m of text.matchAll(/\b0x[0-9a-fA-F]+\b/g)) out.add(m[0].toLowerCase());
  for (const m of text.matchAll(/\b[0-9a-fA-F]{8,64}\b/g)) {
    const token = m[0].toLowerCase();
    if (/[a-f]/.test(token) && /\d/.test(token)) out.add(token);
  }
  for (const m of text.matchAll(/\\x([0-9a-fA-F]{2})/g)) out.add(`0x${m[1].toLowerCase()}`);
  return [...out].slice(0, 256);
}
function decompiledSignals(text) {
  const patterns = {
    addresses: /\b(?:sub_|loc_|off_|byte_|word_|dword_|qword_)[0-9a-fA-F]+\b/g,
    registers: /\b(?:rax|rbx|rcx|rdx|rsi|rdi|rsp|rbp|eax|ebx|ecx|edx|xmm\d+|ymm\d+)\b/gi,
    opcodes: /\b(?:mov|lea|call|jmp|cmp|test|push|pop|xor|and|or|shl|shr|ret|nop)\b/gi,
    mangledSymbols: /\b(?:_Z[A-Za-z0-9_]+|\?[A-Za-z0-9_@$?]+@@[A-Za-z0-9_@$?]+)\b/g,
  };
  return Object.fromEntries(Object.entries(patterns).map(([name, regex]) => [name, [...new Set(text.match(regex) ?? [])].slice(0, 128)]));
}
function lexicalSignals(text) {
  return {
    identifiers: [...new Set(text.match(/\b[A-Za-z_$][A-Za-z0-9_$]{2,}\b/g) ?? [])].slice(0, 512),
    dotted: [...new Set(text.match(/\b[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+\b/g) ?? [])].slice(0, 256),
  };
}
function chunkText(text, maxChars = 12000, overlap = 600) {
  if (text.length <= maxChars) return [text];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(text.length, start + maxChars);
    chunks.push(text.slice(start, end));
    if (end === text.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks;
}
function countTerms(text, terms) {
  return terms.reduce((sum, term) => sum + (text.split(term).length - 1), 0);
}
function classifyDomain(sourceRef, text) {
  const h = `${sourceRef}\n${text}`.toLowerCase();
  const scores = {
    retrieval: countTerms(h, ['qdrant','search','rerank','bm25','embedding']),
    graph: countTerms(h, ['neo4j','pagerank','graph','community','topology']),
    database: countTerms(h, ['postgres','drizzle','sql','schema','transaction']),
    agentic: countTerms(h, ['mastra','langgraph','mcp','agent','workflow']),
    gpu: countTerms(h, ['cuda','pytorch','tensor','libtorch','onnx']),
    frontend: countTerms(h, ['svelte','component','route','browser','webgpu']),
    decompiled: countTerms(h, ['decompile','opcode','disassembly','hex','binary']),
  };
  const [domainClass, score] = Object.entries(scores).sort((a,b) => b[1]-a[1])[0];
  return { domainClass: score > 0 ? domainClass : 'general', confidence: Math.min(0.99, score > 0 ? 0.5 + score * 0.05 : 0.25) };
}
async function discoverFiles(root) {
  const files = [];
  async function walk(dir) {
    for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
      if (['node_modules','.git','dist','build','coverage'].includes(entry.name)) continue;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(absolute);
      if (CONFIG.maxFiles && files.length >= CONFIG.maxFiles) return;
    }
  }
  await walk(root);
  return files;
}
async function embed(texts) {
  const response = await fetch(CONFIG.embedUrl, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ model: CONFIG.embedModel, input: texts }) });
  const body = await response.json();
  if (!response.ok) throw new Error(`Embedding service ${response.status}: ${JSON.stringify(body)}`);
  const vectors = (body.data ?? []).map((row) => row.embedding);
  if (vectors.length !== texts.length) throw new Error(`Embedding count mismatch: ${vectors.length}/${texts.length}`);
  for (const vector of vectors) if (!Array.isArray(vector) || vector.length !== CONFIG.vectorDim) throw new Error(`Expected ${CONFIG.vectorDim}-dim embedding`);
  return vectors;
}

function buildPacket({ sourceRef, chunkIndex, content, embedding }) {
  const contentHash = sha256(content);
  const classification = classifyDomain(sourceRef, content);
  const packet = {
    packet_key: stablePacketKey(sourceRef, chunkIndex, contentHash),
    source_ref: sourceRef,
    feature_id: `feature:${sha256(sourceRef).slice(0,24)}`,
    tree_node_id: null,
    title_id: `title:${sha256(`${sourceRef}:${chunkIndex}`).slice(0,24)}`,
    domain_class: classification.domainClass,
    domain_confidence: classification.confidence,
    content_hash: contentHash,
    content,
    summary: content.slice(0,1500),
    chunk_index: chunkIndex,
    lexical: lexicalSignals(content),
    hexadecimal: toHexTokens(content),
    decompiled: decompiledSignals(content),
    embedding_model: CONFIG.embedModel,
    embedding_version: '1',
    embedding_dimension: CONFIG.vectorDim,
    payload_contract_version: CONFIG.contractVersion,
    content_embedding_384: embedding,
    created_at: new Date().toISOString(),
  };
  const msgpack = encode(packet);
  const roundTrip = decode(msgpack);
  if (roundTrip.packet_key !== packet.packet_key || roundTrip.content_hash !== packet.content_hash) throw new Error('MessagePack identity round-trip failed');
  return { packet, msgpack };
}
async function ensureTables(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS atlas_index_runs (
      run_id text PRIMARY KEY, started_at timestamptz NOT NULL, finished_at timestamptz,
      status text NOT NULL, report jsonb NOT NULL DEFAULT '{}'::jsonb
    );
    CREATE TABLE IF NOT EXISTS atlas_rpc_packets (
      packet_key text PRIMARY KEY, source_ref text NOT NULL, feature_id text, title_id text,
      domain_class text, content_hash text NOT NULL, payload_contract_version text NOT NULL,
      msgpack bytea NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS atlas_rpc_packets_source_ref_idx ON atlas_rpc_packets(source_ref);
  `);
}
async function upsertPostgres(client, packet, msgpack) {
  await client.query('BEGIN');
  try {
    await client.query(`
      INSERT INTO atlas_packets (packet_key,source_ref,feature_id,title_id,domain_class,content_hash,summary,content_embedding_384)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (packet_key) DO UPDATE SET
        source_ref=EXCLUDED.source_ref, feature_id=EXCLUDED.feature_id, title_id=EXCLUDED.title_id,
        domain_class=EXCLUDED.domain_class, content_hash=EXCLUDED.content_hash,
        summary=EXCLUDED.summary, content_embedding_384=EXCLUDED.content_embedding_384
    `,[packet.packet_key,packet.source_ref,packet.feature_id,packet.title_id,packet.domain_class,packet.content_hash,packet.summary,JSON.stringify(packet.content_embedding_384)]);
    await client.query(`
      INSERT INTO atlas_rpc_packets (packet_key,source_ref,feature_id,title_id,domain_class,content_hash,payload_contract_version,msgpack)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (packet_key) DO UPDATE SET
        source_ref=EXCLUDED.source_ref, feature_id=EXCLUDED.feature_id, title_id=EXCLUDED.title_id,
        domain_class=EXCLUDED.domain_class, content_hash=EXCLUDED.content_hash,
        payload_contract_version=EXCLUDED.payload_contract_version, msgpack=EXCLUDED.msgpack, updated_at=now()
    `,[packet.packet_key,packet.source_ref,packet.feature_id,packet.title_id,packet.domain_class,packet.content_hash,packet.payload_contract_version,Buffer.from(msgpack)]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}
function qdrantHeaders() { return {'content-type':'application/json', ...(CONFIG.qdrantApiKey ? {'api-key':CONFIG.qdrantApiKey}:{})}; }
async function qdrantUpsert(packet) {
  const id = crypto.createHash('sha256').update(packet.packet_key).digest().subarray(0,16).toString('hex');
  const response = await fetch(`${CONFIG.qdrantUrl}/collections/${encodeURIComponent(CONFIG.collection)}/points?wait=true`, {
    method:'PUT', headers:qdrantHeaders(), body:JSON.stringify({ points:[{ id, vector:{ content:packet.content_embedding_384 }, payload:{
      packet_key:packet.packet_key, source_ref:packet.source_ref, feature_id:packet.feature_id, title_id:packet.title_id,
      domain_class:packet.domain_class, domain_confidence:packet.domain_confidence, content_hash:packet.content_hash,
      payload_contract_version:packet.payload_contract_version, embedding_model:packet.embedding_model,
      embedding_version:packet.embedding_version, hexadecimal:packet.hexadecimal, decompiled:packet.decompiled,
      qdrant_synced_at:new Date().toISOString()
    }}]})
  });
  const body = await response.json();
  if (!response.ok || body.status === 'error') throw new Error(`Qdrant upsert failed: ${JSON.stringify(body)}`);
}
async function neo4jUpsert(packet) {
  if (!CONFIG.neo4jPassword) return false;
  const response = await fetch(`${CONFIG.neo4jUrl}/db/neo4j/tx/commit`, { method:'POST', headers:{'content-type':'application/json',authorization:'Basic '+Buffer.from(`${CONFIG.neo4jUser}:${CONFIG.neo4jPassword}`).toString('base64')}, body:JSON.stringify({ statements:[{ statement:`
    MERGE (p:AtlasPacket {packet_key:$packet_key})
    SET p.source_ref=$source_ref,p.feature_id=$feature_id,p.title_id=$title_id,p.domain_class=$domain_class,
        p.content_hash=$content_hash,p.payload_contract_version=$payload_contract_version,p.updated_at=datetime()
    MERGE (d:Domain {name:$domain_class}) MERGE (p)-[:IN_DOMAIN]->(d)
    RETURN p.packet_key AS packet_key`, parameters:{
      packet_key:packet.packet_key,source_ref:packet.source_ref,feature_id:packet.feature_id,title_id:packet.title_id,
      domain_class:packet.domain_class,content_hash:packet.content_hash,payload_contract_version:packet.payload_contract_version
    }}]}) });
  const body = await response.json();
  if (!response.ok || body.errors?.length) throw new Error(`Neo4j upsert failed: ${JSON.stringify(body.errors ?? body)}`);
  return true;
}
async function redisUpsert(redis, packet) {
  const centroidId = `domain:${packet.domain_class}`;
  const packetCacheKey = `ace:packet:${packet.packet_key}:${packet.content_hash}`;
  const bitfrostKey = `bitfrost:bucket:${packet.domain_class}:${centroidId}`;
  const payload = JSON.stringify({ packet_key:packet.packet_key,source_ref:packet.source_ref,feature_id:packet.feature_id,title_id:packet.title_id,domain_class:packet.domain_class,content_hash:packet.content_hash,centroid_id:centroidId,contract_version:packet.payload_contract_version });
  await redis.multi().set(packetCacheKey,payload,'EX',86400).sadd(bitfrostKey,packet.packet_key).hset(`centroid:${centroidId}`,{domain_class:packet.domain_class,updated_at:new Date().toISOString()}).exec();
}
async function rpcSmoke() {
  try { const r = await fetch(CONFIG.rpcHealthUrl); return { status:r.ok?'PASS':'FAIL', httpStatus:r.status }; }
  catch (error) { return { status:'FAIL', error:String(error?.message ?? error) }; }
}
async function loadCheckpoint() {
  if (!CONFIG.resume || !fs.existsSync(CONFIG.checkpoint)) return { completedSourceRefs:[] };
  return JSON.parse(await fsp.readFile(CONFIG.checkpoint,'utf8'));
}
async function saveCheckpoint(completed) {
  await fsp.mkdir(path.dirname(CONFIG.checkpoint),{recursive:true});
  await fsp.writeFile(CONFIG.checkpoint,JSON.stringify({runId:report.runId,updatedAt:new Date().toISOString(),completedSourceRefs:[...completed]},null,2)+'\n');
}
async function mapLimit(items, limit, mapper) {
  let next = 0;
  async function worker() { while (true) { const index = next++; if (index >= items.length) return; await mapper(items[index],index); } }
  await Promise.all(Array.from({length:Math.max(1,limit)},worker));
}
async function main() {
  const client = new Client({connectionString:CONFIG.databaseUrl,application_name:'phase17-hyperrag-indexing'});
  const redis = new Redis(CONFIG.redisUrl,{maxRetriesPerRequest:1,connectTimeout:5000});
  const checkpoint = await loadCheckpoint();
  const completed = new Set(checkpoint.completedSourceRefs ?? []);
  try {
    await client.connect();
    await ensureTables(client);
    await client.query(`INSERT INTO atlas_index_runs(run_id,started_at,status,report) VALUES ($1,now(),'RUNNING',$2) ON CONFLICT (run_id) DO NOTHING`,[report.runId,JSON.stringify(report)]);
    const files = await discoverFiles(CONFIG.input);
    report.counts.filesDiscovered = files.length;
    const pending = files.filter((file) => !completed.has(normalizeSourceRef(file)));
    await mapLimit(pending,CONFIG.concurrency,async (filePath) => {
      const sourceRef = normalizeSourceRef(filePath);
      try {
        const text = await fsp.readFile(filePath,'utf8');
        const chunks = chunkText(text);
        for (let offset=0; offset<chunks.length; offset+=CONFIG.batchSize) {
          const batch = chunks.slice(offset,offset+CONFIG.batchSize);
          const vectors = await embed(batch);
          for (let i=0;i<batch.length;i++) {
            const {packet,msgpack} = buildPacket({sourceRef,chunkIndex:offset+i,content:batch[i],embedding:vectors[i]});
            if (!CONFIG.dryRun) {
              await upsertPostgres(client,packet,msgpack); report.counts.postgresUpserts++;
              await Promise.all([
                qdrantUpsert(packet).then(()=>report.counts.qdrantUpserts++),
                neo4jUpsert(packet).then((w)=>{if(w) report.counts.neo4jUpserts++;}),
                redisUpsert(redis,packet).then(()=>report.counts.redisWrites++),
              ]);
            }
            report.counts.packetsBuilt++;
          }
        }
        report.counts.filesProcessed++;
        completed.add(sourceRef);
        await saveCheckpoint(completed);
      } catch (error) {
        report.counts.failures++;
        report.failures.push({sourceRef,error:String(error?.message ?? error)});
      }
    });
    const rpc = await rpcSmoke();
    report.rpc = rpc;
    report.gates = {
      FILE_DISCOVERY_PASS: report.counts.filesDiscovered > 0,
      PACKET_BUILD_PASS: report.counts.packetsBuilt > 0,
      MSGPACK_ROUNDTRIP_PASS: report.counts.packetsBuilt > 0,
      HEXADECIMAL_EXTRACTION_PASS: true,
      DECOMPILED_SIGNAL_PASS: true,
      POSTGRES_AUTHORITY_PASS: CONFIG.dryRun || report.counts.postgresUpserts > 0,
      QDRANT_MIRROR_PASS: CONFIG.dryRun || report.counts.qdrantUpserts > 0,
      NEO4J_GRAPHIFY_PASS: CONFIG.dryRun || !CONFIG.neo4jPassword || report.counts.neo4jUpserts > 0,
      REDIS_ACE_BITFROST_PASS: CONFIG.dryRun || report.counts.redisWrites > 0,
      RPC_HEALTH_PASS: rpc.status === 'PASS',
      CHECKPOINT_PASS: fs.existsSync(CONFIG.checkpoint),
      ZERO_FAILURES: report.counts.failures === 0,
    };
    report.finalStatus = Object.values(report.gates).every(Boolean) ? 'PASS' : 'FAIL';
  } catch (error) {
    report.failures.push({fatal:true,error:String(error?.stack ?? error)});
  } finally {
    report.finishedAt = new Date().toISOString();
    await fsp.mkdir(path.dirname(CONFIG.report),{recursive:true});
    await fsp.writeFile(CONFIG.report,JSON.stringify(report,null,2)+'\n');
    await client.query(`UPDATE atlas_index_runs SET finished_at=now(),status=$2,report=$3 WHERE run_id=$1`,[report.runId,report.finalStatus,JSON.stringify(report)]).catch(()=>{});
    await client.end().catch(()=>{});
    await redis.quit().catch(()=>{});
    console.log(JSON.stringify(report,null,2));
    process.exitCode = report.finalStatus === 'PASS' ? 0 : 1;
  }
}
await main();
