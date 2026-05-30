#!/usr/bin/env node
import { execSync } from 'node:child_process';
import fetch from 'node-fetch';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const COUCHDB_URL = process.env.COUCHDB_URL || 'http://localhost:5984';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

function checkDocker() {
  try {
    const out = execSync('docker ps --format "{{.Names}}\t{{.Image}}\t{{.Status}}"', { timeout: 2000 }).toString();
    return { ok: true, info: out.split('\n').filter(Boolean).slice(0,10) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function checkCouch() {
  try {
    const res = await fetch(COUCHDB_URL + '/');
    const ok = res.ok;
    const txt = await res.text();
    return { ok, text: txt.slice(0,200) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function checkCSVs() {
  const nodes = fs.existsSync(path.join(ROOT, '.tmp', 'nodes.csv'));
  const tasks = fs.existsSync(path.join(ROOT, '.tmp', 'tasks.csv'));
  const fixes = fs.existsSync(path.join(ROOT, '.tmp', 'fixes.csv'));
  return { nodes, tasks, fixes };
}

async function checkRedis() {
  try {
    const IORedis = await import('ioredis');
    const client = new IORedis.default(REDIS_URL);
    await client.ping();
    await client.quit();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function main(){
  console.log('Infra check — Docker / CouchDB / Redis / CSVs');
  console.log('\nDocker:');
  const d = checkDocker();
  if (d.ok) console.log('  docker ps ok — sample:', d.info.slice(0,5)); else console.log('  docker not available:', d.error);

  console.log('\nCouchDB:');
  const c = await checkCouch();
  console.log('  couchdb ok:', c.ok, c.error ? c.error : c.text);

  console.log('\nRedis:');
  const r = await checkRedis();
  console.log('  redis ok:', r.ok, r.error ? r.error : 'reachable');

  console.log('\nCSV files:');
  const csv = checkCSVs();
  console.log(`  nodes.csv: ${csv.nodes}, tasks.csv: ${csv.tasks}, fixes.csv: ${csv.fixes}`);

  process.exit(0);
}

main().catch(e=>{ console.error(e.message); process.exit(1); });
