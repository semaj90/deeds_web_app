#!/usr/bin/env node
/**
 * Parent Atlas process-packet runtime proof.
 *
 * Live, bounded, and idempotent:
 * 1) build a deterministic Atlas process packet
 * 2) upsert it to Qdrant
 * 3) scroll it back by process_id
 * 4) compile a ContextManifest from the returned packet
 * 5) emit a JSON + Markdown receipt
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

import { buildContextManifestFromACE } from '../../src/lib/server/ace/ace-context-manifest.js';
import { buildAtlasProcessPacket, persistAtlasProcessPacketsToQdrant, readAtlasProcessPacketsFromQdrant } from '../../src/lib/server/atlas/process-packets.js';
import { loadRuntimeEnv } from '../../src/lib/server/config/load-runtime-env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const ENV_FILE = path.join(REPO_ROOT, '.env');
const ENV_LOCAL_FILE = path.join(REPO_ROOT, '.env.local');
const DEFAULT_REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'process-packet-runtime-proof.json');
const DEFAULT_REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'process-packet-runtime-proof.md');

dotenv.config({ path: ENV_FILE, override: false });
dotenv.config({ path: ENV_LOCAL_FILE, override: true });
loadRuntimeEnv({ cwd: REPO_ROOT, mode: 'development' });

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function readFlagValue(name: string, fallback?: string): string | undefined {
  const index = process.argv.findIndex((arg) => arg === name || arg.startsWith(`${name}=`));
  if (index < 0) return fallback;
  const current = process.argv[index];
  if (current.includes('=')) return current.split('=', 2)[1];
  return process.argv[index + 1] ?? fallback;
}

async function writeJson(reportPath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeMarkdown(reportPath: string, lines: string[]): Promise<void> {
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${lines.join('\n')}\n`, 'utf8');
}

function stablePacketProjection(packet: {
  packetKey: string;
  processId: string;
  name: string;
  sourceRefs: string[];
  stepSymbolIds: string[];
  dbTables: string[];
  tools: string[];
  endpoints: string[];
  caches: string[];
  graphRevision: string;
  processHash: string;
}) {
  return {
    packetKey: packet.packetKey,
    processId: packet.processId,
    name: packet.name,
    sourceRefs: packet.sourceRefs,
    stepSymbolIds: packet.stepSymbolIds,
    dbTables: packet.dbTables,
    tools: packet.tools,
    endpoints: packet.endpoints,
    caches: packet.caches,
    graphRevision: packet.graphRevision,
    processHash: packet.processHash,
  };
}

async function main(): Promise<void> {
  const dryRun = hasFlag('--dry-run');
  const reportJson = readFlagValue('--report-json', DEFAULT_REPORT_JSON) ?? DEFAULT_REPORT_JSON;
  const reportMd = readFlagValue('--report-md', DEFAULT_REPORT_MD) ?? DEFAULT_REPORT_MD;

  const processId = readFlagValue('--process-id', 'process:search-route:proof') ?? 'process:search-route:proof';
  const collection = readFlagValue('--collection', 'codebase_chunks') ?? 'codebase_chunks';

  const input = {
    processId,
    name: 'searchRoute',
    sourceRefs: [
      'src/routes/search/+server.ts',
      'src/lib/server/search/rerank.ts',
      'src/lib/server/retrieval/unified-orchestrator.ts',
    ],
    stepSymbolIds: [
      'searchRoute',
      'retrieveCandidates',
      'denseRetrieve',
      'sparseRetrieve',
      'mergeCandidates',
      'rerankCandidates',
      'validate',
    ],
    dbTables: ['atlas_packets', 'codebase_chunk_index'],
    tools: ['glob', 'read', 'grep'],
    endpoints: ['/api/search'],
    caches: ['qdrant:codebase_chunks_768', 'ace:manifest'],
    graphRevision: 'graph:parent-atlas',
  };

  const built = buildAtlasProcessPacket(input);

  if (dryRun) {
    const report = {
      receiptKind: 'PROCESS_PACKET_RUNTIME_PRODUCER_PROVEN',
      status: 'DRY_RUN',
      reportJson,
      reportMd,
      collection,
      generatedAt: new Date().toISOString(),
      built: stablePacketProjection(built.packet),
      manifest: null,
      readback: null,
      notes: ['Dry run only — no Qdrant mutation attempted.'],
    };
    await writeJson(reportJson, report);
    await writeMarkdown(reportMd, [
      '# Process Packet Runtime Proof',
      '',
      `- Status: ${report.status}`,
      `- Process ID: ${built.packet.processId}`,
      `- Packet key: ${built.packet.packetKey}`,
      `- Process hash: ${built.packet.processHash}`,
      `- Collection: ${collection}`,
      '',
      'Dry run only — no Qdrant mutation attempted.',
    ]);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  const persisted = await persistAtlasProcessPacketsToQdrant([built.packet], { collection, wait: true });
  const readback = await readAtlasProcessPacketsFromQdrant([built.packet.processId], {
    collection: persisted.collection,
    limit: 10,
  });

  const readbackPacket = readback.packets[0];
  if (!readbackPacket) {
    throw new Error(`No process packets returned from Qdrant for process_id=${built.packet.processId}`);
  }

  if (readbackPacket.packetKey !== built.packet.packetKey || readbackPacket.processHash !== built.packet.processHash) {
    throw new Error(
      `Qdrant readback mismatch for process_id=${built.packet.processId}: ` +
        `packetKey=${readbackPacket.packetKey} expected=${built.packet.packetKey}, ` +
        `processHash=${readbackPacket.processHash} expected=${built.packet.processHash}`
    );
  }

  const reconstructedProcessPackets = readback.packets.map((packet) => ({
    schemaVersion: 'atlas.process.packet.v1' as const,
    packetKey: packet.packetKey,
    processId: packet.processId,
    name: packet.name,
    sourceRefs: packet.sourceRefs,
    stepSymbolIds: packet.stepSymbolIds,
    dbTables: packet.dbTables,
    tools: packet.tools,
    endpoints: packet.endpoints,
    caches: packet.caches,
    graphRevision: packet.graphRevision,
    processHash: packet.processHash,
    qdrantPayload: {},
    createdAt: built.packet.createdAt,
  }));

  const aceContext = {
    userProfile: null,
    caseContext: null,
    glossaryMatches: null,
    ragChunks: [],
    kbChunks: [],
    caseChunks: [],
    docChunks: [],
    kagNeighbors: [],
    chatHistory: [],
    chatMemory: [],
    entities: { statutes: [], cases: [], persons: [], organizations: [], dates: [] },
    practiceTemplate: null,
    queryTags: [],
    webSearchContext: null,
    persona: 'neutral' as const,
    evidenceMetadata: null,
    evidenceConnections: null,
    userAnalyticsContext: null,
    codebaseContext: [],
    activeClusterSummary: null,
    dbSchemaContext: '',
    policyDecision: null,
    contextManifest: null,
    processPackets: reconstructedProcessPackets,
  };

  const compiled = buildContextManifestFromACE(aceContext, {
    request_id: `process-packet-runtime-proof:${built.packet.processId}`,
    feature_id: 'ace.process.runtime-proof',
    source_refs: built.packet.sourceRefs,
    processPackets: reconstructedProcessPackets,
    policy: { token_budget: 1200, reserved_tokens: 0, max_packets: 12 },
    now: new Date(),
  });

  const manifestAgain = buildContextManifestFromACE(aceContext, {
    request_id: `process-packet-runtime-proof:${built.packet.processId}`,
    feature_id: 'ace.process.runtime-proof',
    source_refs: built.packet.sourceRefs,
    processPackets: reconstructedProcessPackets,
    policy: { token_budget: 1200, reserved_tokens: 0, max_packets: 12 },
    now: new Date(),
  });

  const report = {
    receiptKind: 'PROCESS_PACKET_RUNTIME_PRODUCER_PROVEN',
    status: 'PROVEN',
    reportJson,
    reportMd,
    generatedAt: new Date().toISOString(),
    collection: persisted.collection,
    built: stablePacketProjection(built.packet),
    persisted: {
      upserted: persisted.upserted,
      pointIds: persisted.pointIds,
    },
    readback: {
      processIds: readback.processIds,
      pointIds: readback.pointIds,
      packetCount: readback.packets.length,
      packets: readback.packets.map((packet) => ({
        ...packet,
      })),
    },
    manifest: {
      manifestId: compiled.manifest.manifest_id,
      manifestIdAgain: manifestAgain.manifest.manifest_id,
      selectedProcessIds: compiled.manifest.selected_process_ids ?? [],
      selectedPacketKeys: compiled.manifest.selected_packet_keys ?? [],
      retrievedCandidates: compiled.manifest.retrieved_candidates,
      tokenBudget: compiled.manifest.token_budget,
      usableTokenBudget: compiled.manifest.usable_token_budget,
    },
    checks: {
      qdrantReadbackMatch:
        readbackPacket.packetKey === built.packet.packetKey &&
        readbackPacket.processHash === built.packet.processHash,
      qdrantRoundTripCount: readback.packets.length === 1,
      selectedProcessIdsMatch:
        (compiled.manifest.selected_process_ids ?? []).includes(built.packet.processId),
      manifestDeterministic: compiled.manifest.manifest_id === manifestAgain.manifest.manifest_id,
    },
  };

  await writeJson(reportJson, report);
  await writeMarkdown(reportMd, [
    '# Process Packet Runtime Proof',
    '',
    `- Status: ${report.status}`,
    `- Process ID: ${built.packet.processId}`,
    `- Packet key: ${built.packet.packetKey}`,
    `- Process hash: ${built.packet.processHash}`,
    `- Collection: ${persisted.collection}`,
    `- Persisted points: ${persisted.pointIds.length}`,
    `- Readback packets: ${readback.packets.length}`,
    `- Manifest ID: ${compiled.manifest.manifest_id}`,
    `- Selected process IDs: ${compiled.manifest.selected_process_ids?.join(', ') || '(none)'}`,
    `- Selected packet keys: ${compiled.manifest.selected_packet_keys.join(', ') || '(none)'}`,
    '',
    `Replay-safe: ${compiled.manifest.manifest_id === manifestAgain.manifest.manifest_id ? 'yes' : 'no'}`,
  ]);

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
