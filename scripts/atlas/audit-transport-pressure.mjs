#!/usr/bin/env node
/**
 * Read-only transport pressure audit.
 *
 * Phase 17I stays spec/audit-only. This script measures pressure signals
 * before any gRPC / FlatBuffers / CUDA JSONPath / GpJSON work is added.
 *
 * Outputs:
 *   docs/reports/transport-pressure-audit.json
 *   docs/reports/transport-pressure-audit.md
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import readline from 'node:readline';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadRepoEnv, normalizeConnectionHost, REPO_ROOT } from './connection-config.mjs';
import { resolveAtlasPaths } from './lib/repo-paths.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = REPO_ROOT || path.resolve(__dirname, '../..');
const REPORT_JSON = path.join(ROOT, 'docs', 'reports', 'transport-pressure-audit.json');
const REPORT_MD = path.join(ROOT, 'docs', 'reports', 'transport-pressure-audit.md');
const OPENCODE_JSON = path.join(ROOT, 'opencode.json');

const MB = 1024 * 1024;
const GB = 1024 * MB;

const TARGET_GLOBS = [
  '-g', '*.json',
  '-g', '*.ndjson',
  '-g', '*.jsonl',
  '-g', '*.msgpack',
  '-g', '*.mpack',
  '-g', '*.msg',
  '-g', '*msgpack*',
  '-g', '*messagepack*',
];

const SCAN_PATHS = [
  '.tmp',
  'tmp',
  'memory',
  'docs',
  'reports',
  'artifacts',
  'offline-data',
  'data',
  'storage',
  'neschrom97',
  'scripts',
  'src',
  path.relative(ROOT, resolveAtlasPaths(import.meta.url).frontendTmpRoot).replace(/\\/g, '/'),
  path.relative(ROOT, resolveAtlasPaths(import.meta.url).frontendReportsRoot).replace(/\\/g, '/'),
  'sveltekit-frontend/reports',
  'sveltekit-frontend/src',
];

const RG_EXCLUDES = [
  '-g', '!**/node_modules/**',
  '-g', '!**/.git/**',
  '-g', '!**/.svelte-kit/**',
  '-g', '!**/.vite/**',
  '-g', '!**/.venv/**',
  '-g', '!**/.cache/**',
  '-g', '!**/dist/**',
  '-g', '!**/build/**',
  '-g', '!**/coverage/**',
  '-g', '!**/target/**',
];

const DEFAULTS = {
  rabbitmq: { host: '127.0.0.1', port: 5672, scheme: 'amqp' },
  nats: { host: '127.0.0.1', port: 4222, scheme: 'nats' },
  turbovec: { url: 'http://127.0.0.1:8791' },
};

function parseUrlLike(raw, fallbackScheme) {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  try {
    return new URL(/^[a-z]+:\/\//i.test(value) ? value : `${fallbackScheme}://${value}`);
  } catch {
    return null;
  }
}

function pickEnvValue(env, keys) {
  for (const key of keys) {
    const value = String(env[key] ?? '').trim();
    if (value) return value;
  }
  return '';
}

function humanBytes(bytes) {
  if (!Number.isFinite(bytes)) return '0 B';
  if (bytes >= GB) return `${(bytes / GB).toFixed(2)} GB`;
  if (bytes >= MB) return `${(bytes / MB).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function sizeMb(bytes) {
  return Number((bytes / MB).toFixed(3));
}

function normalizeRelPath(relPath) {
  return String(relPath ?? '').replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

function runRgFiles() {
  const result = spawnSync(
    'rg',
    ['--files', '-uu', ...TARGET_GLOBS, ...RG_EXCLUDES, ...SCAN_PATHS],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024 * 128 },
  );

  if (result.status !== 0 && !result.stdout) {
    throw new Error(result.stderr?.trim() || `rg --files failed with exit ${result.status ?? 1}`);
  }

  return String(result.stdout ?? '')
    .split(/\r?\n/)
    .map((line) => normalizeRelPath(line))
    .filter(Boolean);
}

function isMessagePackPath(relPath) {
  const normalized = normalizeRelPath(relPath).toLowerCase();
  const ext = path.extname(normalized);
  return (
    ['.msgpack', '.mpack', '.msg'].includes(ext)
    || normalized.includes('msgpack')
    || normalized.includes('messagepack')
  );
}

function artifactKind(relPath) {
  const ext = path.extname(normalizeRelPath(relPath)).toLowerCase();
  if (ext === '.json') return 'json';
  if (ext === '.ndjson') return 'ndjson';
  if (ext === '.jsonl') return 'jsonl';
  if (isMessagePackPath(relPath)) return 'messagepack';
  return null;
}

function parseBrokerConfig(env, defaults, keys) {
  const rawUrl = pickEnvValue(env, keys.url);
  const rawHost = pickEnvValue(env, keys.host);
  const rawPort = pickEnvValue(env, keys.port);
  const configured = Boolean(rawUrl || rawHost || rawPort);

  let host = defaults.host;
  let port = defaults.port;
  let hasPassword = false;

  if (rawUrl) {
    const parsed = parseUrlLike(rawUrl, defaults.scheme);
    if (parsed) {
      host = normalizeConnectionHost(parsed.hostname, defaults.host);
      port = Number(parsed.port || defaults.port);
      hasPassword = Boolean(parsed.password);
    }
  } else {
    host = normalizeConnectionHost(rawHost || defaults.host, defaults.host);
    port = Number(rawPort || defaults.port) || defaults.port;
  }

  return {
    configured,
    raw: rawUrl,
    host,
    port,
    hasPassword,
    url: rawUrl || `${defaults.scheme}://${host}:${port}`,
  };
}

function parseRabbitConfig(env) {
  return parseBrokerConfig(env, DEFAULTS.rabbitmq, {
    url: ['RABBITMQ_URL', 'AMQP_URL'],
    host: ['RABBITMQ_HOST'],
    port: ['RABBITMQ_PORT'],
  });
}

function parseNatsConfig(env) {
  return parseBrokerConfig(env, DEFAULTS.nats, {
    url: ['NATS_URL'],
    host: ['NATS_HOST'],
    port: ['NATS_PORT'],
  });
}

function loadTurboVecConfig() {
  if (!fs.existsSync(OPENCODE_JSON)) {
    return { configured: false, enabled: false, url: DEFAULTS.turbovec.url };
  }

  try {
    const data = JSON.parse(fs.readFileSync(OPENCODE_JSON, 'utf8'));
    const tv = data?.mcp?.turbovec ?? {};
    return {
      configured: true,
      enabled: Boolean(tv.enabled),
      url: String(tv.url ?? DEFAULTS.turbovec.url).trim() || DEFAULTS.turbovec.url,
    };
  } catch {
    return { configured: false, enabled: false, url: DEFAULTS.turbovec.url };
  }
}

function tcpProbe(host, port, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const startedAt = Date.now();
    const timer = setTimeout(() => {
      socket.destroy();
      resolve({ ok: false, latencyMs: timeoutMs, error: 'timeout' });
    }, timeoutMs);

    socket.once('connect', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve({ ok: true, latencyMs: Date.now() - startedAt });
    });

    socket.once('error', (error) => {
      clearTimeout(timer);
      resolve({ ok: false, latencyMs: Date.now() - startedAt, error: error.code || error.message });
    });
  });
}

async function httpProbe(url, timeoutMs = 1500) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    const text = await response.text();
    return { ok: response.ok, status: response.status, preview: text.slice(0, 200) };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

async function jsonRpcProbe(url, timeoutMs = 2000) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'audit', method: 'tools/list' }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return { ok: false, status: response.status };
    const text = await response.text();
    const dataLine = text.split('\n').find((line) => line.startsWith('data:'));
    const payload = dataLine ? JSON.parse(dataLine.slice(5).trim()) : JSON.parse(text);
    return {
      ok: true,
      status: response.status,
      toolCount: payload?.result?.tools?.length ?? 0,
      sample: (payload?.result?.tools ?? []).slice(0, 5).map((tool) => tool.name),
    };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

async function countDelimitedRows(filePath) {
  return new Promise((resolve, reject) => {
    let count = 0;
    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    rl.on('line', (line) => {
      if (line.trim()) count += 1;
    });
    rl.on('close', () => resolve(count));
    rl.on('error', reject);
    stream.on('error', reject);
  });
}

function computeParseRisk({ largestJsonBytes, largestDelimitedBytes, totalTextBytes, delimitedRows }) {
  let score = 0;
  if (largestJsonBytes >= 5 * MB) score += 10;
  if (largestJsonBytes >= 25 * MB) score += 20;
  if (largestJsonBytes >= 100 * MB) score += 20;
  if (largestDelimitedBytes >= 25 * MB) score += 10;
  if (largestDelimitedBytes >= 100 * MB) score += 15;
  if (totalTextBytes >= 50 * MB) score += 10;
  if (totalTextBytes >= 250 * MB) score += 15;
  if (totalTextBytes >= 1 * GB) score += 15;
  if (delimitedRows >= 10000) score += 10;
  if (delimitedRows >= 100000) score += 10;
  score = Math.min(100, score);

  let label = 'LOW';
  if (score >= 70) label = 'HIGH';
  else if (score >= 35) label = 'MEDIUM';

  return {
    score,
    label,
    rationale: [
      largestJsonBytes >= 25 * MB ? 'large-json-files-present' : null,
      largestDelimitedBytes >= 25 * MB ? 'large-ndjson-jsonl-files-present' : null,
      totalTextBytes >= 250 * MB ? 'aggregate-text-footprint-high' : null,
      delimitedRows >= 10000 ? 'packet-row-count-high' : null,
    ].filter(Boolean),
  };
}

function pickRecommendedLevel(report) {
  if (report.summary.totalArtifactBytes >= 5 * GB || report.summary.largestArtifactBytes >= 5 * GB) {
    return {
      level: 'LEVEL_3_GPU_STRUCTURAL',
      reason: 'artifacts exceed the 5-10GB structural threshold',
    };
  }

  const binaryTransportActive = Boolean(report.services.rabbitmq.reachable || report.services.nats.reachable);
  const stableBinaryContractNeed = Boolean(
    report.summary.messagePackFileCount > 0
    || report.summary.totalDelimitedRows >= 10000
    || report.summary.largestDelimitedBytes >= 25 * MB
  );

  if (binaryTransportActive || stableBinaryContractNeed) {
    return {
      level: 'LEVEL_2_BINARY_TRANSPORT',
      reason: binaryTransportActive
        ? 'RabbitMQ/NATS is reachable, so bounded binary transport is justified'
        : 'packet pressure suggests a binary transport contract is justified',
    };
  }

  return {
    level: 'LEVEL_1_CPU_STREAMING',
    reason: 'default lane is sufficient for the current file and packet pressure',
  };
}

function topBySize(files, limit = 12) {
  return [...files]
    .sort((a, b) => b.sizeBytes - a.sizeBytes || a.relPath.localeCompare(b.relPath))
    .slice(0, limit)
    .map((file) => ({
      path: file.relPath,
      sizeBytes: file.sizeBytes,
      sizeMb: file.sizeMb,
      rows: file.rows ?? null,
    }));
}

function renderList(items) {
  if (!items.length) return ['- none'];
  return items.map((item) => `- ${item.path} (${humanBytes(item.sizeBytes)}${item.rows != null ? `, rows=${item.rows}` : ''})`);
}

function renderMarkdown(report) {
  const lines = [
    '# Transport Pressure Audit',
    '',
    `Generated: ${report.generatedAt}`,
    `Recommended level: ${report.recommendedLevel}`,
    `Reason: ${report.recommendedLevelReason}`,
    '',
    '## Summary',
    '',
    `- packet files scanned: ${report.summary.packetFileCount}`,
    `- text packet rows: ${report.summary.totalDelimitedRows}`,
    `- JSON files: ${report.packetCounts.json.fileCount}`,
    `- NDJSON files: ${report.packetCounts.ndjson.fileCount}`,
    `- JSONL files: ${report.packetCounts.jsonl.fileCount}`,
    `- MessagePack files: ${report.packetCounts.messagePack.fileCount}`,
    `- total artifact bytes: ${humanBytes(report.summary.totalArtifactBytes)}`,
    `- largest artifact: ${report.summary.largestArtifactPath || 'n/a'} (${humanBytes(report.summary.largestArtifactBytes)})`,
    `- Node parse risk: ${report.nodeParseRisk.label} (${report.nodeParseRisk.score}/100)`,
    '',
    '## Largest JSON Files',
    '',
    ...renderList(report.largest.json),
    '',
    '## Largest NDJSON Files',
    '',
    ...renderList(report.largest.ndjson),
    '',
    '## Largest JSONL Files',
    '',
    ...renderList(report.largest.jsonl),
    '',
    '## Largest MessagePack Chunks',
    '',
    ...renderList(report.largest.messagePack),
    '',
    '## Service Availability',
    '',
    '| service | configured | host | port | reachable | detail |',
    '|---|---|---|---:|---|---|',
    `| RabbitMQ | ${report.services.rabbitmq.configured ? 'yes' : 'no'} | ${report.services.rabbitmq.host} | ${report.services.rabbitmq.port} | ${report.services.rabbitmq.reachable ? 'yes' : 'no'} | ${report.services.rabbitmq.detail.replace(/\|/g, '\\|')} |`,
    `| NATS | ${report.services.nats.configured ? 'yes' : 'no'} | ${report.services.nats.host} | ${report.services.nats.port} | ${report.services.nats.reachable ? 'yes' : 'no'} | ${report.services.nats.detail.replace(/\|/g, '\\|')} |`,
    `| TurboVec | ${report.services.turbovec.configured ? 'yes' : 'no'} | ${report.services.turbovec.host} | ${report.services.turbovec.port || 'n/a'} | ${report.services.turbovec.reachable ? 'yes' : 'no'} | ${report.services.turbovec.detail.replace(/\|/g, '\\|')} |`,
    '',
    '## Packet Counts',
    '',
    `- packet rows (NDJSON + JSONL): ${report.summary.totalDelimitedRows}`,
    `- MessagePack files: ${report.packetCounts.messagePack.fileCount}`,
    `- packet-like files: ${report.summary.packetFileCount}`,
    `- total packet-like bytes: ${humanBytes(report.summary.totalArtifactBytes)}`,
    '',
    '## Node Parse Risk',
    '',
    `- score: ${report.nodeParseRisk.score}/100`,
    `- label: ${report.nodeParseRisk.label}`,
    `- rationale: ${report.nodeParseRisk.rationale.length ? report.nodeParseRisk.rationale.join(', ') : 'none'}`,
    '',
    '## Notes',
    '',
    '- This audit is read-only.',
    '- LEVEL_1_CPU_STREAMING is the default lane.',
    '- LEVEL_2_BINARY_TRANSPORT is justified when RabbitMQ/NATS is reachable or binary contract pressure is visible.',
    '- LEVEL_3_GPU_STRUCTURAL is reserved for multi-gigabyte artifacts or path-scan saturation.',
    '- Do not build gRPC, FlatBuffers, CUDA JSONPath, or GpJSON from this audit alone.',
  ];
  return `${lines.join('\n')}\n`;
}

async function main() {
  const env = loadRepoEnv(process.env);
  const allFiles = runRgFiles();

  const jsonFiles = [];
  const ndjsonFiles = [];
  const jsonlFiles = [];
  const messagePackFiles = [];

  for (const relPath of allFiles) {
    const absPath = path.join(ROOT, relPath);
    if (!fs.existsSync(absPath) || fs.statSync(absPath).isDirectory()) continue;

    const kind = artifactKind(relPath);
    if (!kind) continue;

    const stat = fs.statSync(absPath);
    const record = {
      relPath: normalizeRelPath(relPath),
      absPath,
      kind,
      sizeBytes: stat.size,
      sizeMb: sizeMb(stat.size),
      rows: null,
    };

    if (kind === 'json') jsonFiles.push(record);
    else if (kind === 'ndjson') ndjsonFiles.push(record);
    else if (kind === 'jsonl') jsonlFiles.push(record);
    else if (kind === 'messagepack') messagePackFiles.push(record);
  }

  const delimitedFiles = [...ndjsonFiles, ...jsonlFiles];
  for (const record of delimitedFiles) {
    record.rows = await countDelimitedRows(record.absPath);
  }

  const totalDelimitedRows = delimitedFiles.reduce((sum, record) => sum + (record.rows ?? 0), 0);
  const totalArtifactBytes = [...jsonFiles, ...ndjsonFiles, ...jsonlFiles, ...messagePackFiles].reduce((sum, record) => sum + record.sizeBytes, 0);
  const largestArtifact = [...jsonFiles, ...ndjsonFiles, ...jsonlFiles, ...messagePackFiles]
    .sort((a, b) => b.sizeBytes - a.sizeBytes || a.relPath.localeCompare(b.relPath))[0] ?? null;
  const largestJsonBytes = jsonFiles.reduce((max, record) => Math.max(max, record.sizeBytes), 0);
  const largestDelimitedBytes = [...ndjsonFiles, ...jsonlFiles].reduce((max, record) => Math.max(max, record.sizeBytes), 0);
  const textBytes = [...jsonFiles, ...ndjsonFiles, ...jsonlFiles].reduce((sum, record) => sum + record.sizeBytes, 0);
  const nodeParseRisk = computeParseRisk({
    largestJsonBytes,
    largestDelimitedBytes,
    totalTextBytes: textBytes,
    delimitedRows: totalDelimitedRows,
  });

  const rabbit = parseRabbitConfig(env);
  const nats = parseNatsConfig(env);
  const turbovec = loadTurboVecConfig();

  const rabbitProbe = rabbit.configured
    ? await tcpProbe(rabbit.host, rabbit.port)
    : { ok: false, error: 'not configured' };
  const natsProbe = nats.configured
    ? await tcpProbe(nats.host, nats.port)
    : { ok: false, error: 'not configured' };

  const turbovecUrl = turbovec.url || DEFAULTS.turbovec.url;
  const turbovecUrlObj = parseUrlLike(turbovecUrl, 'http');
  const turbovecHost = normalizeConnectionHost(turbovecUrlObj?.hostname ?? '127.0.0.1', '127.0.0.1');
  const turbovecPort = Number(turbovecUrlObj?.port || 8791);
  const turbovecMcpProbe = await jsonRpcProbe(turbovecUrl);
  const turbovecHealthProbe = await httpProbe(new URL('/health', turbovecUrl.endsWith('/') ? turbovecUrl : `${turbovecUrl}/`).toString());

  const services = {
    rabbitmq: {
      configured: rabbit.configured,
      host: rabbit.host,
      port: rabbit.port,
      reachable: Boolean(rabbitProbe.ok),
      detail: rabbit.configured
        ? (rabbitProbe.ok ? `TCP reachable in ${rabbitProbe.latencyMs}ms` : `TCP probe failed: ${rabbitProbe.error || 'unknown'}`)
        : 'not configured',
    },
    nats: {
      configured: nats.configured,
      host: nats.host,
      port: nats.port,
      reachable: Boolean(natsProbe.ok),
      detail: nats.configured
        ? (natsProbe.ok ? `TCP reachable in ${natsProbe.latencyMs}ms` : `TCP probe failed: ${natsProbe.error || 'unknown'}`)
        : 'not configured',
    },
    turbovec: {
      configured: turbovec.configured,
      enabled: turbovec.enabled,
      host: turbovecHost,
      port: turbovecPort,
      reachable: Boolean(turbovecMcpProbe.ok || turbovecHealthProbe.ok),
      detail: turbovec.configured
        ? [
            turbovec.enabled ? 'enabled in opencode' : 'disabled in opencode',
            turbovecMcpProbe.ok ? `MCP ok (${turbovecMcpProbe.toolCount ?? 0} tools)` : `MCP ${turbovecMcpProbe.error || turbovecMcpProbe.status || 'down'}`,
            turbovecHealthProbe.ok ? `health ok (${turbovecHealthProbe.status})` : `health ${turbovecHealthProbe.error || turbovecHealthProbe.status || 'down'}`,
          ].join('; ')
        : 'not configured',
    },
  };

  const recommended = pickRecommendedLevel({
    summary: {
      totalArtifactBytes,
      largestArtifactBytes: largestArtifact?.sizeBytes ?? 0,
      totalDelimitedRows,
      messagePackFileCount: messagePackFiles.length,
      largestDelimitedBytes,
    },
    services,
  });

  const report = {
    schema: 'transport_pressure_audit.v1',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    recommendedLevel: recommended.level,
    recommendedLevelReason: recommended.reason,
    summary: {
      packetFileCount: jsonFiles.length + ndjsonFiles.length + jsonlFiles.length + messagePackFiles.length,
      totalDelimitedRows,
      totalArtifactBytes,
      largestArtifactPath: largestArtifact?.relPath ?? null,
      largestArtifactBytes: largestArtifact?.sizeBytes ?? 0,
      largestDelimitedBytes,
    },
    packetCounts: {
      json: {
        fileCount: jsonFiles.length,
        bytes: jsonFiles.reduce((sum, record) => sum + record.sizeBytes, 0),
      },
      ndjson: {
        fileCount: ndjsonFiles.length,
        rows: ndjsonFiles.reduce((sum, record) => sum + (record.rows ?? 0), 0),
        bytes: ndjsonFiles.reduce((sum, record) => sum + record.sizeBytes, 0),
      },
      jsonl: {
        fileCount: jsonlFiles.length,
        rows: jsonlFiles.reduce((sum, record) => sum + (record.rows ?? 0), 0),
        bytes: jsonlFiles.reduce((sum, record) => sum + record.sizeBytes, 0),
      },
      messagePack: {
        fileCount: messagePackFiles.length,
        bytes: messagePackFiles.reduce((sum, record) => sum + record.sizeBytes, 0),
      },
    },
    largest: {
      json: topBySize(jsonFiles),
      ndjson: topBySize(ndjsonFiles),
      jsonl: topBySize(jsonlFiles),
      messagePack: topBySize(messagePackFiles),
    },
    services,
    nodeParseRisk,
    activationRules: [
      'LEVEL_1_CPU_STREAMING is the default.',
      'LEVEL_2_BINARY_TRANSPORT is justified if RabbitMQ/NATS is active or stable binary contracts are needed.',
      'LEVEL_3_GPU_STRUCTURAL is justified if artifacts exceed roughly 5-10GB or structural scans saturate CPU parsing.',
    ],
    notes: [
      'Read-only audit only; no transport runtime is mutated.',
      'Large JSON/NDJSON/JSONL files are the pressure surface.',
      'MessagePack chunks are counted separately because they already represent binary transport.',
      'TurboVec is reported from existing OpenCode routing config and health probes.',
    ],
  };

  await fsp.mkdir(path.dirname(REPORT_JSON), { recursive: true });
  await fsp.writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fsp.writeFile(REPORT_MD, renderMarkdown(report), 'utf8');

  console.log('Transport Pressure Audit');
  console.log(`LEVEL ${report.recommendedLevel} (${report.recommendedLevelReason})`);
  console.log(`packet files: ${report.summary.packetFileCount}`);
  console.log(`rows: ${report.summary.totalDelimitedRows}`);
  console.log(`risk: ${report.nodeParseRisk.label} (${report.nodeParseRisk.score}/100)`);
  console.log(`Wrote ${REPORT_JSON}`);
  console.log(`Wrote ${REPORT_MD}`);
}

main().catch((error) => {
  console.error('[audit-transport-pressure] fatal:', error);
  process.exit(1);
});
