#!/usr/bin/env node

/** Read-only startup topology ownership and namespace audit. */
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outputPath = path.join(root, 'docs/reports/rabbitmq-topology-ownership-v1.json');
const read = (relative) => readFileSync(path.join(root, relative), 'utf8');
const files = {
  hook: 'sveltekit-frontend/src/hooks.server.ts',
  integration: 'sveltekit-frontend/src/lib/server/queue/rabbitmq-xstate-integration.ts',
  legacy: 'sveltekit-frontend/src/lib/server/queue/rabbitmq-manager-fixed.ts',
  eventTopology: 'sveltekit-frontend/src/lib/server/queue/topology.ts',
  eventWorker: 'sveltekit-frontend/src/lib/server/workers/code-evidence-projection-worker.ts',
  coreTopology: 'packages/atlas-core/src/queue/topology.ts',
};
const source = Object.fromEntries(Object.entries(files).map(([key, value]) => [key, read(value)]));

function objectValues(text, name) {
  const match = text.match(new RegExp(`(?:readonly\\s+)?${name}\\s*=\\s*\\{([\\s\\S]*?)\\n\\s*\\}(?:\\s+as const)?;`));
  if (!match) throw new Error(`Could not locate ${name} object`);
  return [...match[1].matchAll(/^\s*[A-Za-z_$][\w$]*:\s*'([^']+)'/gm)].map((entry) => entry[1]);
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function findCoreTopologyImports() {
  const expression = String.raw`(?:from\s*['"][^'"]*atlas-core[^'"]*queue/topology|import\(['"][^'"]*atlas-core[^'"]*queue/topology)`;
  try {
    const output = execFileSync('rg', [
      '-n', '--hidden', '--glob', '*.ts', '--glob', '*.mts', '--glob', '*.js', '--glob', '*.mjs',
      '--glob', '!**/node_modules/**', '--glob', '!**/.svelte-kit/**', '--glob', '!**/build/**',
      expression, 'packages', 'sveltekit-frontend/src', 'services', 'scripts',
    ], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return output.split(/\r?\n/).filter(Boolean);
  } catch (error) {
    if (error?.status === 1) return [];
    throw error;
  }
}

const legacyExchanges = objectValues(source.legacy, 'exchanges');
const legacyQueues = objectValues(source.legacy, 'queues');
const eventExchanges = objectValues(source.eventTopology, 'EXCHANGES');
const eventQueues = objectValues(source.eventTopology, 'QUEUES');
const coreExchanges = objectValues(source.coreTopology, 'EXCHANGES');
const coreQueues = objectValues(source.coreTopology, 'QUEUES');
const intersection = (left, right) => sortedUnique(left.filter((value) => right.includes(value)));
const coreTopologyImportMatches = findCoreTopologyImports();

const startup = {
  legacyManager: source.hook.includes('startRabbitMQPipeline') &&
    source.integration.includes('rabbitmq.initialize()') &&
    source.legacy.includes('private async setupInfrastructure()'),
  eventFabric: source.hook.includes('startEventFabricWorker()') &&
    source.eventWorker.includes('await declareTopology(channel as any)') &&
    source.eventWorker.includes('export async function startEventFabricWorker'),
};
const eventExchangeSemantics = {
  separateTaskAndEventExchanges: source.eventTopology.includes('never share a queue with real WorkCommand dispatch'),
  taskExchangeType: /assertExchange\(EXCHANGES\.tasks,\s*'topic'/.test(source.eventTopology),
  eventExchangeType: /assertExchange\(EXCHANGES\.events,\s*'topic'/.test(source.eventTopology),
};
const staleCoreConflict = {
  sharedExchanges: intersection(eventExchanges, coreExchanges),
  sharedQueues: intersection(eventQueues, coreQueues),
  appDlxType: /assertExchange\(EXCHANGES\.dlx,\s*'direct'/.test(source.eventTopology) ? 'direct' : null,
  coreDlxType: /assertExchange\(EXCHANGES\.dlx,\s*'fanout'/.test(source.coreTopology) ? 'fanout' : null,
  currentSourceCallerFound: coreTopologyImportMatches.length > 0,
  callerSearchMatches: coreTopologyImportMatches,
  callerCensusScope: ['packages', 'sveltekit-frontend/src', 'services', 'scripts'],
};

const activeExchangeOverlap = intersection(legacyExchanges, eventExchanges);
const activeQueueOverlap = intersection(legacyQueues, eventQueues);
const assertions = {
  bothStartupPathsVerified: startup.legacyManager && startup.eventFabric,
  eventFabricSemanticsVerified: Object.values(eventExchangeSemantics).every(Boolean),
  activeExchangeNamespacesDisjoint: activeExchangeOverlap.length === 0,
  activeQueueNamespacesDisjoint: activeQueueOverlap.length === 0,
  unreferencedCoreDlxConflictVisible: !staleCoreConflict.currentSourceCallerFound &&
    staleCoreConflict.appDlxType === 'direct' && staleCoreConflict.coreDlxType === 'fanout',
};

const report = {
  schema: 'atlas.rabbitmq-topology-ownership.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_SOURCE_AUDIT',
  status: Object.values(assertions).every(Boolean)
    ? 'TWO_ACTIVE_DISJOINT_STARTUP_DOMAINS; UNUSED_CORE_COPY_CONFLICTS_IF_ACTIVATED'
    : 'REVIEW_REQUIRED',
  owners: {
    legacyWorkload: {
      files: [files.hook, files.integration, files.legacy],
      startupPath: 'hooks.server.ts -> startRabbitMQPipeline -> RabbitMQManager.initialize -> setupInfrastructure',
      exchanges: sortedUnique(legacyExchanges),
      queues: sortedUnique(legacyQueues),
      purpose: 'Existing document/cache/vector/analytics workload queues using simple-name queue and exchange taxonomy.',
    },
    eventFabric: {
      files: [files.hook, files.eventWorker, files.eventTopology],
      startupPath: 'hooks.server.ts -> startEventFabricWorker -> declareTopology',
      exchanges: sortedUnique(eventExchanges),
      queues: sortedUnique(eventQueues),
      purpose: 'Versioned atlas task and event topology; event traffic is explicitly separate from WorkCommand dispatch.',
    },
    atlasCoreCopy: {
      files: [files.coreTopology],
      exchanges: sortedUnique(coreExchanges),
      queues: sortedUnique(coreQueues),
      status: 'UNREFERENCED_SOURCE_OWNER; DO NOT ACTIVATE WITHOUT RECONCILING DIVERGENT DECLARATION CONTRACTS',
      conflict: staleCoreConflict,
    },
  },
  findings: {
    activeStartupDeclarationCount: Object.values(startup).filter(Boolean).length,
    activeExchangeOverlap,
    activeQueueOverlap,
    eventExchangeSemantics,
    assertions,
  },
  canonicalAuthority: false,
  writesPerformed: false,
  brokerTouched: false,
};
report.evidenceChecksum = `sha256:${crypto.createHash('sha256').update(JSON.stringify(report)).digest('hex')}`;
mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, assertions, activeExchangeOverlap, activeQueueOverlap, reportPath: outputPath }, null, 2));
if (report.status === 'REVIEW_REQUIRED') process.exitCode = 2;
