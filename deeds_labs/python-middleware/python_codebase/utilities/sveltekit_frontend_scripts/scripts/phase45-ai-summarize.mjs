#!/usr/bin/env node
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const DIM = 64;

function hashToVector(text, dim = DIM) {
  const hash = crypto.createHash('sha512').update(text).digest(); // 64 bytes
  const floats = [];
  for (let i = 0; i < dim; i++) {
    // take two bytes at a time to make a 16-bit number, normalize
    const hi = hash[(i * 2) % hash.length];
    const lo = hash[(i * 2 + 1) % hash.length];
    const val = (hi << 8) + lo;
    floats.push((val / 0xffff) * 2 - 1); // normalize to [-1,1]
  }
  return floats;
}

async function ensureQdrantCollection(baseUrl, coll, dim) {
  const base = baseUrl.replace(/\/+$/, '');
  const target = `${base}/collections/${coll}`;

  // Try PUT first (current Qdrant versions)
  const createPayload = {
    vectors: { size: dim, distance: 'Cosine' }
  };

  const putResp = await fetch(target, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(createPayload)
  });

  if (putResp.ok || putResp.status === 409) {
    return true;
  }

  // Some older versions require explicit name via POST
  const altResp = await fetch(`${base}/collections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: coll, ...createPayload })
  });

  return altResp.ok || altResp.status === 409;
}

async function tryQdrantUpsert(points, qdrantUrl) {
  try {
    const coll = 'phase44_fingerprints';
    const base = qdrantUrl.replace(/\/+$/, '');
    // ensure collection exists (best-effort)
    await ensureQdrantCollection(base, coll, DIM);
    // upsert points
    const upsertUrl = `${base}/collections/${coll}/points?wait=true`;
    const body = { points };
    const up = await fetch(upsertUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return up.ok;
  } catch (e) {
    return false;
  }
}

function humanSummary(stats) {
  const parts = [];
  parts.push(`Phase 44 Summary — ${stats.timestamp || new Date().toISOString()}`);
  parts.push(`Total files scanned: ${stats.totalFiles}`);
  parts.push(`Files repaired (this run): ${stats.filesRepaired}`);
  parts.push(`Files skipped: ${stats.filesSkipped}`);
  parts.push(`Total issues fixed: ${stats.totalIssuesFixed}`);
  parts.push('Issue breakdown:');
  for (const [k,v] of Object.entries(stats.issues || {})) parts.push(`  - ${k}: ${v}`);

  // top files by issuesFixed
  const top = (stats.files || []).slice().sort((a,b)=> (b.issuesFixed||0)-(a.issuesFixed||0)).slice(0,10);
  parts.push('Top files by issues fixed:');
  top.forEach(f=> parts.push(`  - ${f.file}: ${f.issuesFixed} fixes`));
  return parts.join('\n');
}

async function main() {
  const arg = process.argv[2] || 'analysis/phase44-error-summary.json';
  const inputPath = path.resolve(arg);
  if (!fs.existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    process.exit(2);
  }

  const raw = JSON.parse(fs.readFileSync(inputPath,'utf8'));

  const summary = humanSummary(raw);
  const outDir = path.resolve('analysis');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir,{recursive:true});
  const outPath = path.join(outDir,'phase45-ai-summary.txt');
  fs.writeFileSync(outPath, summary, 'utf8');
  console.log('Wrote summary to', outPath);

  // generate fingerprints
  const points = [];
  let idCounter = 1;
  for (const f of raw.files || []) {
    const text = `${f.file} ${(f.issues||[]).join(' ')} ${f.issuesFixed || 0}`;
    const vector = hashToVector(text, DIM);
    const payload = { file: f.file, issuesFixed: f.issuesFixed, issues: f.issues };
    points.push({ id: idCounter++, vector, payload });
  }

  const logsDir = path.resolve('logs');
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir,{recursive:true});
  fs.writeFileSync(path.join(logsDir,'phase45-points.json'), JSON.stringify(points, null, 2));
  console.log('Saved', points.length, 'fingerprints to logs/phase45-points.json');

  const qdrantUrl = process.env.QDRANT_URL || process.env.QDRANT || 'http://localhost:6333';
  const qdrantOk = await tryQdrantUpsert(points, qdrantUrl).catch(()=>false);
  if (qdrantOk) console.log('Upserted fingerprints to Qdrant at', qdrantUrl);
  else console.log('Qdrant upsert failed or Qdrant not reachable at', qdrantUrl, '\nSaved points locally instead.');

  // fallback: write a compact JSON summary for dashboard ingestion
  const dashPath = path.join(outDir,'phase45-dashboard-payload.json');
  const dashPayload = { summary: summary.split('\n'), topFiles: (raw.files||[]).slice(0,50), timestamp: new Date().toISOString() };
  fs.writeFileSync(dashPath, JSON.stringify(dashPayload,null,2));
  console.log('Wrote dashboard payload to', dashPath);

  console.log('\n=== SUMMARY ===\n');
  console.log(summary);
}

main().catch(err=>{ console.error(err); process.exit(1); });
