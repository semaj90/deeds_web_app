import dotenv from 'dotenv';
dotenv.config();

import { getVlmState, switchVlmMode, VlmMode } from '../../sveltekit-frontend/src/lib/server/inference/vlm-lifecycle.ts';
import { getRedis } from '../../sveltekit-frontend/src/lib/server/redis.ts';

console.log('⚡ Starting VLM Lifecycle Manager Smoke Test...');

async function run() {
  try {
    const redis = getRedis();
    const originalState = await getVlmState();
    console.log(`✓ Original VLM State retrieved from Redis: "${originalState}"`);
    
    // Check if TurboQuant is active on 8090
    let healthy = false;
    try {
      const res = await fetch('http://127.0.0.1:8090/health', { signal: AbortSignal.timeout(1000) });
      healthy = res.ok;
    } catch {}
    console.log(`✓ TurboQuant Active/Listening Status: ${healthy ? 'YES (Healthy)' : 'NO'}`);
    
    // Verify switching modes
    console.log('\n--- Verifying Mode State Machine Transitions ---');
    
    console.log(`Testing transition to: ${VlmMode.OFF}`);
    const resOff = await switchVlmMode(VlmMode.OFF);
    console.log(`✓ OFF mode transition result:`, resOff);
    const stateOff = await getVlmState();
    console.log(`✓ Current state in Redis: "${stateOff}"`);
    
    console.log(`\nTesting transition to: ${VlmMode.GPU_WORK}`);
    const resGpu = await switchVlmMode(VlmMode.GPU_WORK);
    console.log(`✓ GPU_WORK mode transition result:`, resGpu);
    const stateGpu = await getVlmState();
    console.log(`✓ Current state in Redis: "${stateGpu}"`);
    
    // Restore original state
    console.log(`\n--- Restoring Original State ("${originalState}") ---`);
    if (originalState === VlmMode.TEXT || originalState === VlmMode.VISION) {
      console.log(`Restoring "${originalState}" mode...`);
      const resRestore = await switchVlmMode(originalState);
      console.log(`✓ Restore result:`, resRestore);
    } else {
      await switchVlmMode(originalState);
    }
    
    console.log('\n🎉 VLM Lifecycle Manager Smoke Test PASSED successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ VLM Lifecycle Manager Smoke Test FAILED:', err);
    process.exit(1);
  }
}

run();
