import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT_DIR = process.cwd();
const STATUS_PATH = path.resolve(ROOT_DIR, '.tmp/ace-startup-status.json');
const ALT_STATUS_PATH = path.resolve(ROOT_DIR, 'sveltekit-frontend/.tmp/ace-startup-status.json');

// Ensure directories exist
fs.mkdirSync(path.dirname(STATUS_PATH), { recursive: true });
try {
  fs.mkdirSync(path.dirname(ALT_STATUS_PATH), { recursive: true });
} catch (e) {}

function getDuplicateScripts(packageJsonPath) {
  if (!fs.existsSync(packageJsonPath)) return [];
  const content = fs.readFileSync(packageJsonPath, 'utf8');
  const lines = content.split(/\r?\n/);
  let inScripts = false;
  let openBraces = 0;
  const scriptKeys = [];
  const duplicates = [];

  for (const line of lines) {
    if (line.includes('"scripts"')) {
      inScripts = true;
      if (line.includes('{')) openBraces++;
      continue;
    }
    if (inScripts) {
      if (line.includes('{')) openBraces++;
      if (line.includes('}')) {
        openBraces--;
        if (openBraces <= 0) {
          inScripts = false;
        }
      }
      const match = line.match(/"([^"]+)"\s*:/);
      if (match) {
        const key = match[1];
        if (scriptKeys.includes(key)) {
          duplicates.push(key);
        } else {
          scriptKeys.push(key);
        }
      }
    }
  }
  return duplicates;
}

async function main() {
  const checkedAt = new Date().toISOString();
  let ok = true;
  const blockers = [];
  const warnings = [];
  let status = 0;
  let viteService = false;

  // 1. Call local /api/health
  try {
    const response = await fetch('http://localhost:5173/api/health', {
      signal: AbortSignal.timeout(12000),
    });
    status = response.status;
    viteService = true;
    if (response.status === 200) {
      // 200 OK
    } else if (response.status === 403) {
      blockers.push('api.health.auth_blocked');
      ok = false;
    } else {
      blockers.push(`api.health.invalid_status_${response.status}`);
      ok = false;
    }
  } catch (error) {
    status = error.code || error.message;
    viteService = false;
    blockers.push('api.health.unavailable');
    ok = false;
  }

  // 2. Check duplicate scripts in package.json
  const rootDuplicates = getDuplicateScripts(path.join(ROOT_DIR, 'package.json'));
  const frontendDuplicates = getDuplicateScripts(
    path.join(ROOT_DIR, 'sveltekit-frontend/package.json')
  );
  if (rootDuplicates.length > 0) {
    warnings.push(`package.json.root.duplicate_scripts: ${rootDuplicates.join(', ')}`);
  }
  if (frontendDuplicates.length > 0) {
    warnings.push(`package.json.frontend.duplicate_scripts: ${frontendDuplicates.join(', ')}`);
  }

  // 3. Sidecar stdout guard check
  let sidecarHealthy = true;
  try {
    const sidecarCheckScript = path.join(ROOT_DIR, 'scripts/health-check-sidecars.mjs');
    if (fs.existsSync(sidecarCheckScript)) {
      // Execute and capture output / verify exit code
      const stdout = execSync(`node "${sidecarCheckScript}"`, { encoding: 'utf8', stdio: 'pipe' });
      // If we got "OFFLINE" or warnings about offline, or exit code != 0, consider it a failure
      if (stdout.includes('OFFLINE') || stdout.includes('degraded')) {
        warnings.push('sidecar_running_degraded');
      }
    }
  } catch (e) {
    sidecarHealthy = false;
    blockers.push(`sidecar.stdout_guard_failed: ${e.message}`);
    ok = false;
  }

  const resultPayload = {
    status: ok ? 'ok' : 'degraded',
    ok,
    health: {
      ok: ok && status === 200,
      status,
      checkedAt,
    },
    services: {
      vite: viteService,
      sidecars: sidecarHealthy,
    },
    blockers,
    warnings,
  };

  const payloadString = JSON.stringify(resultPayload, null, 2);
  fs.writeFileSync(STATUS_PATH, payloadString, 'utf8');
  try {
    fs.writeFileSync(ALT_STATUS_PATH, payloadString, 'utf8');
  } catch (e) {}

  console.log(`[ace-startup-health] status check complete. ok=${ok}. written to ${STATUS_PATH}`);
  if (!ok) {
    console.error(`[ace-startup-health] Blockers detected:`, blockers);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[ace-startup-health] Fatal error', err);
  process.exit(1);
});
