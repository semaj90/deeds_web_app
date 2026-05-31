#!/usr/bin/env node
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const outPath = path.join(ROOT, '.tmp', 'atlas-gate4-live-checks.json');

function save(part) {
  let existing = {};
  try { existing = JSON.parse(fs.readFileSync(outPath, 'utf8')); } catch(e) {}
  existing.results = Object.assign(existing.results||{}, part);
  existing.timestamp = new Date().toISOString();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(existing, null, 2));
}

const res = {};

// Postgres
if (process.env.DATABASE_URL) {
  try {
    const p = spawnSync('psql', [process.env.DATABASE_URL, '-t', '-c', 'SELECT count(*) FROM parent_atlas_records;'], { encoding: 'utf8', timeout: 120000 });
    if (p.status === 0) {
      res.parent_atlas_records_count = p.stdout.trim();
    } else {
      res.parent_atlas_records_error = p.stderr || p.stdout;
    }
    const p2 = spawnSync('psql', [process.env.DATABASE_URL, '-t', '-c', 'SELECT count(*) FROM parent_atlas_vectors;'], { encoding: 'utf8', timeout: 120000 });
    if (p2.status === 0) {
      res.parent_atlas_vectors_count = p2.stdout.trim();
    } else {
      res.parent_atlas_vectors_error = p2.stderr || p2.stdout;
    }
  } catch (e) {
    res.postgres_exception = String(e);
  }
} else {
  res.postgres = 'DATABASE_URL not set';
}

// Redis
if (process.env.REDIS_URL) {
  try {
    const r = spawnSync('redis-cli', ['-u', process.env.REDIS_URL, 'DBSIZE'], { encoding: 'utf8', timeout: 60000 });
    if (r.status === 0) res.redis_dbsize = r.stdout.trim(); else res.redis_error = r.stderr || r.stdout;
  } catch (e) { res.redis_exception = String(e); }
} else if (process.env.REDIS_PASSWORD) {
  try {
    const r = spawnSync('redis-cli', ['-a', process.env.REDIS_PASSWORD, 'DBSIZE'], { encoding: 'utf8', timeout: 60000 });
    if (r.status === 0) res.redis_dbsize = r.stdout.trim(); else res.redis_error = r.stderr || r.stdout;
  } catch (e) { res.redis_exception = String(e); }
} else {
  res.redis = 'No REDIS_URL or REDIS_PASSWORD in env';
}

// Neo4j
if (process.env.NEO4J_USER && process.env.NEO4J_PASS) {
  try {
    const u = process.env.NEO4J_URI || 'http://localhost:7474';
    const c = spawnSync('curl', ['-s', '-u', `${process.env.NEO4J_USER}:${process.env.NEO4J_PASS}`, `${u}/db/data/`], { encoding: 'utf8', timeout: 60000 });
    if (c.status === 0) res.neo4j = (c.stdout||'').slice(0,2000); else res.neo4j_error = c.stderr || c.stdout;
  } catch (e) { res.neo4j_exception = String(e); }
} else {
  res.neo4j = 'NEO4J_USER/NEO4J_PASS not set';
}

console.log('Auth probes result:', JSON.stringify(res, null, 2));
save(res);
