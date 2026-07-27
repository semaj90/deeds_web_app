import fs from 'node:fs';
import path from 'node:path';

import { tracedQuery } from '$lib/server/db/client.js';

export interface ParentAtlasWorkstationSnapshot {
  generatedAt: string;
  tables: Record<string, number | null>;
  metrics: {
    packetSummaries: number;
    summaryLayersPopulated: number;
    missingPacketRegistryRows: number;
  };
  status: {
    canonicalSpine: 'READY' | 'NEEDS_REBUILD';
    summaries: 'STARTED' | 'EMPTY';
    summaryLayers: 'STARTED' | 'EMPTY';
    mirrors: 'READY_FOR_MIRROR_REFRESH' | 'WAIT_FOR_SUMMARY_BATCH';
  };
  laneHealth: {
    simdjsonVendorExists: boolean | null;
    nodeAddonExists: boolean | null;
    seedsExist: boolean | null;
    seedsStale: boolean | null;
  };
  nextCommands: string[];
  nextActions: string[];
}

const TABLES = [
  'atlas_packets',
  'atlas_packet_registry',
  'atlas_summary_layers',
  'parent_atlas_documents',
  'atlas_feature_envelopes',
] as const;

function repoRoot(): string {
  return path.resolve(process.cwd(), '..');
}

function safeReadJson(filePath: string): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildStatus(tables: Record<string, number | null>, metrics: ParentAtlasWorkstationSnapshot['metrics']) {
  const packets = tables.atlas_packets ?? 0;
  const registry = tables.atlas_packet_registry ?? 0;
  const summaryLayers = tables.atlas_summary_layers ?? 0;
  const packetSummaries = metrics.packetSummaries ?? 0;

  return {
    canonicalSpine: packets > 0 && registry === packets ? 'READY' : 'NEEDS_REBUILD',
    summaries: packetSummaries > 0 ? 'STARTED' : 'EMPTY',
    summaryLayers: summaryLayers > 0 ? 'STARTED' : 'EMPTY',
    mirrors: packetSummaries > 100 ? 'READY_FOR_MIRROR_REFRESH' : 'WAIT_FOR_SUMMARY_BATCH',
  } as const;
}

function buildNextCommands(status: ParentAtlasWorkstationSnapshot['status']): string[] {
  const commands = ['npm run atlas:workstation:status'];
  if (status.summaries === 'EMPTY' || status.summaryLayers === 'EMPTY') {
    commands.push('npm run atlas:workstation:summaries:100');
    commands.push('npm run atlas:workstation:status');
  }
  if (status.mirrors === 'READY_FOR_MIRROR_REFRESH') {
    commands.push('npm run atlas:feature-set:alignment:smoke:audit');
    commands.push('npm run atlas:qdrant:parity');
    commands.push('npm run atlas:bitfrost-semantic-cache:audit');
  }
  return commands;
}

function buildNextActions(snapshot: Omit<ParentAtlasWorkstationSnapshot, 'nextCommands' | 'nextActions'>): string[] {
  const actions: string[] = [];

  if (snapshot.status.canonicalSpine !== 'READY') {
    actions.push('Rebuild the Parent Atlas packet spine before trusting downstream MCP mirrors.');
  }
  if (snapshot.status.summaries === 'EMPTY' || snapshot.status.summaryLayers === 'EMPTY') {
    actions.push('Promote chunk summaries into atlas_summary_layers before relying on mirror-backed retrieval tools.');
  }
  if (snapshot.status.mirrors !== 'READY_FOR_MIRROR_REFRESH') {
    actions.push('Delay Qdrant/Redis/Neo4j refresh work until canonical summary coverage is intentionally advanced.');
  } else {
    actions.push('Refresh mirror lanes from the canonical Postgres summary spine, then rerun payload parity and cache audits.');
  }
  if (snapshot.laneHealth.simdjsonVendorExists === false) {
    actions.push('Native simdjson vendor files are missing; keep JSON.parse fallback paths and avoid promoting parser-dependent claims.');
  }
  if (snapshot.laneHealth.seedsExist === false) {
    actions.push('Generate cartridge seeds before expecting seed-driven recommendation tools to return useful dense context.');
  } else if (snapshot.laneHealth.seedsStale) {
    actions.push('Regenerate stale cartridge seeds so workstation-backed recommendations reflect the current corpus.');
  }

  return actions;
}

async function tableExists(tableName: string): Promise<boolean> {
  const result = await tracedQuery<{ rows: Array<{ exists: boolean }> }>(
    'atlas.workstation.table_exists',
    'SELECT to_regclass($1) IS NOT NULL AS exists',
    [`public.${tableName}`]
  );
  return Boolean(result.rows?.[0]?.exists);
}

async function countRows(tableName: string): Promise<number | null> {
  if (!(await tableExists(tableName))) return null;
  const result = await tracedQuery<{ rows: Array<{ count: string | number }> }>(
    'atlas.workstation.count_rows',
    `SELECT count(*)::bigint AS count FROM ${tableName}`,
    []
  );
  return toNumber(result.rows?.[0]?.count ?? 0);
}

export async function getParentAtlasWorkstationSnapshot(): Promise<ParentAtlasWorkstationSnapshot> {
  const counts = Object.fromEntries(
    await Promise.all(
      TABLES.map(async (tableName) => [tableName, await countRows(tableName)] as const)
    )
  ) as Record<string, number | null>;

  const packetSummaries =
    counts.atlas_packets === null
      ? 0
      : toNumber(
          (
            await tracedQuery<{ rows: Array<{ value: string | number }> }>(
              'atlas.workstation.packet_summaries',
              `SELECT count(*) FILTER (WHERE summary IS NOT NULL AND summary <> '') AS value FROM atlas_packets`,
              []
            )
          ).rows?.[0]?.value ?? 0
        );

  const summaryLayersPopulated =
    counts.atlas_summary_layers === null
      ? 0
      : toNumber(
          (
            await tracedQuery<{ rows: Array<{ value: string | number }> }>(
              'atlas.workstation.summary_layers_populated',
              `SELECT count(*) FILTER (WHERE COALESCE(summary, summary_text, '') <> '') AS value FROM atlas_summary_layers`,
              []
            )
          ).rows?.[0]?.value ?? 0
        );

  const missingPacketRegistryRows =
    counts.atlas_packets === null || counts.atlas_packet_registry === null
      ? 0
      : toNumber(
          (
            await tracedQuery<{ rows: Array<{ value: string | number }> }>(
              'atlas.workstation.missing_registry_rows',
              `
                SELECT count(*) AS value
                FROM atlas_packets p
                LEFT JOIN atlas_packet_registry r ON r.packet_key = p.packet_key
                WHERE r.packet_key IS NULL
              `,
              []
            )
          ).rows?.[0]?.value ?? 0
        );

  const metrics = {
    packetSummaries,
    summaryLayersPopulated,
    missingPacketRegistryRows,
  };
  const status = buildStatus(counts, metrics);

  const laneHealthJson = safeReadJson(path.join(repoRoot(), '.tmp', 'atlas-lane-health-loop.json'));
  const laneHealth = {
    simdjsonVendorExists:
      typeof laneHealthJson?.cuda === 'object' && laneHealthJson.cuda && 'simdjsonVendorExists' in laneHealthJson.cuda
        ? Boolean((laneHealthJson.cuda as Record<string, unknown>).simdjsonVendorExists)
        : null,
    nodeAddonExists:
      typeof laneHealthJson?.cuda === 'object' && laneHealthJson.cuda && 'nodeAddonExists' in laneHealthJson.cuda
        ? Boolean((laneHealthJson.cuda as Record<string, unknown>).nodeAddonExists)
        : null,
    seedsExist:
      typeof laneHealthJson?.seeds === 'object' && laneHealthJson.seeds && 'exists' in laneHealthJson.seeds
        ? Boolean((laneHealthJson.seeds as Record<string, unknown>).exists)
        : null,
    seedsStale:
      typeof laneHealthJson?.seeds === 'object' && laneHealthJson.seeds && 'stale' in laneHealthJson.seeds
        ? Boolean((laneHealthJson.seeds as Record<string, unknown>).stale)
        : null,
  };

  const baseSnapshot = {
    generatedAt: new Date().toISOString(),
    tables: counts,
    metrics,
    status,
    laneHealth,
  };

  return {
    ...baseSnapshot,
    nextCommands: buildNextCommands(status),
    nextActions: buildNextActions(baseSnapshot),
  };
}
