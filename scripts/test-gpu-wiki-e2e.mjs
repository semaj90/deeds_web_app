#!/usr/bin/env node

/**
 * End-to-End Test for GPU Semantic Wiki
 * Tests: Page access, indexing job creation, job status, semantic search
 */

import http from 'http';

const API_BASE = process.env.PUBLIC_API_URL || 'http://localhost:5173';
const [, , hostname, port] = new URL(API_BASE).hostname === 'localhost'
  ? [null, null, 'localhost', '5173']
  : [null, null, new URL(API_BASE).hostname, new URL(API_BASE).port];

console.log('🧪 GPU Semantic Wiki End-to-End Test\n');

// ─────────────────────────────────────────────────────────────────────
// Test 1: Check Page Accessibility
// ─────────────────────────────────────────────────────────────────────

async function testPageAccess() {
  console.log('[1/4] Testing page accessibility...');

  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      port,
      path: '/codebase-wiki',
      method: 'GET',
      headers: { 'Accept': 'text/html' }
    };

    const req = http.request(options, (res) => {
      if (res.statusCode === 200) {
        console.log(`  ✅ /codebase-wiki responds with status ${res.statusCode}`);
        resolve(true);
      } else {
        console.log(`  ⚠️  /codebase-wiki status ${res.statusCode}`);
        resolve(false);
      }
    });

    req.on('error', (e) => {
      console.error(`  ❌ Page not accessible: ${e.message}`);
      reject(e);
    });

    req.end();
  });
}

// ─────────────────────────────────────────────────────────────────────
// Test 2: Start Indexing Job
// ─────────────────────────────────────────────────────────────────────

async function startIndexingJob() {
  console.log('\n[2/4] Starting indexing job...');

  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      patterns: ['sveltekit-frontend/src/lib/components/ui/*.svelte'],
      concurrency: 2,
      batchSize: 16
    });

    const options = {
      hostname,
      port,
      path: '/api/codebase/wiki/index',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.success) {
            console.log(`  ✅ Indexing job started: ${result.jobId}`);
            console.log(`  📊 Files to process: ${result.totalFiles || 0}`);
            console.log(`  📊 Chunks queued: ${result.totalChunks || 0}`);
            resolve(result.jobId);
          } else {
            console.error(`  ❌ Failed to start job: ${result.error}`);
            resolve(null);
          }
        } catch (e) {
          console.error(`  ❌ JSON parse error: ${e.message}`);
          console.error(`  Response: ${data.substring(0, 200)}`);
          resolve(null);
        }
      });
    });

    req.on('error', (e) => {
      console.error(`  ❌ Indexing error: ${e.message}`);
      reject(e);
    });

    req.write(payload);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────────────
// Test 3: Check Job Status
// ─────────────────────────────────────────────────────────────────────

async function checkJobStatus(jobId) {
  console.log('\n[3/4] Checking job status...');

  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      port,
      path: `/api/codebase/wiki/index?jobId=${jobId}`,
      method: 'GET'
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.success && result.job) {
            console.log(`  ✅ Job status: ${result.job.status}`);
            console.log(`  📊 Progress: ${result.job.processed_files || 0}/${result.job.total_files || 0} files`);
            console.log(`  ⏱️  Started: ${result.job.started_at}`);
            resolve(result.job);
          } else {
            console.error(`  ❌ Status check failed: ${result.error}`);
            resolve(null);
          }
        } catch (e) {
          console.error(`  ❌ JSON parse error: ${e.message}`);
          resolve(null);
        }
      });
    });

    req.on('error', (e) => {
      console.error(`  ❌ Status check error: ${e.message}`);
      reject(e);
    });

    req.end();
  });
}

// ─────────────────────────────────────────────────────────────────────
// Test 4: Semantic Search
// ─────────────────────────────────────────────────────────────────────

async function performSearch() {
  console.log('\n[4/4] Testing semantic search...');

  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      query: 'button component with click handler',
      limit: 5,
      domain: null
    });

    const options = {
      hostname,
      port,
      path: '/api/codebase/wiki',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          console.log(`  ✅ Search completed`);
          console.log(`  📊 Results: ${result.results?.length || 0} matches`);

          if (result.results && result.results.length > 0) {
            console.log(`  🎯 Top match: ${result.results[0].file_path}`);
            console.log(`  📏 Similarity: ${result.results[0].similarity?.toFixed(4) || 'N/A'}`);

            console.log('\n  Top 3 Results:');
            result.results.slice(0, 3).forEach((r, i) => {
              console.log(`    ${i + 1}. ${r.file_path}`);
              console.log(`       Similarity: ${r.similarity?.toFixed(4)}, Domain: ${r.domain || 'unknown'}`);
            });
          } else if (result.error) {
            console.log(`  ⚠️  ${result.error}`);
          }

          resolve(result);
        } catch (e) {
          console.error(`  ❌ JSON parse error: ${e.message}`);
          console.error(`  Response: ${data.substring(0, 200)}`);
          resolve(null);
        }
      });
    });

    req.on('error', (e) => {
      console.error(`  ❌ Search error: ${e.message}`);
      reject(e);
    });

    req.write(payload);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────────────
// Run All Tests
// ─────────────────────────────────────────────────────────────────────

async function runTests() {
  try {
    // Test 1
    await testPageAccess();

    // Test 2
    const jobId = await startIndexingJob();

    if (!jobId) {
      console.log('\n⚠️  Skipping remaining tests (no job ID)');
      console.log('\nTroubleshooting:');
      console.log('  1. Check if Ollama is running: curl http://localhost:11434/api/tags');
      console.log('  2. Verify database tables exist: psql -c "\\dt codebase*"');
      console.log('  3. Check server logs for errors\n');
      return;
    }

    // Test 3 (after brief delay)
    await new Promise(r => setTimeout(r, 2000));
    const job = await checkJobStatus(jobId);

    // Test 4 (after brief delay)
    await new Promise(r => setTimeout(r, 3000));
    await performSearch();

    console.log('\n✅ End-to-end test complete!\n');
    console.log('Next steps:');
    console.log('  1. Navigate to: http://localhost:5173/codebase-wiki');
    console.log('  2. Monitor worker logs in terminal');
    console.log('  3. Try manual search queries');
    console.log('  4. Check GPU utilization: nvidia-smi\n');

  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    console.log('\nMake sure dev server is running: npm run dev\n');
    process.exit(1);
  }
}

runTests();
