#!/usr/bin/env node
/**
 * GPU / WASM feature probe
 * - Checks WebGPU availability (via environment hint)
 * - Attempts dynamic import of a lightweight WASM (if present) or reports guidance
 */

async function main() {
  console.log('🔍 GPU / WASM Probe Start');

  // WebGPU check (Node 22 may not expose navigator). Provide guidance instead.
  const webgpuSupported = typeof navigator !== 'undefined' && 'gpu' in navigator;
  console.log(`WebGPU Supported (runtime detection): ${webgpuSupported}`);

  // Fallback heuristic: env vars often used in this repo
  const envGpu = process.env.ENABLE_GPU || process.env.RTX_3060_OPTIMIZATION;
  if (envGpu) {
    console.log('⚙️  GPU optimization environment flags detected:', envGpu);
  } else {
    console.log('ℹ️  No GPU optimization env flags set (ENABLE_GPU / RTX_3060_OPTIMIZATION).');
  }

  // WASM module probe (placeholder)
  const candidate = './src/lib/webasm/llama-cpp-engine.ts';
  try {
    const fs = await import('node:fs');
    if (fs.existsSync(candidate)) {
      console.log(`✅ Found candidate WASM integration source: ${candidate}`);
    } else {
      console.log(`ℹ️  No WASM integration file found at ${candidate} (probe is informational).`);
    }
  } catch (e) {
    console.log('⚠️  Failed filesystem probe:', e.message);
  }

  console.log('✅ Probe complete');
}

main().catch(e => { console.error('❌ Probe failed', e); process.exit(1); });
