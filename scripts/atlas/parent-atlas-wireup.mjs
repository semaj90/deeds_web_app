#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');
const PACKAGE_ROOT = path.resolve(REPO_ROOT, 'packages/parent-atlas');
const PACKAGE_DIST = path.resolve(PACKAGE_ROOT, 'dist/index.js');
const SERVICE_CONTRACT_DIST = path.resolve(PACKAGE_ROOT, 'dist/core/service-contract.js');
const DOCS_REPORTS = path.resolve(REPO_ROOT, 'docs/reports');
const PACKAGE_SMOKE_JSON = path.join(DOCS_REPORTS, 'parent-atlas-package-smoke.json');
const PACKAGE_SMOKE_MD = path.join(DOCS_REPORTS, 'parent-atlas-package-smoke.md');
const WIREFLOW_JSON = path.join(DOCS_REPORTS, 'parent-atlas-downstream-wireup.json');
const WIREFLOW_MD = path.join(DOCS_REPORTS, 'parent-atlas-downstream-wireup.md');

const REQUIRED_EXPORTS = [
  'extractPacketIdentityFromRow',
  'validatePacketIdentityFromRow',
  'verifyPacketIdentityConsistency',
  'createEnvelopeFromRow',
  'buildSummaryContext',
  'makeGemma4SummaryPacket',
  'makeChrom97Packet',
  'toNdjsonLine',
  'PacketValidator',
  'loadRepoEnv',
  'resolveRedisConfig',
  'resolveDatabaseUrl',
  'createQdrantAdapter',
  'createNeo4jAdapter',
  'createPostgresAdapter',
];

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeJson(filePath, data) {
  ensureDir(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function writeMarkdown(filePath, markdown) {
  ensureDir(filePath);
  fs.writeFileSync(filePath, markdown.endsWith('\n') ? markdown : `${markdown}\n`, 'utf8');
}

function renderSmokeMarkdown(report) {
  const lines = [
    '# Parent Atlas Package Smoke',
    '',
    `- status: ${report.status}`,
    `- generated_at: ${report.generatedAt}`,
    `- package_root: ${report.packageRoot}`,
    `- dist_entry: ${report.distEntry}`,
    `- import_mode: clean-process Node ESM`,
    `- required_exports_checked: ${report.requiredExports.length}`,
    `- missing_exports: ${report.missingExports.length}`,
    '',
    '## Evidence',
    '',
    `- smoke_command: ${report.smokeCommand}`,
    `- package_json: ${report.packageJsonPath}`,
  ];

  if (report.missingExports.length > 0) {
    lines.push('', '## Missing Exports', '', ...report.missingExports.map((name) => `- ${name}`));
  }

  return lines.join('\n');
}

function renderWireupMarkdown(report) {
  const lines = [
    '# Parent Atlas Downstream Wire-up',
    '',
    `- status: ${report.status}`,
    `- generated_at: ${report.generatedAt}`,
    `- host: ${report.runtime.host}`,
    `- staging_workspace: ${report.runtime.stagingWorkspace}`,
    `- canonical_truth: ${report.runtime.canonicalTruth}`,
    `- derived_mirror: ${report.runtime.derivedMirror}`,
    `- container_stack: ${report.runtime.containerStack.join(' -> ')}`,
    `- package_smoke_report: ${report.packageSmokeReport}`,
    '',
    '## Service Contract',
    '',
  ];

  for (const [name, service] of Object.entries(report.services)) {
    lines.push(
      `- ${name}: ${service.url} (${service.transport}, port ${service.port})`,
    );
  }

  return lines.join('\n');
}

export function buildPackageSmokeReport(pkg, { packageRoot = PACKAGE_ROOT, distEntry = PACKAGE_DIST } = {}) {
  const missingExports = REQUIRED_EXPORTS.filter((name) => typeof pkg?.[name] !== 'function');
  const status = missingExports.length === 0 ? 'PASS' : 'FAIL';
  return {
    generatedAt: new Date().toISOString(),
    status,
    packageRoot,
    distEntry,
    packageJsonPath: path.join(packageRoot, 'package.json'),
    smokeCommand: 'node packages/parent-atlas/test/canonical-surface.test.mjs',
    importMode: 'clean-process-node-esm',
    requiredExports: REQUIRED_EXPORTS,
    missingExports,
    exportCount: pkg ? Object.keys(pkg).length : 0,
  };
}

export function buildDownstreamWireupReport({
  packageSmoke,
  serviceContract,
  runtime = {
    host: 'WSL2',
    stagingWorkspace: '.tmp',
    canonicalTruth: 'postgres',
    derivedMirror: 'qdrant',
    containerStack: ['postgres', 'qdrant'],
  },
  smokeReportPath = PACKAGE_SMOKE_JSON,
} = {}) {
  const status = packageSmoke?.status === 'PASS' ? 'READY_FOR_DOWNSTREAM_IMPORT' : 'BLOCKED';
  const defaults = serviceContract?.canonicalServiceProbeDefaults ?? {};
  return {
    generatedAt: new Date().toISOString(),
    status,
    runtime,
    packageSmokeReport: smokeReportPath,
    packageSmokeStatus: packageSmoke?.status ?? 'UNKNOWN',
    services: {
      postgres: defaults.postgres ?? { url: 'postgresql://127.0.0.1:5434/legal_ai_db', port: 5434, transport: 'postgres' },
      qdrant: defaults.qdrant ?? { url: 'http://127.0.0.1:6333', port: 6333, transport: 'http' },
      neo4j: defaults.neo4j ?? { url: 'http://127.0.0.1:7474', port: 7474, transport: 'http' },
      'redis-valkey': defaults['redis-valkey'] ?? { url: 'redis://127.0.0.1:6379', port: 6379, transport: 'redis' },
    },
  };
}

async function loadPackageSurface() {
  if (!fs.existsSync(PACKAGE_DIST)) {
    throw new Error(`Missing built package dist: ${PACKAGE_DIST}`);
  }
  return import(pathToFileURL(PACKAGE_DIST).href);
}

async function loadServiceContractSurface() {
  if (!fs.existsSync(SERVICE_CONTRACT_DIST)) {
    throw new Error(`Missing built service contract dist: ${SERVICE_CONTRACT_DIST}`);
  }
  return import(pathToFileURL(SERVICE_CONTRACT_DIST).href);
}

export async function main(argv = process.argv.slice(2)) {
  const dryRun = argv.includes('--dry-run');
  const smokeOnly = argv.includes('--smoke-only');

  const pkg = await loadPackageSurface();
  const serviceContract = await loadServiceContractSurface();

  const packageSmoke = buildPackageSmokeReport(pkg);
  const downstreamWireup = buildDownstreamWireupReport({ packageSmoke, serviceContract });

  if (!dryRun) {
    writeJson(PACKAGE_SMOKE_JSON, packageSmoke);
    writeMarkdown(PACKAGE_SMOKE_MD, renderSmokeMarkdown(packageSmoke));
    if (!smokeOnly) {
      writeJson(WIREFLOW_JSON, downstreamWireup);
      writeMarkdown(WIREFLOW_MD, renderWireupMarkdown(downstreamWireup));
    }
  }

  if (argv.includes('--stdout')) {
    process.stdout.write(`${JSON.stringify(smokeOnly ? packageSmoke : downstreamWireup, null, 2)}\n`);
  }

  const exitStatus = packageSmoke.status === 'PASS' ? 0 : 1;
  if (!smokeOnly && downstreamWireup.status !== 'READY_FOR_DOWNSTREAM_IMPORT') return 1;
  return exitStatus;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => process.exit(code)).catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });
}
