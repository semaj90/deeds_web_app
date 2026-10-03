import fs from 'node:fs';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

type JsonRecord = Record<string, any>;

const ROOT = path.resolve(process.cwd(), '..');
const REPORTS = path.join(ROOT, 'docs', 'reports');
const MAX_ITEMS = 32;

function readJson(filePath: string): JsonRecord | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as JsonRecord;
  } catch {
    return null;
  }
}

function latestCensus(): JsonRecord | null {
  const runRoot = path.join(REPORTS, 'openspec-evidence');
  const runs = fs.existsSync(runRoot)
    ? fs.readdirSync(runRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
    : [];
  return readJson(runs.length ? path.join(runRoot, runs.at(-1)!, 'census-v1.json') : path.join(REPORTS, 'openspec-evidence-portfolio-census-v2.json'));
}

function loadFabric() {
  return {
    census: latestCensus(),
    graph: readJson(path.join(REPORTS, 'openspec-dependency-graph-v1.json')),
    bindings: readJson(path.join(REPORTS, 'openspec-task-evidence-bindings-v1.json')),
    receipts: readJson(path.join(REPORTS, 'openspec-receipt-binding-v1.json')),
    cards: readJson(path.join(REPORTS, 'openspec-evidence-cards-v1.json')),
    context: readJson(path.join(REPORTS, 'openspec-evidence-context-manifest-v1.json')),
  };
}

function result(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
}

function bounded<T>(items: T[], limit?: number) {
  return items.slice(0, Math.min(MAX_ITEMS, Math.max(1, limit ?? MAX_ITEMS)));
}

function cardView(card: JsonRecord) {
  return {
    sourceRef: card.taskRef,
    ConceptID: card.taskId,
    ConfidenceScore: card.proofState === 'PROVEN' ? 1 : card.proofState === 'PARTIAL' ? 0.5 : 0,
    ContextBlob: card.contextBlob,
    proofState: card.proofState,
    blockers: card.blockers,
    dependencies: card.dependencies,
    receiptRefs: card.receiptRefs,
    workspaceRevision: card.workspaceRevision,
    sourceRevision: card.sourceRevision,
    checksum: card.checksum,
  };
}

export function registerOpenSpecEvidenceTools(server: McpServer) {
  server.registerTool('openspec.census', {
    description: 'Read the latest revision-bound OpenSpec census summary without changing claims or evidence.',
    inputSchema: z.object({}),
  }, async () => {
    const fabric = loadFabric();
    return result({
      schema: 'atlas.openspec-mcp-census.v1',
      source: fabric.census?.report_path ?? null,
      workspaceRevision: fabric.census?.source?.workspaceRevision ?? null,
      censusStatus: fabric.census?.censusStatus ?? fabric.census?.summary?.censusStatus ?? 'UNAVAILABLE',
      summary: fabric.census?.summary ?? null,
      canonicalAuthority: false,
      writesPerformed: false,
    });
  });

  server.registerTool('openspec.task', {
    description: 'Read one bounded OpenSpec task identity and its compiled evidence card.',
    inputSchema: z.object({ taskId: z.string().min(1).max(512) }),
  }, async ({ taskId }) => {
    const fabric = loadFabric();
    const card = fabric.cards?.cards?.find((item: JsonRecord) => item.taskId === taskId);
    const task = fabric.census?.tasks?.find((item: JsonRecord) => item.canonicalTaskRef === taskId || item.taskId === taskId || item.taskKey === taskId);
    return result({ schema: 'atlas.openspec-mcp-task.v1', task: task ? { taskRef: task.taskRef, taskId: task.canonicalTaskRef ?? task.taskId, claim: task.taskText, declaredChecked: task.declaredChecked, taskIdStatus: task.taskIdStatus } : null, card: card ? cardView(card) : null, writesPerformed: false });
  });

  server.registerTool('openspec.frontier', {
    description: 'Read a bounded frontier of unresolved OpenSpec claims; no task state is changed.',
    inputSchema: z.object({ limit: z.number().int().min(1).max(MAX_ITEMS).optional() }),
  }, async ({ limit }) => {
    const fabric = loadFabric();
    const frontier = (fabric.cards?.cards ?? []).filter((card: JsonRecord) => card.proofState !== 'PROVEN').map(cardView);
    return result({ schema: 'atlas.openspec-mcp-frontier.v1', workspaceRevision: fabric.cards?.source?.workspaceRevision ?? null, cards: bounded(frontier, limit), totalUnproven: frontier.length, writesPerformed: false });
  });

  server.registerTool('evidence.card', {
    description: 'Read one compact EvidenceCard by canonical task identity.',
    inputSchema: z.object({ taskId: z.string().min(1).max(512) }),
  }, async ({ taskId }) => {
    const fabric = loadFabric();
    const card = fabric.cards?.cards?.find((item: JsonRecord) => item.taskId === taskId);
    return result({ schema: 'atlas.openspec-mcp-evidence-card.v1', card: card ? cardView(card) : null, proofAuthority: 'RECEIPT_ONLY', writesPerformed: false });
  });

  server.registerTool('evidence.receipt', {
    description: 'Read bounded receipt-binding evidence for one evidence ID.',
    inputSchema: z.object({ evidenceId: z.string().min(1).max(512) }),
  }, async ({ evidenceId }) => {
    const fabric = loadFabric();
    const matches = (fabric.receipts?.bindings ?? []).filter((binding: JsonRecord) => binding.evidenceId === evidenceId);
    return result({ schema: 'atlas.openspec-mcp-evidence-receipt.v1', evidenceId, bindings: bounded(matches), canonicalAuthority: false, writesPerformed: false });
  });

  server.registerTool('evidence.contradictions', {
    description: 'Read bounded task contradictions from predicate resolution.',
    inputSchema: z.object({ limit: z.number().int().min(1).max(MAX_ITEMS).optional() }),
  }, async ({ limit }) => {
    const fabric = loadFabric();
    const contradictions = (fabric.bindings?.bindings ?? []).filter((binding: JsonRecord) => binding.contradictions?.length).map((binding: JsonRecord) => ({ taskId: binding.taskId, taskRef: binding.taskRef, contradictions: binding.contradictions }));
    return result({ schema: 'atlas.openspec-mcp-contradictions.v1', contradictions: bounded(contradictions, limit), total: contradictions.length, writesPerformed: false });
  });

  server.registerTool('graph.dependencies', {
    description: 'Read bounded dependency edges for one canonical OpenSpec task.',
    inputSchema: z.object({ taskId: z.string().min(1).max(512), limit: z.number().int().min(1).max(MAX_ITEMS).optional() }),
  }, async ({ taskId, limit }) => {
    const fabric = loadFabric();
    const edges = (fabric.graph?.edges ?? []).filter((edge: JsonRecord) => edge.fromTaskId === taskId || edge.toTaskId === taskId || edge.fromTaskKey === taskId || edge.toTaskKey === taskId);
    return result({ schema: 'atlas.openspec-mcp-dependencies.v1', taskId, edges: bounded(edges, limit), cycleCount: fabric.graph?.summary?.cycleCount ?? null, writesPerformed: false });
  });

  server.registerTool('search.evidence', {
    description: 'Search compact EvidenceCards by bounded lexical matching; raw hits are not returned.',
    inputSchema: z.object({ query: z.string().trim().min(1).max(512), limit: z.number().int().min(1).max(MAX_ITEMS).optional() }),
  }, async ({ query, limit }) => {
    const fabric = loadFabric();
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const matches = (fabric.cards?.cards ?? []).filter((card: JsonRecord) => {
      const haystack = `${card.claim ?? ''} ${card.contextBlob ?? ''} ${card.taskRef ?? ''}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    }).map(cardView);
    return result({ schema: 'atlas.openspec-mcp-search-evidence.v1', query, cards: bounded(matches, limit), total: matches.length, writesPerformed: false });
  });

  server.registerTool('context.build', {
    description: 'Build a bounded EvidenceCard context selection only when the retrieval gate is proven; never writes Redis.',
    inputSchema: z.object({ taskIds: z.array(z.string().min(1).max(512)).min(1).max(MAX_ITEMS) }),
  }, async ({ taskIds }) => {
    const fabric = loadFabric();
    const retrievalReady = fabric.context?.status === 'CONTEXT_MANIFEST_READY_NO_REDIS_WRITE';
    const cards = (fabric.cards?.cards ?? []).filter((card: JsonRecord) => taskIds.includes(card.taskId)).map(cardView);
    return result({ schema: 'atlas.openspec-mcp-context-build.v1', status: retrievalReady ? 'CONTEXT_MANIFEST_READY_NO_REDIS_WRITE' : 'BLOCKED_RETRIEVAL_GATE', cards: retrievalReady ? cards : [], missingTaskIds: taskIds.filter((taskId) => !cards.some((card) => card.ConceptID === taskId)), writesPerformed: false });
  });
}
