import { promises as fs } from 'fs';
import path from 'path';
import type { TaskSemanticPacketBundle } from './semantic-packets';

export type TaskSemanticPacketTuple = readonly [
  workspaceId: string | null,
  taskId: number,
  packetId: string,
  qdrantPointId: string,
  sourceRef: string,
  featureId: string | null,
  queueId: string | null,
  clusterId: string | null,
  centroidId: string | null,
  status: TaskSemanticPacketBundle['status'],
  nextAction: string,
  summary: string,
  confidence: number,
  relatedFeatureIds: readonly string[],
  relatedTaskIds: readonly string[],
  relatedFilePaths: readonly string[],
  semanticPath: readonly string[],
  observedAt: string
];

export interface TaskSemanticPacketSnapshot {
  version: 1;
  createdAt: string;
  lane: 'semantic_packet';
  tuple: TaskSemanticPacketTuple;
  packet: {
    workspaceId: string | null;
    taskId: number;
    packetId: string;
    qdrantPointId: string;
    sourceRef: string;
    featureId: string | null;
    queueId: string | null;
    clusterId: string | null;
    centroidId: string | null;
    status: TaskSemanticPacketBundle['status'];
    nextAction: string;
    summary: string;
    confidence: number;
    relatedFeatureIds: string[];
    relatedTaskIds: string[];
    relatedFilePaths: string[];
    semanticPath: string[];
    observedAt: string;
  };
}

const REPORTS_DIR = path.resolve(process.cwd(), 'docs', 'reports');
const JSON_PATH = path.join(REPORTS_DIR, 'task-semantic-packet-latest.json');
const MD_PATH = path.join(REPORTS_DIR, 'task-semantic-packet-latest.md');

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? Array.from(new Set(value.map((item) => normalizeString(item)).filter(Boolean)))
    : [];
}

function normalizeNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildTaskSemanticPacketTuple(bundle: TaskSemanticPacketBundle): TaskSemanticPacketTuple {
  const packetRow = (bundle.packetRow ?? {}) as Record<string, unknown>;
  const sourceRef = normalizeString(packetRow.source_ref) || `${bundle.workspaceId ?? 'workspace:default'}:task:${bundle.taskId}`;
  const observedAt = normalizeString(packetRow.observed_at) || new Date().toISOString();
  const semanticPath = normalizeStringArray(packetRow.semantic_path);

  return [
    bundle.workspaceId,
    bundle.taskId,
    bundle.packetId,
    bundle.qdrantPointId,
    sourceRef,
    bundle.featureId,
    bundle.queueId ?? null,
    bundle.clusterId,
    bundle.centroidId,
    bundle.status,
    bundle.nextAction,
    bundle.summary,
    normalizeNumber(bundle.confidence),
    [...bundle.relatedFeatureIds],
    [...bundle.relatedTaskIds],
    [...bundle.relatedFilePaths],
    semanticPath,
    observedAt,
  ] as const;
}

export function buildTaskSemanticPacketSnapshot(bundle: TaskSemanticPacketBundle): TaskSemanticPacketSnapshot {
  const tuple = buildTaskSemanticPacketTuple(bundle);
  const observedAt = tuple[17];

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    lane: 'semantic_packet',
    tuple,
    packet: {
      workspaceId: tuple[0],
      taskId: tuple[1],
      packetId: tuple[2],
      qdrantPointId: tuple[3],
      sourceRef: tuple[4],
      featureId: tuple[5],
      queueId: tuple[6],
      clusterId: tuple[7],
      centroidId: tuple[8],
      status: tuple[9],
      nextAction: tuple[10],
      summary: tuple[11],
      confidence: tuple[12],
      relatedFeatureIds: [...tuple[13]],
      relatedTaskIds: [...tuple[14]],
      relatedFilePaths: [...tuple[15]],
      semanticPath: [...tuple[16]],
      observedAt,
    },
  };
}

export async function writeTaskSemanticPacketSnapshot(bundle: TaskSemanticPacketBundle) {
  const snapshot = buildTaskSemanticPacketSnapshot(bundle);
  await fs.mkdir(REPORTS_DIR, { recursive: true });
  await fs.writeFile(JSON_PATH, JSON.stringify(snapshot, null, 2), 'utf8');
  await fs.writeFile(
    MD_PATH,
    [
      '# Task Semantic Packet Snapshot',
      '',
      `- taskId: ${snapshot.packet.taskId}`,
      `- packetId: ${snapshot.packet.packetId}`,
      `- qdrantPointId: ${snapshot.packet.qdrantPointId}`,
      `- sourceRef: ${snapshot.packet.sourceRef}`,
      `- featureId: ${snapshot.packet.featureId ?? ''}`,
      `- queueId: ${snapshot.packet.queueId ?? ''}`,
      `- clusterId: ${snapshot.packet.clusterId ?? ''}`,
      `- centroidId: ${snapshot.packet.centroidId ?? ''}`,
      `- status: ${snapshot.packet.status}`,
      `- nextAction: ${snapshot.packet.nextAction}`,
      `- summary: ${snapshot.packet.summary}`,
      `- confidence: ${snapshot.packet.confidence}`,
      `- observedAt: ${snapshot.packet.observedAt}`,
      '',
      '## Tuple',
      '',
      '```json',
      JSON.stringify(snapshot.tuple, null, 2),
      '```',
      '',
    ].join('\n'),
    'utf8'
  );
  return { jsonPath: JSON_PATH, mdPath: MD_PATH, snapshot };
}
