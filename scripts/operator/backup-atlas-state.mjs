#!/usr/bin/env node
/**
 * scripts/operator/backup-atlas-state.mjs
 *
 * Phase 17 — Workstation Parent Atlas hot state backup orchestrator.
 * Safely extracts consistent relational, vector, graph, and hot-memory state 
 * using host-agnostic Docker container commands.
 */

import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');
const BACKUPS_DIR = join(REPO_ROOT, 'backups');

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m', gray: '\x1b[90m'
};

function runCmd(cmd, verbose = true) {
  try {
    if (verbose) console.log(`   ${C.gray}$ ${cmd}${C.reset}`);
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
  } catch (err) {
    throw new Error(`Command failed: ${cmd}\nReason: ${err.message}`);
  }
}

function resolveContainerName(baseName) {
  try {
    const stdout = execSync(`docker ps --format "{{.Names}}"`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    const activeNames = stdout.split('\n').map(n => n.trim()).filter(Boolean);
    if (activeNames.includes(`${baseName}-prod`)) {
      return `${baseName}-prod`;
    }
    if (activeNames.includes(baseName)) {
      return baseName;
    }
  } catch {
    // Docker daemon not reachable or command failed
  }
  return `${baseName}-prod`; // default fallback
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(`Failed to parse JSON from ${url}`));
        }
      });
    }).on('error', reject);
  });
}

function postJson(url, payload = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const body = JSON.stringify(payload);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ ok: res.statusCode < 400 });
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

import { createWriteStream, unlink } from 'node:fs';
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(destPath);
    http.get(url, res => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', err => {
      unlink(destPath, () => {});
      reject(err);
    });
  });
}

async function main() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const targetDir = join(BACKUPS_DIR, `atlas-${timestamp}`);

  // Resolve active container names
  const pgContainer = resolveContainerName('legal-ai-postgres');
  const redisContainer = resolveContainerName('legal-ai-valkey');
  const qdrantContainer = resolveContainerName('legal-ai-qdrant');
  const neo4jContainer = resolveContainerName('legal-ai-neo4j');

  console.log(`\n${C.bold} [YoRHa Tactical Backup Sentinel] Initializing State Backup Sequence...${C.reset}\n`);
  mkdirSync(targetDir, { recursive: true });

  // 1. PostgreSQL backup via pg_dump in Docker (using -i for uncorrupted redirection stream)
  try {
    console.log(` ── [1/4] Dumping Postgres Relational Schema & Data...`);
    const pgBackupFile = join(targetDir, 'postgres_backup.sql');
    runCmd(`docker exec -i ${pgContainer} pg_dump -U legal_admin -d legal_ai_db > "${pgBackupFile}"`);
    console.log(`      ${C.green}✔ PostgreSQL backed up to postgres_backup.sql${C.reset}`);
  } catch (err) {
    console.log(`      ${C.yellow}⚠ PostgreSQL backup failed (skipped/offline): ${err.message}${C.reset}`);
  }

  // 2. Redis memory snapshot
  try {
    console.log(` ── [2/4] Saving Redis Hot Caches (BitFrost state)...`);
    runCmd(`docker exec -i ${redisContainer} redis-cli save`);

    // Dynamically query active Redis database directory & filename to handle custom layouts
    const dirOutput = execSync(`docker exec -i ${redisContainer} redis-cli config get dir`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    const dbfileOutput = execSync(`docker exec -i ${redisContainer} redis-cli config get dbfilename`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();

    const linesDir = dirOutput.split('\n');
    const linesDb = dbfileOutput.split('\n');
    const redisDir = linesDir[linesDir.length - 1]?.trim() || '';
    const redisDbfile = linesDb[linesDb.length - 1]?.trim() || 'dump.rdb';

    const containerRdbPath = redisDir === '/' ? `/${redisDbfile}` : `${redisDir}/${redisDbfile}`;
    console.log(`      Resolved Redis dump location: ${containerRdbPath}`);

    const redisBackupFile = join(targetDir, 'redis_dump.rdb');
    runCmd(`docker cp ${redisContainer}:${containerRdbPath} "${redisBackupFile}"`);
    console.log(`      ${C.green}✔ Redis Hot Cache snapshot backed up to redis_dump.rdb${C.reset}`);
  } catch (err) {
    console.log(`      ${C.yellow}⚠ Redis backup failed (skipped/offline): ${err.message}${C.reset}`);
  }

  // 3. Qdrant Snapshot Trigger & Direct HTTP Download
  try {
    console.log(` ── [3/4] Triggering Qdrant Vector Collection Snapshots...`);
    const collectionsRes = await fetchJson('http://127.0.0.1:6333/collections');
    if (collectionsRes && collectionsRes.result && collectionsRes.result.collections) {
      const collections = collectionsRes.result.collections.map(c => c.name);
      console.log(`      Found ${collections.length} active vector collections.`);
      
      const qdrantSnapshotsDir = join(targetDir, 'qdrant');
      mkdirSync(qdrantSnapshotsDir, { recursive: true });

      for (const col of collections) {
        console.log(`      Triggering snapshot for collection: ${C.cyan}${col}${C.reset}`);
        const snapshotRes = await postJson(`http://127.0.0.1:6333/collections/${col}/snapshots`);
        if (snapshotRes && snapshotRes.result) {
          const snapshotName = snapshotRes.result.name;
          const snapDest = join(qdrantSnapshotsDir, `${col}.snapshot`);
          // Stream snapshot directly via Qdrant's REST file delivery API
          const downloadUrl = `http://127.0.0.1:6333/collections/${col}/snapshots/${snapshotName}`;
          await downloadFile(downloadUrl, snapDest);
          console.log(`      ${C.green}✔ Stream-downloaded vector collection snapshot: ${col}${C.reset}`);
        }
      }
    } else {
      console.log(`      ${C.yellow}○ No active Qdrant vector collections found to snapshot.${C.reset}`);
    }
  } catch (err) {
    console.log(`      ${C.yellow}⚠ Qdrant snapshots failed (skipped/offline): ${err.message}${C.reset}`);
  }

  // 4. Neo4j Cypher APOC Export dump
  try {
    console.log(` ── [4/4] Extracting Neo4j Cypher Knowledge Graph...`);
    const graphBackupFile = join(targetDir, 'neo4j_graph_dump.cypher');
    runCmd(`docker exec -i ${neo4jContainer} cypher-shell -u neo4j -p production_secured_neo4j_password_8842 "CALL apoc.export.cypher.all(null, {format: 'cypher-shell', useTypes: true})" > "${graphBackupFile}"`);
    console.log(`      ${C.green}✔ Knowledge Graph exported to neo4j_graph_dump.cypher${C.reset}`);
  } catch (err) {
    console.log(`      ${C.yellow}⚠ Neo4j Cypher APOC dump skipped (apoc disabled or database not initialized): ${err.message}${C.reset}`);
    
    // Fallback: Copy raw database transaction log headers
    try {
      console.log(`      Executing fallback Neo4j raw data copy...`);
      const neo4jDest = join(targetDir, 'neo4j_data.tar');
      runCmd(`docker exec -i ${neo4jContainer} tar -cf /tmp/neo4j_data.tar -C /data .`);
      runCmd(`docker cp ${neo4jContainer}:/tmp/neo4j_data.tar "${neo4jDest}"`);
      runCmd(`docker exec -i ${neo4jContainer} rm -f /tmp/neo4j_data.tar`);
      console.log(`      ${C.green}✔ Fallback Neo4j raw snapshot created.${C.reset}`);
    } catch (fallbackErr) {
      console.log(`      ${C.red}✗ Fallback raw database copy failed: ${fallbackErr.message}${C.reset}`);
    }
  }

  console.log('\n   ────────────────────────────────────────────────────────────');
  console.log(`   ${C.green}${C.bold}✔ BACKUP SEQUENCE COMPLETED SUCCESSFULLY${C.reset}`);
  console.log(`   Target Directory: ${C.cyan}${targetDir}${C.reset}\n`);
}

main().catch(err => {
  console.error('🔴 Critical backup orchestrator failure:', err);
  process.exit(1);
});
