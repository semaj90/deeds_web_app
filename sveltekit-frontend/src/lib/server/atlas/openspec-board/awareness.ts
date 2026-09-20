import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveOpenSpecReportDirectory } from './report-reader';

export interface AtlasAwarenessGateV1 {
  key: string;
  state: string;
  evidence: string[];
  blockers: string[];
  details?: Record<string, unknown>;
}

export interface AtlasAwarenessSnapshotV2 {
  schema: 'atlas.openspec-awareness.v2';
  reports: Record<string, boolean>;
  progress: {
    taskNodes: number;
    taskDependencyEdges: number;
    taskFileLinks: number;
    directoryFiles: number;
    directoryEdges: number;
    kmeansClusters: number;
    labeledFiles: number;
    fileLabels: number;
    fanoutFiles: number;
    fanoutReferences: number;
    fanoutUnresolved: number;
    progression: string[];
  };
  readiness: {
    summary: Record<string, number | boolean>;
    gates: AtlasAwarenessGateV1[];
  };
  fileGraph: {
    summary: Record<string, number>;
    topDirectories: Array<{ directory: string; files: number; inboundEdges: number; outboundEdges: number; topics: Array<{ topic: string; count: number }> }>;
    directoryEdges: Array<{ from: string; to: string; count: number; relation: string }>;
  };
  clusters: Array<{ clusterId: number; count: number; dominantTopics: Array<{ topic: string; count: number }>; sampleFiles: string[] }>;
  topicIdentities: {
    status: string;
    topicCount: number;
    uniqueTopicIds: number;
    uniqueTitleIds: number;
    canonicalAuthority: boolean;
    writesPerformed: boolean;
  };
  utilityHelpers: {
    status: string;
    helperCount: number;
    waiting: number;
    canonicalAuthority: boolean;
    writesPerformed: boolean;
  };
  tournament: Array<{ taskId: string; deterministicRank: number | null; challengerRank: number | null; rankDelta: number | null }>;
  nextExecutionWave: unknown;
  invariants: string[];
}

async function readJson(reportDirectory: string, name: string): Promise<Record<string, any> | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(reportDirectory, name), 'utf8')) as Record<string, any>;
  } catch {
    return null;
  }
}

function n(value: unknown): number {
  const x = Number(value);
  return Number.isFinite(x) ? x : 0;
}

async function buildAwarenessSnapshot(reportDirectory: string): Promise<AtlasAwarenessSnapshotV2> {
  const [progress, readiness, graph, kmeans, labels, fanout, tournament, topicIdentity, utilityHelpers] = await Promise.all([
    readJson(reportDirectory, 'openspec-progress-audit-v2.json'),
    readJson(reportDirectory, 'atlas-runtime-readiness-v1.json'),
    readJson(reportDirectory, 'openspec-directory-graph-v1.json'),
    readJson(reportDirectory, 'openspec-file-kmeans-v1.json'),
    readJson(reportDirectory, 'openspec-file-labels-v1.json'),
    readJson(reportDirectory, 'openspec-file-task-fanout-v1.json'),
    readJson(reportDirectory, 'openspec-challenger-tournament-v1.json'),
    readJson(reportDirectory, 'topic-identity-readiness-v1.json'),
    readJson(reportDirectory, 'parent-atlas-utility-helper-readiness-v1.json')
  ]);

  const topDirectories = Array.isArray(graph?.directories)
    ? graph.directories.slice(0, 40).map((x: any) => ({
        directory: String(x.directory ?? ''),
        files: n(x.files),
        inboundEdges: n(x.inboundEdges),
        outboundEdges: n(x.outboundEdges),
        topics: Array.isArray(x.topics) ? x.topics.slice(0, 6).map((t: any) => ({ topic: String(t.topic ?? 'other'), count: n(t.count) })) : []
      }))
    : [];

  const gates: AtlasAwarenessGateV1[] = Array.isArray(readiness?.gates)
    ? readiness.gates.map((g: any) => ({
        key: String(g.key ?? 'UNKNOWN'),
        state: String(g.state ?? 'UNPROVEN'),
        evidence: Array.isArray(g.evidence) ? g.evidence.map(String) : [],
        blockers: Array.isArray(g.blockers) ? g.blockers.map(String) : [],
        details: g.details && typeof g.details === 'object' ? g.details : undefined
      }))
    : [];

  return {
    schema: 'atlas.openspec-awareness.v2',
    reports: {
      progress: Boolean(progress),
      readiness: Boolean(readiness),
      directoryGraph: Boolean(graph),
      structuralKMeans: Boolean(kmeans),
    fileLabels: Boolean(labels),
      fileTaskFanout: Boolean(fanout),
      challengerTournament: Boolean(tournament),
      topicIdentities: Boolean(topicIdentity),
      utilityHelpers: Boolean(utilityHelpers)
    },
    progress: {
      taskNodes: n(progress?.summary?.taskNodes),
      taskDependencyEdges: n(progress?.summary?.taskDependencyEdges),
      taskFileLinks: n(progress?.summary?.taskFileLinks),
      directoryFiles: n(progress?.summary?.directoryFiles),
      directoryEdges: n(progress?.summary?.directoryEdges),
      kmeansClusters: n(progress?.summary?.kmeansClusters),
      labeledFiles: n(progress?.summary?.labeledFiles),
      fileLabels: n(progress?.summary?.fileLabels),
      fanoutFiles: n(progress?.summary?.fanoutFiles),
      fanoutReferences: n(progress?.summary?.fanoutReferences),
      fanoutUnresolved: n(progress?.summary?.fanoutUnresolved),
      progression: Array.isArray(progress?.progression) ? progress.progression.map(String) : []
    },
    readiness: {
      summary: readiness?.summary && typeof readiness.summary === 'object' ? readiness.summary : {},
      gates
    },
    fileGraph: {
      summary: graph?.summary && typeof graph.summary === 'object' ? graph.summary : {},
      topDirectories,
      directoryEdges: Array.isArray(graph?.directoryEdges)
        ? graph.directoryEdges.slice(0, 80).map((e: any) => ({ from: String(e.from ?? ''), to: String(e.to ?? ''), count: n(e.count), relation: String(e.relation ?? 'imports') }))
        : []
    },
    clusters: Array.isArray(kmeans?.clusters)
      ? kmeans.clusters.slice(0, 40).map((c: any) => ({
          clusterId: n(c.clusterId),
          count: n(c.count),
          dominantTopics: Array.isArray(c.dominantTopics) ? c.dominantTopics.slice(0, 5).map((t: any) => ({ topic: String(t.topic ?? 'other'), count: n(t.count) })) : [],
          sampleFiles: Array.isArray(c.sampleFiles) ? c.sampleFiles.slice(0, 12).map(String) : []
        }))
      : [],
    topicIdentities: {
      status: String(topicIdentity?.status ?? 'UNPROVEN'),
      topicCount: n(topicIdentity?.summary?.topicCount),
      uniqueTopicIds: n(topicIdentity?.summary?.uniqueTopicIds),
      uniqueTitleIds: n(topicIdentity?.summary?.uniqueTitleIds),
      canonicalAuthority: topicIdentity?.canonicalAuthority === true,
      writesPerformed: topicIdentity?.writesPerformed === true
    },
    utilityHelpers: {
      status: String(utilityHelpers?.status ?? 'UNPROVEN'),
      helperCount: n(utilityHelpers?.helpers?.length),
      waiting: n(utilityHelpers?.helpers?.filter?.((helper: any) => !['PROVEN', 'DERIVED_TOPIC_IDENTITIES_PROVEN', 'DERIVED_CLAIMS_PRESENT'].includes(helper?.state))?.length),
      canonicalAuthority: utilityHelpers?.canonicalAuthority === true,
      writesPerformed: utilityHelpers?.writesPerformed === true
    },
    tournament: Array.isArray(tournament?.comparisons)
      ? tournament.comparisons.slice(0, 100).map((r: any) => ({
          taskId: String(r.taskId ?? ''),
          deterministicRank: r.deterministicRank == null ? null : n(r.deterministicRank),
          challengerRank: r.challengerRank == null ? null : n(r.challengerRank),
          rankDelta: r.rankDelta == null ? null : n(r.rankDelta)
        }))
      : [],
    nextExecutionWave: progress?.nextExecutionWave ?? null,
    invariants: Array.isArray(progress?.invariants) ? progress.invariants.map(String) : []
  };
}

// The awareness inputs include multi-hundred-MB reports (directory graph, file labels, k-means);
// re-parsing them on every page load dominated SSR cost. The snapshot is derived only from these
// files, so it is cached by (directory, name, size, mtime) — a stat per file is cheap, a parse is not.
// Only the small derived snapshot is retained, never the parsed report objects. Advisory read path;
// the JSON receipts stay the authority and nothing is written.
const AWARENESS_REPORT_NAMES = [
  'openspec-progress-audit-v2.json',
  'atlas-runtime-readiness-v1.json',
  'openspec-directory-graph-v1.json',
  'openspec-file-kmeans-v1.json',
  'openspec-file-labels-v1.json',
  'openspec-file-task-fanout-v1.json',
  'openspec-challenger-tournament-v1.json',
  'topic-identity-readiness-v1.json'
  , 'parent-atlas-utility-helper-readiness-v1.json'
] as const;

let awarenessCache: { signature: string; snapshot: AtlasAwarenessSnapshotV2 } | null = null;
let awarenessInflight: { signature: string; promise: Promise<AtlasAwarenessSnapshotV2> } | null = null;

async function awarenessSignature(reportDirectory: string): Promise<string> {
  const parts = await Promise.all(
    AWARENESS_REPORT_NAMES.map(async (name) => {
      try {
        const stat = await fs.stat(path.join(reportDirectory, name));
        return `${name}:${stat.size}:${Math.trunc(stat.mtimeMs)}`;
      } catch {
        return `${name}:absent`;
      }
    })
  );
  return `${reportDirectory}|${parts.join('|')}`;
}

export function resetOpenSpecAwarenessCache(): void {
  awarenessCache = null;
  awarenessInflight = null;
}

export async function readOpenSpecAwarenessSnapshot(): Promise<AtlasAwarenessSnapshotV2> {
  const reportDirectory = await resolveOpenSpecReportDirectory();
  const signature = await awarenessSignature(reportDirectory);
  if (awarenessCache?.signature === signature) return awarenessCache.snapshot;
  // Concurrent loads with the same inputs share one parse instead of each reading ~320 MB.
  if (awarenessInflight?.signature === signature) return awarenessInflight.promise;

  const promise = buildAwarenessSnapshot(reportDirectory).then((snapshot) => {
    if (awarenessInflight?.promise === promise) {
      awarenessCache = { signature, snapshot };
      awarenessInflight = null;
    }
    return snapshot;
  }, (error) => {
    if (awarenessInflight?.promise === promise) awarenessInflight = null;
    throw error;
  });
  awarenessInflight = { signature, promise };
  return promise;
}
