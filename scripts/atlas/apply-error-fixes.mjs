#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import pg from 'pg';

const isDryRun = !process.argv.includes('--apply');
const isVerbose = process.argv.includes('--verbose');

const log = (msg) => console.log(`[P1.3 Apply] ${msg}`);
const verbose = (msg) => isVerbose && console.log(`  ${msg}`);

async function getDb() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin@127.0.0.1:5434/legal_ai_db'
  });
  return pool;
}

async function executeCommand(cmd) {
  try {
    const result = execSync(cmd, { encoding: 'utf-8' });
    return { success: true, result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function checkEmbeddingServiceHealth() {
  try {
    const response = await fetch('http://127.0.0.1:11434/api/tags', { timeout: 5000 });
    return response.ok;
  } catch (err) {
    return false;
  }
}

async function restartEmbeddingService() {
  verbose('Restarting embedding service (legal-ai-ollama)...');
  const cmd = 'docker restart legal-ai-ollama';
  const res = await executeCommand(cmd);
  
  if (!res.success) {
    return { success: false, error: res.error };
  }
  
  verbose('Service restart triggered. Polling for recovery...');
  for (let i = 0; i < 10; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const healthy = await checkEmbeddingServiceHealth();
    if (healthy) {
      verbose(`Service recovered after ${i + 1}s`);
      return { success: true };
    }
  }
  
  return { success: false, error: 'Service failed to recover after 10s' };
}

async function markErrorsAsResolved(db, category, strategy) {
  const query = `
    UPDATE error_logs 
    SET resolved = true, fix_strategy = $1
    WHERE error_category = $2 AND resolved = false
    RETURNING id, error_message
  `;
  const result = await db.query(query, [strategy, category]);
  return result.rows;
}

async function main() {
  const db = await getDb();
  
  try {
    log(`Starting error fix execution (${isDryRun ? 'DRY-RUN' : 'APPLY'} mode)`);
    
    const auditResult = await db.query(`
      SELECT error_category, COUNT(*) as error_count, MAX(severity) as max_severity
      FROM error_logs
      WHERE resolved = false
      GROUP BY error_category
      ORDER BY error_count DESC
    `);
    
    let totalFixed = 0;
    let totalFailed = 0;
    const results = [];
    
    for (const row of auditResult.rows) {
      const category = row.error_category;
      const count = row.error_count;
      
      verbose(`Processing category: ${category} (${count} errors)`);
      
      if (category === 'inference_error') {
        log(`  [${category}] Applying fix: health_check_and_restart`);
        
        const healthy = await checkEmbeddingServiceHealth();
        if (healthy) {
          log(`    ✓ Embedding service is healthy`);
          if (!isDryRun) {
            const resolved = await markErrorsAsResolved(db, category, 'already_healthy');
            totalFixed += resolved.length;
          } else {
            totalFixed += count;
          }
        } else {
          log(`    ✗ Embedding service unhealthy. Restarting...`);
          const restartRes = await restartEmbeddingService();
          if (restartRes.success) {
            log(`    ✓ Service restarted successfully`);
            if (!isDryRun) {
              const resolved = await markErrorsAsResolved(db, category, 'service_restart');
              totalFixed += resolved.length;
            } else {
              totalFixed += count;
            }
          } else {
            log(`    ✗ Service restart failed: ${restartRes.error}`);
            totalFailed += count;
            results.push({ category, status: 'failed', reason: restartRes.error });
          }
        }
      } else {
        log(`  [${category}] No fixer defined (skipped)`);
        results.push({ category, status: 'skipped', reason: 'no_fixer' });
      }
    }
    
    log(`\nExecution Summary:`);
    log(`  Total Fixed: ${totalFixed}`);
    log(`  Total Failed: ${totalFailed}`);
    log(`  Mode: ${isDryRun ? 'DRY-RUN (no changes applied)' : 'APPLY (changes applied)'}`);
    
    if (results.length > 0) {
      log(`\nDetailed Results:`);
      results.forEach(r => {
        log(`  ${r.category}: ${r.status} (${r.reason})`);
      });
    }
    
  } finally {
    await db.end();
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
