#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ensureScript = path.resolve(__dirname, '../../sveltekit-frontend/scripts/ensure-mcp-server.mjs');

const port = process.env.TRACE_MCP_PORT ?? '8788';

if (process.argv.includes('--restart')) {
  console.log(`[ensure-trace-mcp] Stopping process listening on port ${port}...`);
  if (process.platform === 'win32') {
    spawnSync('powershell', [
      '-NoProfile',
      '-Command',
      `$tcp = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($tcp) { Stop-Process -Id $tcp.OwningProcess -Force -ErrorAction SilentlyContinue; Write-Host "Stopped PID" $tcp.OwningProcess }`
    ], { stdio: 'inherit' });
  }
}

console.log('[ensure-trace-mcp] Spawning TRACE MCP server via ensure-mcp-server.mjs --spawn...');
const res = spawnSync(process.execPath, [ensureScript, '--spawn'], {
  stdio: 'inherit',
  cwd: path.resolve(__dirname, '../../sveltekit-frontend')
});

process.exit(res.status ?? 0);
