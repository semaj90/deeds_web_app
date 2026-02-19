#!/usr/bin/env node
import { execSync, spawn } from 'child_process';
import os from 'os';
import path from 'path';
import fs from 'fs';

// Simple args parser for '--watchdog' and numeric overrides
const argv = process.argv.slice(2);
const FLAGS = { watchdog: false };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--watchdog') FLAGS.watchdog = true;
  if (a === '--vram') FLAGS.vram = Number(argv[++i]);
  if (a === '--layers') FLAGS.layers = Number(argv[++i]);
  if (a === '--threads') FLAGS.threads = Number(argv[++i]);
  if (a === '--min-layers') FLAGS.minLayers = Number(argv[++i]);
}

function detectVRAM() {
  if (FLAGS.vram) return FLAGS.vram;
  try {
    const out = execSync(
      `nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits`
    )
      .toString()
      .trim();
    const first = out.split('\n')[0];
    return parseInt(first) || 0;
  } catch (e) {
    console.warn('⚠️ Could not detect VRAM — defaulting to 4096 MB');
    return 4096;
  }
}

function pickLayers(vram) {
  if (FLAGS.layers) return FLAGS.layers;
  if (vram >= 12288) return 32;
  if (vram >= 8192) return 28;
  if (vram >= 6000) return 24;
  if (vram >= 4000) return 18;
  return 12;
}

function pickThreads() {
  if (FLAGS.threads) return FLAGS.threads;
  const cpus = os.cpus().length;
  return Math.max(4, Math.floor(cpus / 2));
}

function generateDynamicPort() {
  return Math.floor(Math.random() * (13000 - 12000 + 1)) + 12000;
}

function writeEnvLocal(port) {
  const envLocalPath = path.resolve(process.cwd(), '.env.local');
  fs.writeFileSync(envLocalPath, `OLLAMA_PORT=${port}\n`, { flag: 'a' });
  console.log(`📝 Wrote OLLAMA_PORT=${port} to .env.local`);
}

function runOllama(gpuLayers, threads, port) {
  const psScript = path.resolve('scripts', 'start-ollama-gpu.ps1');
  const args = [
    '-NoLogo',
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    psScript,
    '-GpuLayers',
    String(gpuLayers),
    '-NumThreads',
    String(threads),
    '-WaitSeconds',
    '30',
    '-Port',
    String(port),
  ];
  console.log(`🚀 Launching Ollama on dynamic port ${port}: layers=${gpuLayers}, threads=${threads}`);
  const proc = spawn('pwsh', args, {
    stdio: 'inherit',
    env: {
      ...process.env,
      OLLAMA_PORT: String(port),
      OLLAMA_NUM_THREADS: String(threads),
      OLLAMA_MODELS: path.resolve(process.cwd(), 'sveltekit-frontend', 'models'),
    },
  });
  return proc;
}

function readNvidiaSmi() {
  try {
    const out = execSync(
      `nvidia-smi --query-gpu=utilization.gpu,temperature.gpu,memory.used,memory.total --format=csv,noheader,nounits`
    )
      .toString()
      .trim();
    const parts = out.split('\n')[0].split(',').map(s => s.trim());
    return {
      utilization_pct: Number(parts[0] || 0),
      temperature_C: Number(parts[1] || 0),
      memory_used_MB: Number(parts[2] || 0),
      memory_total_MB: Number(parts[3] || 0),
    };
  } catch (e) {
    return null;
  }
}

async function main() {
  const vram = detectVRAM();
  let gpuLayers = pickLayers(vram);
  const threads = pickThreads();
  const port = generateDynamicPort();

  console.log(`🎮 Detected VRAM: ${vram} MB → GPU Layers = ${gpuLayers}`);
  console.log(`🧵 CPU Threads: ${threads}`);
  console.log(`🔌 Dynamic Port: ${port}`);

  writeEnvLocal(port);

  let proc = runOllama(gpuLayers, threads, port);

  if (!FLAGS.watchdog) {
    proc.on('close', code => console.log(`💡 Ollama exited with code ${code}`));
    return;
  }

  console.log('🛡️ Watchdog enabled — monitoring GPU usage every 10s');
  let minLayers = FLAGS.minLayers || 12;

  const interval = setInterval(() => {
    const s = readNvidiaSmi();
    if (!s) {
      console.warn('⚠️ Cannot read nvidia-smi; skipping watchdog tick');
      return;
    }

    const vramUsedPct = (s.memory_used_MB / s.memory_total_MB) * 100;
    const util = s.utilization_pct;
    console.log(`📊 GPU: ${util}% util / ${Math.round(vramUsedPct)}% VRAM used / ${s.temperature_C}°C`);

    // If utilization or VRAM too high, reduce layers and restart
    if ((util > 90 || vramUsedPct > 95) && gpuLayers > minLayers) {
      const newLayers = Math.max(minLayers, Math.floor(gpuLayers * 0.75));
      console.log(`⚠️ High load detected — restarting Ollama with lower layers (${gpuLayers} → ${newLayers})`);
      proc.kill();
      proc = runOllama(newLayers, threads);
      gpuLayers = newLayers;
    }
  }, 10000);

  proc.on('close', code => {
    console.log(`💡 Ollama watchdog process exited with code ${code}`);
    clearInterval(interval);
  });
}

main().catch(e => {
  console.error('Auto Ollama launcher failed:', e);
  process.exit(1);
});
