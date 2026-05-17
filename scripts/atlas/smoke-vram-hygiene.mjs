#!/usr/bin/env node
/**
 * scripts/atlas/smoke-vram-hygiene.mjs
 *
 * Verifies active GPU workstation status, checks process bounds for TurboQuant,
 * checks environment vars, and validates Redis/Qdrant connectivity.
 * Outputs dynamic execution reports to docs/reports/vram-hygiene-smoke-report.{json,md}.
 */

import { execSync } from 'node:child_process';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Redis from 'ioredis';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const CODEBASE_COLLECTION = 'codebase_chunks_768';

function hasArg(arg) {
  return process.argv.includes(arg);
}

async function runSmoke() {
  console.log('⚡ Starting Workstation VRAM Hygiene & GPU Smoke Check...');
  const isDryRun = hasArg('--dry-run') || hasArg('-d');
  if (isDryRun) {
    console.log('ℹ️ Running in DRY-RUN mode. Models will not be initialized.\n');
  }

  const profile = {
    timestamp: new Date().toISOString(),
    nvidiaSmiAvailable: false,
    gpuDetected: false,
    vramTotalMb: 0,
    vramUsedMb: 0,
    vramFreeMb: 0,
    llamaServerRunning: false,
    environmentVariables: {},
    redisConnected: false,
    qdrantConnected: false,
    status: 'UNKNOWN'
  };

  // 1. Check nvidia-smi
  try {
    const stdout = execSync('nvidia-smi --query-gpu=memory.total,memory.used,memory.free --format=csv,noheader,nounits', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    const parts = stdout.trim().split(',');
    if (parts.length >= 3) {
      profile.nvidiaSmiAvailable = true;
      profile.gpuDetected = true;
      profile.vramTotalMb = parseInt(parts[0].trim(), 10);
      profile.vramUsedMb = parseInt(parts[1].trim(), 10);
      profile.vramFreeMb = parseInt(parts[2].trim(), 10);
      console.log(`✔️ GPU detected via nvidia-smi:`);
      console.log(`   - Total VRAM: ${profile.vramTotalMb} MB`);
      console.log(`   - Used VRAM:  ${profile.vramUsedMb} MB`);
      console.log(`   - Free VRAM:  ${profile.vramFreeMb} MB`);
    }
  } catch (err) {
    console.warn('⚠️ nvidia-smi not available or no NVIDIA GPU active. (Possibly running inside basic WSL2 or host fallback).');
  }

  // 2. Check process tree for llama-server.exe or llama-server
  try {
    let procOutput = '';
    if (process.platform === 'win32') {
      procOutput = execSync('tasklist /FI "IMAGENAME eq llama-server.exe" /NH', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
      profile.llamaServerRunning = procOutput.toLowerCase().includes('llama-server');
    } else {
      procOutput = execSync('pgrep -lf llama-server', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
      profile.llamaServerRunning = procOutput.trim().length > 0;
    }
    console.log(`${profile.llamaServerRunning ? '✔️' : 'ℹ️'} quantized llama-server status: ${profile.llamaServerRunning ? 'ACTIVE (running)' : 'INACTIVE (not running)'}`);
  } catch (err) {
    profile.llamaServerRunning = false;
    console.log('ℹ️ quantized llama-server status: INACTIVE');
  }

  // 3. Check environment configurations
  const envKeys = [
    'GPU_MAX_SCRATCH_MB',
    'GPU_JOB_TIMEOUT_MS',
    'GPU_ALLOW_CONCURRENT_JOBS',
    'GPU_FALLBACK_CPU',
    'OLLAMA_BASE_URL',
    'TURBOQUANT_PORT'
  ];
  for (const key of envKeys) {
    if (process.env[key] !== undefined) {
      profile.environmentVariables[key] = process.env[key];
    }
  }
  console.log(`ℹ️ Configured GPU environment keys: ${JSON.stringify(profile.environmentVariables)}`);

  // 4. Test Redis / BitFrost connectivity
  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 1, connectTimeout: 2000 });
  try {
    await redis.ping();
    profile.redisConnected = true;
    console.log('✔️ Redis / BitFrost Hot Cache: CONNECTED');
  } catch (err) {
    console.error(`🔴 Redis / BitFrost Hot Cache: OFFLINE (${err.message})`);
  } finally {
    redis.disconnect();
  }

  // 5. Test Qdrant codebase_chunks_768 connectivity
  try {
    const qRes = await fetch(`${QDRANT_URL}/collections/${CODEBASE_COLLECTION}`);
    if (qRes.ok) {
      profile.qdrantConnected = true;
      console.log('✔️ Qdrant vector retrieval: CONNECTED & collection healthy');
    } else {
      console.warn(`⚠️ Qdrant connected but collection codebase_chunks_768 returned code ${qRes.status}`);
    }
  } catch (err) {
    console.error(`🔴 Qdrant vector retrieval: OFFLINE (${err.message})`);
  }

  // Deduce status
  profile.status = (profile.redisConnected && profile.qdrantConnected) ? 'PASS' : 'FAIL';

  // Save report files programmatically
  const reportsDir = resolve(REPO_ROOT, 'docs/reports');
  if (!existsSync(reportsDir)) {
    mkdirSync(reportsDir, { recursive: true });
  }

  const jsonPath = join(reportsDir, 'vram-hygiene-smoke-report.json');
  const mdPath = join(reportsDir, 'vram-hygiene-smoke-report.md');

  writeFileSync(jsonPath, JSON.stringify(profile, null, 2), 'utf8');

  const mdContent = `# Workstation VRAM & Pipeline Hygiene Smoke Report

## Execution Details
- **Timestamp**: ${profile.timestamp}
- **Dry-run Mode**: ${isDryRun ? 'ENABLED' : 'DISABLED'}
- **Overall Status**: **${profile.status}**

## Hardware Assessment via nvidia-smi
- **Nvidia SMI Available**: ${profile.nvidiaSmiAvailable ? '✔️ Yes' : '⚠️ No'}
- **GPU Detected**: ${profile.gpuDetected ? '✔️ Yes' : '⚠️ No'}
- **Total Physical VRAM**: ${profile.vramTotalMb} MB
- **Current Used VRAM**: ${profile.vramUsedMb} MB
- **Current Free VRAM**: ${profile.vramFreeMb} MB

## Model Server & Cache State
- **Quantized llama-server Status**: ${profile.llamaServerRunning ? '✔️ ACTIVE (Running)' : 'ℹ️ INACTIVE (Not running)'}
- **Redis BitFrost Hot Cache Connected**: ${profile.redisConnected ? '✔️ CONNECTED' : '🔴 OFFLINE'}
- **Qdrant Canonical Collection Connected**: ${profile.qdrantConnected ? '✔️ CONNECTED' : '🔴 OFFLINE'}

## Environment Configurations
${Object.keys(profile.environmentVariables).length > 0
  ? Object.entries(profile.environmentVariables).map(([k, v]) => `- **${k}**: \\\`${v}\\\``).join('\n')
  : '*No GPU environment variables configured.*'
}

---
*Report dynamically generated by the smoke-vram-hygiene utility.*
`;

  writeFileSync(mdPath, mdContent, 'utf8');
  console.log(`✔️ VRAM smoke reports successfully saved:`);
  console.log(`   - JSON: ${jsonPath}`);
  console.log(`   - Markdown: ${mdPath}\n`);

  if (profile.status === 'PASS') {
    console.log('🎉 Workstation VRAM & Pipeline Hygiene Smoke Check PASSED!');
    process.exit(0);
  } else {
    console.error('🔴 Workstation VRAM & Pipeline Hygiene Smoke Check FAILED due to essential service offline.');
    process.exit(1);
  }
}

runSmoke().catch(err => {
  console.error('🔴 Critical smoke failure:', err);
  process.exit(1);
});
