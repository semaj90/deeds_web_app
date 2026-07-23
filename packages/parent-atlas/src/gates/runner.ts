import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { REPO_ROOT, SCRIPTS_ATLAS } from '../env.js';
import type { GateReport, RunOptions } from './types.js';

/**
 * Run one of the scripts/atlas/audit-*.mjs gate scripts as a subprocess
 * and return the parsed JSON report.
 *
 * On Windows with Docker Desktop, port-forwarded services (Postgres, Qdrant,
 * Neo4j, Redis) are unreachable from the Windows host Node.js process due to
 * a Docker Desktop VPNkit proxy issue with PG18's GSSAPI handshake and related
 * protocols. Set ATLAS_DOCKER_NETWORK=<network> (e.g. deeds-web-app_legal-ai-network)
 * to run gate scripts inside a temporary node:22-alpine container that has full
 * access to the Docker service network. The repo root is bind-mounted read-only.
 */
export async function runGateScript(
  scriptName: string,
  opts: RunOptions = {},
): Promise<GateReport> {
  const scriptPath = resolve(SCRIPTS_ATLAS, scriptName);
  const dockerNetwork = String(process.env.ATLAS_DOCKER_NETWORK ?? '').trim();

  let result: ReturnType<typeof spawnSync>;

  if (dockerNetwork) {
    // Run via ephemeral docker container on the service network so the script
    // can reach Postgres/Qdrant/Neo4j/Redis via Docker DNS names.
    const repoRootPosix = REPO_ROOT.replace(/\\/g, '/');
    // Convert Windows C:\... paths to /c/... for Docker volume mounts
    const dockerRepoRoot = repoRootPosix.replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`);
    const scriptRelPath = scriptPath.replace(/\\/g, '/').replace(repoRootPosix, '/repo');
    const envOverrides: string[] = [
      // Use Docker DNS names instead of 127.0.0.1
      ...(process.env.DATABASE_URL ? [] : ['-e', 'DATABASE_URL=postgresql://legal_admin:123456@legal-ai-postgres:5432/legal_ai_db']),
      ...(process.env.QDRANT_URL ? [] : ['-e', 'QDRANT_URL=http://legal-ai-qdrant:6333']),
      ...(process.env.NEO4J_URI ? [] : ['-e', 'NEO4J_URI=bolt://legal-ai-neo4j:7687']),
      ...(process.env.NEO4J_USER ? [] : ['-e', 'NEO4J_USER=neo4j']),
      ...(process.env.NEO4J_PASSWORD ? [] : ['-e', 'NEO4J_PASSWORD=neo4j123']),
      ...(process.env.REDIS_HOST ? [] : ['-e', 'REDIS_HOST=legal-ai-valkey']),
    ];
    // Pass through existing env vars
    const passEnv = ['DATABASE_URL', 'QDRANT_URL', 'NEO4J_URI', 'NEO4J_USER', 'NEO4J_PASSWORD',
      'REDIS_HOST', 'REDIS_PORT', 'REDIS_PASSWORD', 'REDIS_URL'];
    for (const k of passEnv) {
      if (process.env[k]) envOverrides.push('-e', `${k}=${process.env[k]}`);
    }
    const dockerArgs = [
      'run', '--rm',
      '--network', dockerNetwork,
      '-v', `${dockerRepoRoot}:/repo:ro`,
      ...envOverrides,
      '-w', '/repo',
      'node:22-alpine',
      'sh', '-c',
      `cd /repo && node ${scriptRelPath} --json ${(opts.args ?? []).join(' ')}`,
    ];
    result = spawnSync('docker', dockerArgs, {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      timeout: opts.timeout ?? 180_000,
      env: { ...process.env },
    });
  } else {
    const args = [scriptPath, '--json', ...(opts.args ?? [])];
    result = spawnSync(process.execPath, args, {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      timeout: opts.timeout ?? 120_000,
      env: { ...process.env },
    });
  }

  if (result.error) {
    throw new Error(`Script ${scriptName} failed to spawn: ${result.error.message}`);
  }

  const rawFull = (result.stdout ? String(result.stdout) : '').trim();
  if (!rawFull) {
    throw new Error(
      `Script ${scriptName} produced no output. stderr: ${result.stderr?.slice(0, 400) ?? '(empty)'}`,
    );
  }

  // Some scripts emit log lines before/after the JSON block even with --json.
  // Extract the outermost JSON object.
  const jsonStart = rawFull.indexOf('{');
  const jsonEnd = rawFull.lastIndexOf('}');
  const raw = jsonStart >= 0 && jsonEnd > jsonStart
    ? rawFull.slice(jsonStart, jsonEnd + 1)
    : rawFull;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(`Script ${scriptName} output is not valid JSON:\n${raw.slice(0, 300)}`);
  }

  // Normalise divergent report shapes into the canonical GateReport structure.
  // Some audit scripts use checks:{} object, others use checks:[] array, others
  // use `passed: boolean` + `replay_rate` instead of `failed: number`.
  const checksRaw = parsed.checks;
  const reportThreshold = typeof parsed.threshold === 'number' ? parsed.threshold : 1;
  let checks: GateReport['checks'];

  if (Array.isArray(checksRaw)) {
    checks = checksRaw as GateReport['checks'];
  } else if (checksRaw && typeof checksRaw === 'object') {
    // Object map → flatten to array
    checks = Object.entries(checksRaw as Record<string, unknown>).map(([id, detail]) => {
      const d = detail as Record<string, unknown>;
      const rate = typeof d.rate === 'number' ? d.rate : null;
      const eligible = typeof d.eligible === 'number' ? d.eligible : null;
      const missing = typeof d.missing === 'number' ? d.missing : 0;
      const misaligned = typeof d.misaligned === 'number' ? d.misaligned : 0;
      const aligned = typeof d.aligned === 'number' ? d.aligned : null;
      // advisory/zero-eligible/zero-population checks → skip
      const isAdvisory = d.status === 'optional_reserved' || d.status === 'skip'
        || d.status === 'advisory'
        || (eligible === 0 && missing === 0 && misaligned === 0)
        || (aligned === 0 && misaligned === 0);
      const status = isAdvisory
        ? 'skip'
        : rate === null
          ? (d.fail === 0 ? 'pass' : 'fail')
          : rate >= reportThreshold ? 'pass' : 'fail';
      return {
        id,
        status: status as GateReport['checks'][number]['status'],
        message: `${id}: ${JSON.stringify(d)}`,
        detail: d,
      };
    });
  } else {
    checks = [];
  }

  // Derive overall from `passed` bool or existing `overall` string
  const passedBool = typeof parsed.passed === 'boolean' ? parsed.passed : null;
  const overall: GateReport['overall'] =
    typeof parsed.overall === 'string' && (parsed.overall === 'PASS' || parsed.overall === 'FAIL')
      ? (parsed.overall as GateReport['overall'])
      : passedBool === true ? 'PASS' : passedBool === false ? 'FAIL'
        : checks.every(c => c.status === 'pass' || c.status === 'skip') ? 'PASS' : 'FAIL';

  const passCount = checks.filter(c => c.status === 'pass').length;
  const failCount = checks.filter(c => c.status === 'fail').length;

  return {
    ...parsed,
    ts: String(parsed.ts ?? new Date().toISOString()),
    overall,
    passed: typeof parsed.passed === 'number' ? parsed.passed as number : passCount,
    failed: typeof parsed.failed === 'number' ? parsed.failed as number : failCount,
    checks,
  } as GateReport;
}
