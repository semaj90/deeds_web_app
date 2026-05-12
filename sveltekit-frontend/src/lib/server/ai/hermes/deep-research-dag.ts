import { StateGraph, START, END } from '@langchain/langgraph';
import { v4 as uuidv4 } from 'uuid';
import { db } from '$lib/server/db/client';
import { kagDagRuns, kagDagNodes } from '$lib/server/db/schema';
import { sql } from 'drizzle-orm';

/**
 * ResearchState — The shared memory state of the LangGraph DAG.
 */
export type ResearchState = {
  query: string;
  userId?: number;
  sessionId?: string;
  caseId?: string;
  runId: string;
  parentTaskId?: string;
  
  runtime?: any;
  plan?: any;
  
  qdrantHits?: any[];
  couchRows?: any[];
  neo4jGraph?: any;
  importGraph?: any;
  clusterLenses?: any[];
  cudaPrefilter?: any;
  
  contextPacket?: any;
  answer?: string;
  
  error?: string;
};

// ── Nodes ───────────────────────────────────────────────────────────────────

/**
 * hermesPlanNode — Uses Hermes to decide the execution plan based on the query.
 */
async function hermesPlanNode(state: ResearchState) {
  try {
    // In a real implementation, this would call the Hermes LLM to generate a plan.
    // For now, we simulate the plan based on the query mode.
    const res = await fetch('http://127.0.0.1:5173/api/ai/hermes-plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: state.query,
        mode: 'analyze',
        signals: {
          hasEncoded64: true,
          hasClusterSummaries: true,
          hasNeo4j: true,
          hasCouchViews: true
        }
      })
    });

    const plan = await res.json();
    
    await logNode(state.runId, 'plan', 'planner', { query: state.query }, plan);
    
    return { plan };
  } catch (e: any) {
    return { error: `Plan failed: ${e.message}` };
  }
}

/**
 * runtimeTruthNode — Checks the current inference availability.
 */
async function runtimeTruthNode(state: ResearchState) {
  try {
    const res = await fetch('http://127.0.0.1:5173/api/health/inference');
    const runtime = await res.json();
    
    await logNode(state.runId, 'runtime', 'system', {}, runtime);
    
    return { runtime };
  } catch (e: any) {
    return { error: `Runtime check failed: ${e.message}` };
  }
}

/**
 * qdrantNode — Executes dense vector search.
 */
async function qdrantNode(state: ResearchState) {
  // Simulate Qdrant search
  const results = []; 
  await logNode(state.runId, 'qdrant', 'retrieval', { query: state.query }, { count: results.length });
  return { qdrantHits: results };
}

/**
 * couchNode — Executes MapReduce view lookups.
 */
async function couchNode(state: ResearchState) {
  // Simulate CouchDB lookup
  const rows = [];
  await logNode(state.runId, 'couchdb', 'retrieval', { query: state.query }, { count: rows.length });
  return { couchRows: rows };
}

/**
 * neo4jNode — Expands knowledge graph relationships.
 */
async function neo4jNode(state: ResearchState) {
  // Simulate Neo4j expansion
  const graph = {};
  await logNode(state.runId, 'neo4j', 'retrieval', { query: state.query }, graph);
  return { neo4jGraph: graph };
}

/**
 * deepImportNode — Traces import/dependency chains.
 */
async function deepImportNode(state: ResearchState) {
  const graph = {};
  await logNode(state.runId, 'deepImport', 'retrieval', { query: state.query }, graph);
  return { importGraph: graph };
}

/**
 * clusterLensNode — Maps query to topological clusters.
 */
async function clusterLensNode(state: ResearchState) {
  const lenses = [];
  await logNode(state.runId, 'clusters', 'retrieval', { query: state.query }, { count: lenses.length });
  return { clusterLenses: lenses };
}

/**
 * cudaTopologyPrefilterNode — GPU-accelerated pre-filtering of retrieval results.
 */
async function cudaTopologyPrefilterNode(state: ResearchState) {
  const filter = {};
  await logNode(state.runId, 'cudaPrefilter', 'system', { query: state.query }, filter);
  return { cudaPrefilter: filter };
}

/**
 * contextPackerNode — Assembles the token-aware context packet.
 */
async function contextPackerNode(state: ResearchState) {
  const packet = {
    query: state.query,
    qdrantHits: state.qdrantHits ?? [],
    couchRows: state.couchRows ?? [],
    neo4jGraph: state.neo4jGraph ?? {},
    importGraph: state.importGraph ?? {},
    clusterLenses: state.clusterLenses ?? []
  };
  
  await logNode(state.runId, 'pack', 'synthesis', {}, { size: JSON.stringify(packet).length });
  
  return { contextPacket: packet };
}

/**
 * gemmaComposerNode — Final response generation.
 */
async function gemmaComposerNode(state: ResearchState) {
  // In a real implementation, this calls /api/chat with the context packet.
  const answer = "Final synthesized answer based on gathered evidence.";
  
  await logNode(state.runId, 'compose', 'synthesis', { packetSize: JSON.stringify(state.contextPacket).length }, { answer: answer.slice(0, 100) });
  
  return { answer };
}

// ── Utils ────────────────────────────────────────────────────────────────────

async function logNode(runId: string, nodeKey: string, nodeType: string, input: any, output: any) {
  await db.insert(kagDagNodes).values({
    runId,
    nodeKey,
    nodeType,
    input,
    output,
    status: 'completed',
    finishedAt: new Date()
  }).catch(e => console.error(`Failed to log node ${nodeKey}:`, e));
}

// ── Graph Definition ────────────────────────────────────────────────────────

export function buildResearchDag() {
  const graph = new StateGraph<ResearchState>({
    channels: {
      query: null,
      userId: null,
      sessionId: null,
      caseId: null,
      runId: null,
      parentTaskId: null,
      runtime: null,
      plan: null,
      qdrantHits: null,
      couchRows: null,
      neo4jGraph: null,
      importGraph: null,
      clusterLenses: null,
      cudaPrefilter: null,
      contextPacket: null,
      answer: null,
      error: null
    }
  });

  graph.addNode('plan', hermesPlanNode);
  graph.addNode('runtime', runtimeTruthNode);
  graph.addNode('qdrant', qdrantNode);
  graph.addNode('couchdb', couchNode);
  graph.addNode('neo4j', neo4jNode);
  graph.addNode('deepImport', deepImportNode);
  graph.addNode('clusters', clusterLensNode);
  graph.addNode('cudaPrefilter', cudaTopologyPrefilterNode);
  graph.addNode('pack', contextPackerNode);
  graph.addNode('compose', gemmaComposerNode);

  graph.addEdge(START, 'plan');
  graph.addEdge('plan', 'runtime');

  // Parallel branch from runtime
  graph.addEdge('runtime', 'qdrant');
  graph.addEdge('runtime', 'couchdb');
  graph.addEdge('runtime', 'neo4j');
  graph.addEdge('runtime', 'deepImport');
  graph.addEdge('runtime', 'clusters');
  graph.addEdge('runtime', 'cudaPrefilter');

  // Re-join at packer
  graph.addEdge('qdrant', 'pack');
  graph.addEdge('couchdb', 'pack');
  graph.addEdge('neo4j', 'pack');
  graph.addEdge('deepImport', 'pack');
  graph.addEdge('clusters', 'pack');
  graph.addEdge('cudaPrefilter', 'pack');

  graph.addEdge('pack', 'compose');
  graph.addEdge('compose', END);

  return graph.compile();
}

/**
 * Entry point for executing the research DAG.
 */
export async function executeDeepResearch(params: {
  query: string;
  userId?: number;
  sessionId?: string;
  caseId?: string;
  parentTaskId?: string;
}) {
  const runId = uuidv4();
  
  // Initialize run
  await db.insert(kagDagRuns).values({
    id: runId,
    query: params.query,
    queryHash: sql`md5(${params.query})`,
    status: 'running',
    model: 'hermes-langgraph-dag',
    metadata: { parentTaskId: params.parentTaskId }
  });

  const dag = buildResearchDag();
  const initialState: ResearchState = {
    ...params,
    runId,
    qdrantHits: [],
    couchRows: [],
    clusterLenses: []
  };

  const finalState = await dag.invoke(initialState);

  // Finalize run
  await db.update(kagDagRuns)
    .set({ 
      status: finalState.error ? 'failed' : 'completed',
      finalAnswer: finalState.answer,
      finishedAt: new Date()
    })
    .where(sql`${kagDagRuns.id} = ${runId}`);

  return finalState;
}
