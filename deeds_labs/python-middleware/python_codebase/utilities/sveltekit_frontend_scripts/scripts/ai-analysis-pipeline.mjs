#!/usr/bin/env node
/**
 * AI Analysis Pipeline - Post Fix
 * --------------------------------
 * Runs complete AI analysis after fix-any-types.mjs
 * 
 * Steps:
 * 1. Generate svelte-check log
 * 2. Categorize errors into JSON
 * 3. Generate AI embeddings (uses Go RAG + Ollama)
 * 4. Cluster on GPU (Python + CUDA)
 * 5. Generate fix recommendations
 * 
 * Usage:
 *   node scripts/ai-analysis-pipeline.mjs
 */

import { spawn } from 'child_process';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';

const config = {
  logsDir: 'logs',
  svelteCheckLog: 'logs/post-fix-svelte-check.log',
  categorizedJson: 'logs/post-fix-categorized.json',
  aiSummary: 'phase43-ai-summary.json',
  clusterOutput: 'phase44-clusters.json',
  
  // Service URLs (from .env)
  qdrantUrl: process.env.QDRANT_URL || 'http://localhost:6333',
  goRagUrl: process.env.GO_RAG_URL || 'http://localhost:8095',
  ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379'
};

// Ensure logs directory exists
if (!existsSync(config.logsDir)) {
  mkdirSync(config.logsDir, { recursive: true });
}

function runCommand(command, args, description) {
  return new Promise((resolve, reject) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📌 ${description}`);
    console.log(`${'='.repeat(60)}\n`);
    console.log(`Running: ${command} ${args.join(' ')}\n`);
    
    const proc = spawn(command, args, {
      stdio: 'inherit',
      shell: true
    });
    
    proc.on('close', (code) => {
      if (code === 0) {
        console.log(`\n✅ ${description} - Complete\n`);
        resolve();
      } else {
        console.log(`\n⚠️  ${description} - Exited with code ${code}\n`);
        // Don't reject, continue pipeline
        resolve();
      }
    });
    
    proc.on('error', (err) => {
      console.error(`\n❌ ${description} - Error:`, err.message);
      resolve(); // Continue anyway
    });
  });
}

async function checkServices() {
  console.log('🔍 Checking service availability...\n');
  
  const services = [
    { name: 'Qdrant', url: `${config.qdrantUrl}/health` },
    { name: 'Go RAG', url: `${config.goRagUrl}/health` },
    { name: 'Ollama', url: `${config.ollamaUrl}/api/tags` }
  ];
  
  for (const service of services) {
    try {
      const response = await fetch(service.url, {
        signal: AbortSignal.timeout(3000)
      });
      console.log(`  ${response.ok ? '✅' : '⚠️'} ${service.name}: ${response.ok ? 'Healthy' : 'Unhealthy'}`);
    } catch (error) {
      console.log(`  ❌ ${service.name}: Offline`);
    }
  }
  
  console.log('');
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  AI Analysis Pipeline - Post Fix                         ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');
  
  const startTime = Date.now();
  
  // Check services
  await checkServices();
  
  // Step 1: Generate svelte-check log
  console.log('📊 Step 1/4: Generating svelte-check error log...');
  console.log('   This may take 5-10 minutes...\n');
  
  if (!existsSync(config.svelteCheckLog)) {
    await runCommand(
      'npx',
      ['svelte-check', '--output', 'machine', '--threshold', 'warning'],
      'Generate svelte-check log'
    ).catch(() => {
      // svelte-check exits with error code when errors found
      console.log('Note: svelte-check found errors (expected)');
    });
  } else {
    console.log(`   ✅ Log already exists: ${config.svelteCheckLog}\n`);
  }
  
  // Step 2: Categorize errors
  console.log('📊 Step 2/4: Categorizing errors into JSON...\n');
  
  await runCommand(
    'node',
    [
      'scripts/categorize-svelte-check-log.mjs',
      '--log', config.svelteCheckLog,
      '--limit', '10000',
      '--json',
      '--output', config.categorizedJson
    ],
    'Categorize errors'
  );
  
  // Step 3: Generate AI embeddings
  console.log('📊 Step 3/4: Generating AI embeddings...');
  console.log('   Using: Ollama + Go RAG + Qdrant\n');
  
  if (existsSync(config.categorizedJson)) {
    await runCommand(
      'node',
      [
        'scripts/phase43-ai-analyzer.mjs',
        config.categorizedJson,
        '--redis-cache',
        '--gpu-enabled'
      ],
      'Generate AI embeddings'
    );
  } else {
    console.log('   ⚠️  Categorized JSON not found, skipping embeddings\n');
  }
  
  // Step 4: GPU clustering (optional - requires Python)
  console.log('📊 Step 4/4: GPU clustering (optional)...\n');
  
  try {
    await runCommand(
      'python',
      [
        'scripts/phase44-tensor-loader.py',
        '--redis-db', '2',
        '--cluster',
        '--k', '50',
        '--output', config.clusterOutput
      ],
      'GPU Clustering'
    );
  } catch (error) {
    console.log('   ⚠️  GPU clustering skipped (Python dependencies may be missing)\n');
  }
  
  // Summary
  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ AI Analysis Pipeline Complete');
  console.log('='.repeat(60) + '\n');
  
  console.log(`⏱️  Total time: ${elapsed} minutes\n`);
  
  console.log('📁 Generated files:');
  if (existsSync(config.svelteCheckLog)) {
    console.log(`   ✅ ${config.svelteCheckLog}`);
  }
  if (existsSync(config.categorizedJson)) {
    console.log(`   ✅ ${config.categorizedJson}`);
  }
  if (existsSync(config.aiSummary)) {
    console.log(`   ✅ ${config.aiSummary}`);
  }
  if (existsSync(config.clusterOutput)) {
    console.log(`   ✅ ${config.clusterOutput}`);
  }
  
  console.log('\n📊 Next steps:');
  console.log('   1. Review cluster output: cat ' + config.clusterOutput);
  console.log('   2. View AI summary: cat ' + config.aiSummary);
  console.log('   3. Run targeted fixes based on cluster patterns\n');
}

main().catch(console.error);
