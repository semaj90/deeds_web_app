import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { freemem } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  graphifyDailyPreflightPlanV1Schema,
  hostPreflightReceiptV1Schema,
  resolveAtlasDiagnosticCapabilityV1,
} from '../../packages/parent-atlas/dist/index.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const supervisorFreeMemoryReserveMiB = 1024;

function parseArgs(args) {
  if (args.length !== 2 || args[0] !== '--capability' || !args[1]) {
    throw new Error('USAGE: node scripts/atlas/run-diagnostic-capability-v1.mjs --capability <allowlisted-id>');
  }
  return args[1];
}

function safeChildEnvironment() {
  const permitted = [
    'Path', 'PATHEXT', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'HOME',
    'ProgramFiles', 'ProgramFiles(x86)', 'CUDA_PATH', 'CUDA_PATH_V13_0',
    'DOCKER_CONFIG', 'DOCKER_CONTEXT', 'DOCKER_HOST', 'WSLENV',
  ];
  const env = Object.fromEntries(permitted.flatMap((key) => process.env[key] ? [[key, process.env[key]]] : []));
  if (!env.Path && process.env.PATH) env.Path = process.env.PATH;
  env.ATLAS_DIAGNOSTIC_ONLY = '1';
  return env;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function validateCapabilityOutputV1(outputContract, output) {
  if (outputContract === 'git-commit-hex-v1') {
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})\r?\n?$/.test(output)) {
      throw new Error('ATLAS_CAPABILITY_OUTPUT_INVALID:git-commit-hex-v1');
    }
    return;
  }

  if (outputContract === 'atlas.host-preflight.v1' || outputContract === 'atlas.graphify-daily-preflight-plan.v1') {
    let parsed;
    try {
      parsed = JSON.parse(output);
    } catch {
      throw new Error(`ATLAS_CAPABILITY_OUTPUT_INVALID:${outputContract}`);
    }

    try {
      if (outputContract === 'atlas.host-preflight.v1') {
        hostPreflightReceiptV1Schema.parse(parsed);
        return;
      }

      const plan = graphifyDailyPreflightPlanV1Schema.parse(parsed);
      const { planSha256, ...body } = plan;
      const expected = createHash('sha256').update(stableJson(body), 'utf8').digest('hex');
      if (expected !== planSha256) throw new Error('PLAN_CHECKSUM_MISMATCH');
    } catch {
      throw new Error(`ATLAS_CAPABILITY_OUTPUT_INVALID:${outputContract}`);
    }
    return;
  }

  if (outputContract !== 'node-test-v1') {
    throw new Error(`ATLAS_CAPABILITY_OUTPUT_CONTRACT_UNKNOWN:${String(outputContract)}`);
  }
}

export function executeDiagnosticCapabilityV1(capabilityId, {
  execFileSyncImpl = execFileSync,
  freeMemoryBytes = freemem(),
} = {}) {
  const capability = resolveAtlasDiagnosticCapabilityV1(capabilityId);
  const freeMemoryMiB = Math.floor(freeMemoryBytes / (1024 * 1024));
  const requiredFreeMemoryMiB = capability.maxMemoryMiB + supervisorFreeMemoryReserveMiB;
  if (freeMemoryMiB < requiredFreeMemoryMiB) {
    throw new Error(`ATLAS_CAPABILITY_INSUFFICIENT_MEMORY:required=${requiredFreeMemoryMiB}MiB:available=${freeMemoryMiB}MiB`);
  }

  const output = execFileSyncImpl(capability.executable, capability.args, {
    cwd: path.resolve(repoRoot, capability.workingDirectory),
    env: safeChildEnvironment(),
    encoding: 'utf8',
    timeout: capability.timeoutMs,
    maxBuffer: capability.maxOutputBytes,
    windowsHide: true,
    shell: false,
  });
  validateCapabilityOutputV1(capability.outputContract, output);
  return output;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(executeDiagnosticCapabilityV1(parseArgs(process.argv.slice(2))));
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'CAPABILITY_FAILED';
    const message = error instanceof Error && error.message.startsWith('ATLAS_CAPABILITY_') ? error.message : code;
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
