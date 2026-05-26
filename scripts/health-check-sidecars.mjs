import fs from 'fs';
import path from 'path';
import http from 'http';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

export async function checkSidecars() {
  console.log('🩺 Running Health Check for Sidecars...');
  let allHealthy = true;

  // 1. Check SIMD Bridge
  const simdPath = path.join(process.cwd(), '..', 'simd-bridge', 'cpp', 'build', 'Release', 'tensorrt_bridge.node');
  if (fs.existsSync(simdPath)) {
    console.log('✅ SIMD AVX2 Bridge: ONLINE');
  } else {
    console.log('⚠️ SIMD AVX2 Bridge: OFFLINE. (tensorrt_bridge.node not found)');
    allHealthy = false;
  }

  // 2. Check MCP Servers (8791, 8792, 8793)
  const ports = [8791, 8792, 8793];
  let mcpOffline = false;
  for (const port of ports) {
    const isUp = await checkPort(port);
    if (isUp) {
      console.log(`✅ MCP Server (Port ${port}): ONLINE`);
    } else {
      console.log(`⚠️ MCP Server (Port ${port}): OFFLINE`);
      mcpOffline = true;
    }
  }

  if (mcpOffline) {
    console.log('🔄 Attempting to start MCP Sidecars & Docker dependencies...');
    try {
      // Assuming a generic docker compose or pm2 start command here
      const executionCwd = fs.existsSync(path.join(process.cwd(), 'sveltekit-frontend')) 
        ? path.join(process.cwd(), 'sveltekit-frontend') 
        : process.cwd();
      exec('npm run mcp:opencode-sidecars', { cwd: executionCwd }, (err) => {
         if (err) console.log(`[Diagnostic] mcp:opencode-sidecars script may not exist or failed: ${err.message}`);
      });
      console.log('✅ Sent startup signal to MCP sidecars.');
    } catch (err) {
      console.error('❌ Failed to start MCP Sidecars:', err.message);
      allHealthy = false;
    }
  }

  if (!allHealthy) {
    console.log('⚠️ Warning: Some sidecars are offline. System will run in degraded mode.');
  } else {
    console.log('✅ All Sidecars ONLINE.');
  }
  
  return allHealthy;
}

function checkPort(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/mcp`, (res) => {
      resolve(true); // Any response means it's running
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

import { fileURLToPath } from 'url';

// If run directly
const isDirectRun = process.argv[1] && (
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
);

if (isDirectRun) {
  checkSidecars();
}
