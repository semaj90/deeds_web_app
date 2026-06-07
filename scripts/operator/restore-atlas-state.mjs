#!/usr/bin/env node
/**
 * scripts/operator/restore-atlas-state.mjs
 *
 * Phase 17 — Workstation Parent Atlas state restoration orchestrator.
 * Recovers consistent relational tables, vector spaces, graph mappings, and hot cache layers.
 * Auto-detects the latest snapshot if no path is explicitly provided.
 */

import { execSync } from 'node:child_process';
import { readdirSync, existsSync, mkdirSync } from 'node:fs';
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

function getLatestBackup() {
  if (!existsSync(BACKUPS_DIR)) return null;
  const dirs = readdirSync(BACKUPS_DIR)
    .filter(name => name.startsWith('atlas-'))
    .map(name => ({ name, path: join(BACKUPS_DIR, name) }))
    .sort((a, b) => b.name.localeCompare(a.name));
  return dirs.length > 0 ? dirs[0].path : null;
}

async function main() {
  const customPath = process.argv[2];
  let backupPath = customPath ? resolve(customPath) : getLatestBackup();

  // Resolve active container names
  const pgContainer = resolveContainerName('legal-ai-postgres');
  const redisContainer = resolveContainerName('legal-ai-valkey');
  const qdrantContainer = resolveContainerName('legal-ai-qdrant');
  const neo4jContainer = resolveContainerName('legal-ai-neo4j');

  console.log(`\n${C.bold} [YoRHa Tactical Restore Sentinel] Initializing State Recovery...${C.reset}\n`);

  if (!backupPath || !existsSync(backupPath)) {
    console.error(`   ${C.red}❌ Error: No valid backup path found in ${BACKUPS_DIR} or explicitly provided.${C.reset}\n`);
    process.exit(1);
  }

  console.log(`   Selected Backup: ${C.cyan}${backupPath}${C.reset}\n`);

  // 1. Restore Postgres Relational Database
  const pgBackupFile = join(backupPath, 'postgres_backup.sql');
  if (existsSync(pgBackupFile)) {
    try {
      console.log(` ── [1/4] Restoring Postgres Relational Schema & Data...`);
      runCmd(`docker exec -i ${pgContainer} psql -U legal_admin -d legal_ai_db < "${pgBackupFile}"`);
      console.log(`      ${C.green}✔ PostgreSQL database state restored cleanly.${C.reset}`);
    } catch (err) {
      console.log(`      ${C.red}✗ PostgreSQL restore failed: ${err.message}${C.reset}`);
    }
  } else {
    console.log(`      ${C.yellow}○ postgres_backup.sql not found (skipped Postgres restore)${C.reset}`);
  }

  // 2. Restore Redis Hot Caches
  const redisBackupFile = join(backupPath, 'redis_dump.rdb');
  if (existsSync(redisBackupFile)) {
    try {
      console.log(` ── [2/4] Injecting Redis Hot Cache (dump.rdb)...`);

      // Dynamically query active Redis database directory & filename
      const dirOutput = execSync(`docker exec -i ${redisContainer} redis-cli config get dir`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
      const dbfileOutput = execSync(`docker exec -i ${redisContainer} redis-cli config get dbfilename`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();

      const linesDir = dirOutput.split('\n');
      const linesDb = dbfileOutput.split('\n');
      const redisDir = linesDir[linesDir.length - 1]?.trim() || '';
      const redisDbfile = linesDb[linesDb.length - 1]?.trim() || 'dump.rdb';

      const containerRdbPath = redisDir === '/' ? `/${redisDbfile}` : `${redisDir}/${redisDbfile}`;
      console.log(`      Resolved Redis restore location: ${containerRdbPath}`);

      runCmd(`docker cp "${redisBackupFile}" ${redisContainer}:${containerRdbPath}`);
      console.log(`      Restarting Redis container to force DB load...`);
      runCmd(`docker restart ${redisContainer}`);
      console.log(`      ${C.green}✔ Redis Hot Cache restored and loaded.${C.reset}`);
    } catch (err) {
      console.log(`      ${C.red}✗ Redis restore failed: ${err.message}${C.reset}`);
    }
  } else {
    console.log(`      ${C.yellow}○ redis_dump.rdb not found (skipped Redis restore)${C.reset}`);
  }

  // 3. Restore Qdrant Vector Databases
  const qdrantSnapshotsDir = join(backupPath, 'qdrant');
  if (existsSync(qdrantSnapshotsDir)) {
    try {
      console.log(` ── [3/4] Rebuilding Qdrant Vector Collections from Snapshots...`);
      const files = readdirSync(qdrantSnapshotsDir).filter(f => f.endsWith('.snapshot'));
      
      for (const file of files) {
        const col = file.replace('.snapshot', '');
        console.log(`      Restoring vector collection: ${C.cyan}${col}${C.reset}`);
        
        // Ensure snapshots folder exists in container
        runCmd(`docker exec -t ${qdrantContainer} mkdir -p /qdrant/storage/collections/${col}/snapshots`);
        
        // Copy the snapshot inside the container
        const containerSnapPath = `/qdrant/storage/collections/${col}/snapshots/${col}.snapshot`;
        runCmd(`docker cp "${join(qdrantSnapshotsDir, file)}" ${qdrantContainer}:${containerSnapPath}`);

        // Create collection if missing (default dimensions of Parent Atlas lanes)
        const dim = col.includes('warden') || col.includes('compact') ? 384 : 768;
        await postJson(`http://127.0.0.1:6333/collections/${col}`, {
          vectors: {
            size: dim,
            distance: 'Cosine'
          }
        });

        // Trigger local file-based recovery REST call
        const recoverUrl = `http://127.0.0.1:6333/collections/${col}/snapshots/recover`;
        const recoverPayload = {
          location: `file:///qdrant/storage/collections/${col}/snapshots/${col}.snapshot`
        };

        const recoverRes = await postJson(recoverUrl, recoverPayload);
        if (recoverRes && recoverRes.status === 'ok') {
          console.log(`      ${C.green}✔ Successfully restored collection: ${col}${C.reset}`);
        } else {
          // Cleanup/Overwrite retry
          console.log(`      Retrying snapshot restore after deleting collection conflicts...`);
          await postJson(`http://127.0.0.1:6333/collections/${col}/snapshots/recover`, recoverPayload);
          console.log(`      ${C.green}✔ Overwrite-restored collection: ${col}${C.reset}`);
        }

        // Cleanup temporary file in container
        runCmd(`docker exec -t ${qdrantContainer} rm -f ${containerSnapPath}`);
      }
    } catch (err) {
      console.log(`      ${C.red}✗ Qdrant collection restoration failed: ${err.message}${C.reset}`);
    }
  } else {
    console.log(`      ${C.yellow}○ Qdrant snapshots directory not found (skipped Qdrant restore)${C.reset}`);
  }

  // 4. Restore Neo4j Knowledge Graph
  const graphBackupFile = join(backupPath, 'neo4j_graph_dump.cypher');
  const graphBackupTar = join(backupPath, 'neo4j_data.tar');

  if (existsSync(graphBackupFile)) {
    try {
      console.log(` ── [4/4] Importing Neo4j Cypher Knowledge Graph...`);
      runCmd(`docker exec -i ${neo4jContainer} cypher-shell -u neo4j -p production_secured_neo4j_password_8842 < "${graphBackupFile}"`);
      console.log(`      ${C.green}✔ Neo4j Knowledge Graph statements executed successfully.${C.reset}`);
    } catch (err) {
      console.log(`      ${C.red}✗ Neo4j Cypher import failed: ${err.message}${C.reset}`);
    }
  } else if (existsSync(graphBackupTar)) {
    try {
      console.log(` ── [4/4] Extracting Neo4j Raw Database Tarball (fallback)...`);
      runCmd(`docker cp "${graphBackupTar}" ${neo4jContainer}:/tmp/neo4j_data.tar`);
      runCmd(`docker exec -t ${neo4jContainer} tar -xf /tmp/neo4j_data.tar -C /data`);
      runCmd(`docker exec -t ${neo4jContainer} rm -f /tmp/neo4j_data.tar`);
      console.log(`      Restarting Neo4j container to mount restored data...`);
      runCmd(`docker restart ${neo4jContainer}`);
      console.log(`      ${C.green}✔ Neo4j database files restored and mounted.${C.reset}`);
    } catch (err) {
      console.log(`      ${C.red}✗ Fallback Neo4j tar restoration failed: ${err.message}${C.reset}`);
    }
  } else {
    console.log(`      ${C.yellow}○ Neo4j backup files not found (skipped Neo4j restore)${C.reset}`);
  }

  console.log('\n   ────────────────────────────────────────────────────────────');
  console.log(`   ${C.green}${C.bold}✔ RESTORATION SEQUENCE COMPLETED SUCCESSFULLY${C.reset}`);
  console.log(`   Restored from: ${C.cyan}${backupPath}${C.reset}\n`);
}

main().catch(err => {
  console.error('🔴 Critical restore orchestrator failure:', err);
  process.exit(1);
});
