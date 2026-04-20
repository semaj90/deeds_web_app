/**
 * Unified GPU Audit Orchestrator
 *
 * Merges Neo4j GDS outputs + LibTorch similarity/clustering + Qdrant vectors
 * into a single codebase understanding report, persisted to Postgres JSONB.
 *
 * Pipeline:
 *   1. Neo4j: Project code graph → PageRank (central files) + community detection (subsystems)
 *   2. Qdrant: Fetch codebase_chunks_768 vectors for top graph-central files
 *   3. LibTorch: GPU similarity matrix (near-duplicate detection) + K-means clustering
 *   4. Merge: Combine graph structure + embedding semantics into unified report
 *   5. Persist: Write JSONB report to Postgres ai_reports table
 *   6. Cache: CouchDB for expensive intermediate results (1hr TTL)
 *
 * Architecture:
 *   Neo4j (graph structure) → Qdrant (embeddings) → LibTorch CUDA (matrix ops)
 *   → Postgres JSONB (durable reports) → CouchDB (cache, optional)
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  analyzeGraph,
  type GraphAnalysisRequest,
  type GraphAnalysisResult,
} from '$lib/server/graph/gpu-graph-analysis.js';
import {
  graphSimilarity,
  graphSimilarityHalf,
  clusterEmbeddings,
  isCudaAvailable,
  getCudaMemoryInfo,
  type SimilarityResult,
  type ClusterResult,
} from '$lib/server/gpu/libtorch-bridge.js';
import { ENV } from '$lib/server/env.server.js';
import { db } from '$lib/server/db/client';
import { codebaseAuditReports } from '$lib/server/db/schema-postgres.js';
import { eq, desc } from 'drizzle-orm';

const execFileAsync = promisify(execFile);

// ── Types ──────────────────────────────────────────────────────────────

export interface AuditRequest {
  caseId?: string;
  userId: string;
  /** Max nodes from Neo4j graph traversal */
  maxNodes?: number;
  /** K-means cluster count */
  clusterCount?: number;
  /** Max codebase vectors from Qdrant */
  maxVectors?: number;
  /** Similarity threshold for near-duplicate detection */
  dupThreshold?: number;
  /** Use FP16 for 2x VRAM savings on large batches */
  halfPrecision?: boolean;
  /** Skip graph phase (Neo4j) — useful if Neo4j is unavailable */
  skipGraph?: boolean;
  /** Skip codebase phase (Qdrant vectors) */
  skipCodebase?: boolean;
  /** Include contract checks for Zod, MCP schemas, gRPC, and protobuf */
  includeContracts?: boolean;
}

export interface ContractAuditSection {
  files: string[];
  notes: string[];
}

export interface ContractAudit {
  typeSafety: ContractAuditSection;
  toolContracts: ContractAuditSection;
  protobuf: ContractAuditSection;
  routing: ContractAuditSection;
  timingMs: number;
}

export interface CentralFile {
  nodeId: string;
  label: string;
  title: string;
  pageRankScore: number;
  communityId?: number;
}

export interface CommunityInfo {
  communityId: number;
  size: number;
  topMembers: Array<{ nodeId: string; label: string; title: string }>;
  /** Inferred subsystem name from dominant labels/titles */
  inferredName: string;
}

export interface NearDuplicate {
  similarity: number;
  a: { path: string; symbol: string; kind: string };
  b: { path: string; symbol: string; kind: string };
}

export interface CodeCluster {
  clusterId: number;
  size: number;
  topPaths: string[];
  members: Array<{ path: string; symbol: string; kind: string }>;
}

export interface AuditReport {
  id?: string;
  reportType: 'gpu_codebase_audit';
  caseId?: string;
  createdBy: string;

  // Graph structure analysis (Neo4j)
  centralFiles: CentralFile[];
  communities: CommunityInfo[];

  // Semantic analysis (Qdrant + LibTorch)
  nearDuplicates: NearDuplicate[];
  codeClusters: CodeCluster[];

  // Merged insights
  orphanRoutes: string[];
  eventHubs: string[];
  apiCycles: string[];

  // Metrics
  gpu: {
    cuda: boolean;
    freeMB: number;
    totalMB: number;
  };
  stats: {
    graphNodeCount: number;
    graphEdgeCount: number;
    vectorCount: number;
    vectorDimension: number;
    clusterCount: number;
    duplicatePairCount: number;
  };
  contracts?: ContractAudit;
  timing: {
    graphMs: number;
    vectorFetchMs: number;
    similarityMs: number;
    clusteringMs: number;
    contractMs: number;
    totalMs: number;
  };
}

// ── Qdrant Vector Fetcher ─────────────────────────────────────────────

interface QdrantPoint {
  id: string | number;
  payload?: Record<string, unknown>;
  vector?: number[] | Record<string, number[]>;
}

async function scrollCodebaseVectors(limit: number): Promise<QdrantPoint[]> {
  const points: QdrantPoint[] = [];
  let offset: string | number | null = null;
  const batchSize = Math.min(limit, 100);

  while (points.length < limit) {
    const body: Record<string, unknown> = {
      limit: batchSize,
      with_payload: true,
      with_vector: true,
    };
    if (offset !== null) body.offset = offset;

    try {
      const res = await fetch(`${ENV.QDRANT_URL}/collections/codebase_chunks_768/points/scroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) break;
      const data = await res.json();
      const batch = data.result?.points ?? [];
      if (batch.length === 0) break;

      points.push(...batch);
      offset = data.result?.next_page_offset ?? null;
      if (offset === null) break;
    } catch {
      break;
    }
  }

  return points.slice(0, limit);
}

function extractVector(point: QdrantPoint): number[] | null {
  if (!point.vector) return null;
  if (Array.isArray(point.vector)) return point.vector;
  if (typeof point.vector === 'object') {
    const named = point.vector as Record<string, number[]>;
    return named.content ?? named.dense ?? Object.values(named)[0] ?? null;
  }
  return null;
}

async function rgList(pattern: string, paths: string[]): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('rg', ['-l', '-i', pattern, ...paths], {
      cwd: process.cwd(),
      maxBuffer: 5 * 1024 * 1024,
      timeout: 15_000,
    });

    return [
      ...new Set(
        stdout
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
      ),
    ];
  } catch {
    return [];
  }
}

async function runContractAudit(): Promise<ContractAudit> {
  const start = performance.now();

  const typeSafetyFiles = await rgList('z\\.object|safeParse|z\\.enum|zod', [
    'src/lib/server',
    'src/routes/api',
    'src/mcp',
  ]);
  const toolContractFiles = await rgList('inputSchema|outputSchema|TOOL_ARG_SCHEMAS|tool schema', [
    'src/lib/server',
    'src/routes/api',
    'src/mcp',
  ]);
  const grpcFiles = await rgList(
    '\\bgrpc\\b|@grpc|generateEmbeddingsWithTags|runKMeans|scoreAttention',
    ['src/lib/server']
  );
  const protoFiles = await rgList('syntax = "proto3"|^message\\s+|^service\\s+', ['proto']);
  const routingFiles = await rgList(
    'OLLAMA_CHAT_MODEL|OLLAMA_VLM_MODEL|VLM_MODELS\\.(legal|vision)|GEMMA4_MODEL',
    ['src/lib/server', 'src/routes/api']
  );

  const notes: string[] = [];
  if (typeSafetyFiles.length === 0)
    notes.push('No Zod-backed validation found in the audited surfaces.');
  if (toolContractFiles.length === 0) notes.push('No explicit tool input/output schemas found.');
  if (grpcFiles.length === 0) notes.push('No gRPC transport surfaces found.');
  if (protoFiles.length === 0) notes.push('No protobuf definitions found.');
  if (routingFiles.length === 0) notes.push('No explicit model-routing constants found.');

  return {
    typeSafety: {
      files: typeSafetyFiles.slice(0, 12),
      notes: [`Zod/safeParse coverage in ${typeSafetyFiles.length} files.`],
    },
    toolContracts: {
      files: toolContractFiles.slice(0, 12),
      notes: [`Agent/tool contract schemas in ${toolContractFiles.length} files.`],
    },
    protobuf: {
      files: [...new Set([...protoFiles, ...grpcFiles])].slice(0, 12),
      notes: [`Protobuf definitions: ${protoFiles.length}`, `gRPC surfaces: ${grpcFiles.length}`],
    },
    routing: {
      files: routingFiles.slice(0, 12),
      notes: [`Model-routing references in ${routingFiles.length} files.`],
    },
    timingMs: Math.round(performance.now() - start),
  };
}

// ── Community Naming Heuristic ────────────────────────────────────────

function inferCommunityName(members: Array<{ label: string; title: string }>): string {
  if (members.length === 0) return 'unknown';

  // Count labels
  const labelCounts = new Map<string, number>();
  for (const m of members) {
    labelCounts.set(m.label, (labelCounts.get(m.label) ?? 0) + 1);
  }
  const dominantLabel = [...labelCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'mixed';

  // Infer from titles: look for common path prefixes or keywords
  const titles = members.map((m) => m.title.toLowerCase());
  const keywords = [
    'auth',
    'evidence',
    'case',
    'graph',
    'embed',
    'search',
    'chat',
    'admin',
    'api',
    'db',
    'gpu',
    'cache',
    'queue',
  ];
  for (const kw of keywords) {
    const matching = titles.filter((t) => t.includes(kw));
    if (matching.length >= members.length * 0.4) {
      return `${kw}-${dominantLabel.toLowerCase()}`;
    }
  }

  return `${dominantLabel.toLowerCase()}-cluster`;
}

// ── Main Orchestrator ─────────────────────────────────────────────────

export async function runGpuAudit(req: AuditRequest): Promise<AuditReport> {
  const totalStart = performance.now();

  const report: AuditReport = {
    reportType: 'gpu_codebase_audit',
    caseId: req.caseId,
    createdBy: req.userId,
    centralFiles: [],
    communities: [],
    nearDuplicates: [],
    codeClusters: [],
    orphanRoutes: [],
    eventHubs: [],
    apiCycles: [],
    gpu: { cuda: false, freeMB: 0, totalMB: 0 },
    stats: {
      graphNodeCount: 0,
      graphEdgeCount: 0,
      vectorCount: 0,
      vectorDimension: 0,
      clusterCount: 0,
      duplicatePairCount: 0,
    },
    contracts: undefined,
    timing: {
      graphMs: 0,
      vectorFetchMs: 0,
      similarityMs: 0,
      clusteringMs: 0,
      contractMs: 0,
      totalMs: 0,
    },
  };

  // GPU status
  report.gpu.cuda = isCudaAvailable();
  const mem = getCudaMemoryInfo();
  report.gpu.freeMB = mem.freeMB;
  report.gpu.totalMB = mem.totalMB;

  // ── Phase 1: Graph Analysis (Neo4j) ──────────────────────────────

  if (!req.skipGraph) {
    const graphStart = performance.now();
    try {
      const graphReq: GraphAnalysisRequest = {
        caseId: req.caseId,
        includePageRank: true,
        includeCommunities: true,
        includeGpuClusters: false,
        includeSimilarityMatrix: false,
        maxNodes: req.maxNodes ?? 500,
      };

      const graphResult: GraphAnalysisResult = await analyzeGraph(graphReq);

      report.stats.graphNodeCount = graphResult.nodeCount;
      report.stats.graphEdgeCount = graphResult.edgeCount;

      // Extract central files (top 30 by PageRank)
      if (graphResult.pageRank) {
        report.centralFiles = graphResult.pageRank.slice(0, 30).map((pr) => ({
          nodeId: pr.nodeId,
          label: pr.label,
          title: pr.title,
          pageRankScore: pr.score,
        }));
      }

      // Extract communities
      if (graphResult.communities) {
        report.communities = graphResult.communities.slice(0, 20).map((c) => ({
          communityId: c.communityId,
          size: c.size,
          topMembers: c.members.slice(0, 10),
          inferredName: inferCommunityName(c.members),
        }));

        // Cross-reference central files with communities
        for (const cf of report.centralFiles) {
          const comm = graphResult.communities.find((c) =>
            c.members.some((m) => m.nodeId === cf.nodeId)
          );
          if (comm) cf.communityId = comm.communityId;
        }
      }
    } catch (err) {
      console.warn('[gpu-audit] Graph phase failed:', (err as Error)?.message);
    }
    report.timing.graphMs = Math.round(performance.now() - graphStart);
  }

  // ── Phase 2: Codebase Vector Analysis (Qdrant + LibTorch) ────────

  if (!req.skipCodebase) {
    const fetchStart = performance.now();
    const maxVectors = req.maxVectors ?? 500;
    const points = await scrollCodebaseVectors(maxVectors);
    report.timing.vectorFetchMs = Math.round(performance.now() - fetchStart);

    if (points.length >= 2) {
      const embeddings: number[][] = [];
      const metadata: Array<{ path: string; symbol: string; kind: string }> = [];

      for (const point of points) {
        const vec = extractVector(point);
        if (!vec || vec.length === 0) continue;
        embeddings.push(vec);
        metadata.push({
          path:
            (point.payload?.relativePath as string) ?? (point.payload?.path as string) ?? 'unknown',
          symbol: (point.payload?.symbol as string) ?? 'unknown',
          kind: (point.payload?.kind as string) ?? 'unknown',
        });
      }

      report.stats.vectorCount = embeddings.length;
      report.stats.vectorDimension = embeddings[0]?.length ?? 0;

      // ── 2a: GPU Similarity Matrix (near-duplicate detection) ────

      if (embeddings.length >= 2) {
        const simStart = performance.now();
        try {
          const maxMatrixSize = req.halfPrecision ? 1000 : 500;
          const matrixEmbeddings = embeddings.slice(0, maxMatrixSize);
          const matrixMeta = metadata.slice(0, maxMatrixSize);

          const simResult: SimilarityResult = req.halfPrecision
            ? ((await graphSimilarityHalf(matrixEmbeddings)) as unknown as SimilarityResult)
            : await graphSimilarity(matrixEmbeddings);

          const threshold = req.dupThreshold ?? 0.92;
          const n = simResult.matrix.length;
          for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
              const sim = simResult.matrix[i][j];
              if (sim >= threshold) {
                report.nearDuplicates.push({
                  similarity: Math.round(sim * 10000) / 10000,
                  a: matrixMeta[i],
                  b: matrixMeta[j],
                });
              }
            }
          }
          report.nearDuplicates.sort((a, b) => b.similarity - a.similarity);
          report.nearDuplicates = report.nearDuplicates.slice(0, 100);
          report.stats.duplicatePairCount = report.nearDuplicates.length;
        } catch (err) {
          console.warn('[gpu-audit] Similarity matrix failed:', (err as Error)?.message);
        }
        report.timing.similarityMs = Math.round(performance.now() - simStart);
      }

      // ── 2b: GPU K-Means Clustering (code groupings) ─────────────

      if (embeddings.length >= 2) {
        const clusterStart = performance.now();
        try {
          const k = req.clusterCount ?? Math.min(12, Math.ceil(embeddings.length / 20));
          const clusterResult: ClusterResult = await clusterEmbeddings(embeddings, k);

          // Build cluster info
          const clusterMap = new Map<number, CodeCluster>();
          for (let i = 0; i < clusterResult.assignments.length; i++) {
            const cId = clusterResult.assignments[i];
            if (!clusterMap.has(cId)) {
              clusterMap.set(cId, { clusterId: cId, size: 0, topPaths: [], members: [] });
            }
            const cluster = clusterMap.get(cId)!;
            cluster.size++;
            cluster.members.push(metadata[i]);
          }

          // Compute top paths per cluster
          for (const cluster of clusterMap.values()) {
            const dirCounts = new Map<string, number>();
            for (const m of cluster.members) {
              const dir = m.path.split('/').slice(0, -1).join('/');
              dirCounts.set(dir, (dirCounts.get(dir) ?? 0) + 1);
            }
            cluster.topPaths = [...dirCounts.entries()]
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5)
              .map(([dir, count]) => `${dir} (${count})`);
            // Limit members for response size
            cluster.members = cluster.members.slice(0, 15);
          }

          report.codeClusters = [...clusterMap.values()].sort((a, b) => b.size - a.size);
          report.stats.clusterCount = report.codeClusters.length;
        } catch (err) {
          console.warn('[gpu-audit] K-Means clustering failed:', (err as Error)?.message);
        }
        report.timing.clusteringMs = Math.round(performance.now() - clusterStart);
      }
    }
  }

  if (req.includeContracts ?? true) {
    const contractStart = performance.now();
    try {
      report.contracts = await runContractAudit();
    } catch (err) {
      console.warn('[gpu-audit] Contract audit failed:', (err as Error)?.message);
    }
    report.timing.contractMs = Math.round(performance.now() - contractStart);
  }

  report.timing.totalMs = Math.round(performance.now() - totalStart);
  return report;
}

// ── Persist Report to Postgres ────────────────────────────────────────

export async function persistAuditReport(report: AuditReport): Promise<string> {
  const cuda = isCudaAvailable();
  const mem = getCudaMemoryInfo();

  const [row] = await db
    .insert(codebaseAuditReports)
    .values({
      caseId: report.caseId ?? null,
      createdBy: report.createdBy || null,
      reportType: 'codebase',
      cudaAvailable: cuda,
      gpuMemoryMb: mem.totalMB,
      gpuMemoryFreeMb: mem.freeMB,
      codebaseAnalysis: {
        centralFiles: report.centralFiles,
        communities: report.communities,
        nearDuplicates: report.nearDuplicates,
        codeClusters: report.codeClusters,
        orphanRoutes: report.orphanRoutes,
        eventHubs: report.eventHubs,
        apiCycles: report.apiCycles,
        contracts: report.contracts,
        stats: report.stats,
      },
      durationMs: report.timing.totalMs,
      graphDurationMs: report.timing.graphMs,
      codebaseDurationMs: report.timing.similarityMs + report.timing.clusteringMs,
      status: 'completed',
    })
    .returning({ id: codebaseAuditReports.id });

  return row.id;
}

// ── Retrieve Latest Report ────────────────────────────────────────────

export async function getLatestAuditReport(caseId?: string): Promise<AuditReport | null> {
  const query = caseId
    ? db
        .select()
        .from(codebaseAuditReports)
        .where(eq(codebaseAuditReports.caseId, caseId!))
        .orderBy(desc(codebaseAuditReports.createdAt))
        .limit(1)
    : db.select().from(codebaseAuditReports).orderBy(desc(codebaseAuditReports.createdAt)).limit(1);

  const rows = await query;
  if (!rows[0]?.codebaseAnalysis) return null;

  try {
    const analysis = rows[0].codebaseAnalysis as Record<string, unknown>;
    return {
      reportType: 'gpu_codebase_audit',
      caseId: rows[0].caseId ?? undefined,
      createdBy: rows[0].createdBy ?? '',
      centralFiles: analysis.centralFiles ?? [],
      communities: analysis.communities ?? [],
      nearDuplicates: analysis.nearDuplicates ?? [],
      codeClusters: analysis.codeClusters ?? [],
      orphanRoutes: analysis.orphanRoutes ?? [],
      eventHubs: analysis.eventHubs ?? [],
      apiCycles: analysis.apiCycles ?? [],
      contracts: analysis.contracts ?? undefined,
      gpu: {
        cuda: rows[0].cudaAvailable ?? false,
        freeMB: rows[0].gpuMemoryFreeMb ?? 0,
        totalMB: rows[0].gpuMemoryMb ?? 0,
      },
      stats: analysis.stats ?? {},
      timing: {
        graphMs: rows[0].graphDurationMs ?? 0,
        vectorFetchMs: 0,
        similarityMs: 0,
        clusteringMs: rows[0].codebaseDurationMs ?? 0,
        contractMs: 0,
        totalMs: rows[0].durationMs ?? 0,
      },
    } as AuditReport;
  } catch {
    return null;
  }
}
