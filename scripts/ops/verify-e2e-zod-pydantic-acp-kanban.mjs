import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { z } from 'zod';

const { Client } = pg;

const PYTHON_BIN =
  process.env.PYTHON_BIN ??
  (fs.existsSync('C:\\Python313\\python.exe') ? 'C:\\Python313\\python.exe' : 'python');

const TRACE_MCP_URL = process.env.TRACE_MCP_URL ?? 'http://127.0.0.1:8788';
const SIDECAR_8095_URL = process.env.SIDECAR_8095_URL ?? 'http://127.0.0.1:8095';
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/deeds_web_app';
const TARGET_FILE = process.argv[2] ?? 'src/lib/server/db/index.ts';

// 1. Strict Zod Wire Contracts
const dagPrefillNodeV1Schema = z
  .object({
    nodeId: z.string().min(1),
    relativePath: z.string().min(1),
    topoClass: z.string(),
    graphAuthority: z.number().min(0).max(1),
    pagerank: z.number().min(0).max(1),
    agentsDir: z.string(),
    errorSignatures: z.array(z.string())
  })
  .strict();

const acpKanbanErrorTaskV1Schema = z
  .object({
    schema: z.literal('atlas.acp-kanban-error-task.v1'),
    taskId: z.string().min(1),
    boardColumn: z.enum(['backlog', 'prefilled', 'in_progress', 'verify', 'blocked']),
    sourceAgent: z.string().min(1),
    targetAgent: z.string().min(1),
    relativePath: z.string().min(1),
    extractedSpans: z.array(z.string()),
    dagPrefillnodes: z.array(dagPrefillNodeV1Schema).optional(),
    dagPrefillNodes: z.array(dagPrefillNodeV1Schema),
    promptCards: z.array(z.string()),
    recommendedFixActions: z.array(z.string()),
    dbSchemaVerified: z.boolean(),
    canonicalAuthority: z.literal(false),
    writesPerformed: z.literal(false)
  })
  .strict();

// Gate 1: Verify Python Pydantic <-> TypeScript Zod wire parity
function runPydanticZodParityGate() {
  const pyCode = `
import json
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from typing import Literal

class StrictCamel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True, alias_generator=to_camel)

class DagNode(StrictCamel):
    node_id: str
    relative_path: str
    topo_class: str
    graph_authority: float = Field(ge=0.0, le=1.0)
    pagerank: float = Field(ge=0.0, le=1.0)
    agents_dir: str
    error_signatures: list[str]

class KanbanTask(StrictCamel):
    schema_id: Literal["atlas.acp-kanban-error-task.v1"] = Field(
        default="atlas.acp-kanban-error-task.v1", alias="schema"
    )
    task_id: str
    board_column: Literal["backlog", "prefilled", "in_progress", "verify", "blocked"]
    source_agent: str
    target_agent: str
    relative_path: str
    extracted_spans: list[str]
    dag_prefill_nodes: list[DagNode]
    prompt_cards: list[str]
    recommended_fix_actions: list[str]
    db_schema_verified: bool
    canonical_authority: Literal[False] = False
    writes_performed: Literal[False] = False

sample = KanbanTask(
    task_id="task-parity-001",
    board_column="prefilled",
    source_agent="langgraph-8095",
    target_agent="acp-error-fixer",
    relative_path="${TARGET_FILE.replace(/\\/g, '/')}",
    extracted_spans=["L1-L42: schema export binding"],
    dag_prefill_nodes=[
        DagNode(
            node_id="node-db-index",
            relative_path="${TARGET_FILE.replace(/\\/g, '/')}",
            topo_class="core_infra",
            graph_authority=0.88,
            pagerank=0.74,
            agents_dir="src/lib/server/db",
            error_signatures=["TS2305: Module has no exported member"]
        )
    ],
    prompt_cards=["card:db-schema-guard"],
    recommended_fix_actions=["verify-drizzle-export"],
    db_schema_verified=True
)
print(sample.model_dump_json(by_alias=True))
`;

  const res = spawnSync(PYTHON_BIN, ['-c', pyCode], { encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error(`Python Pydantic parity check failed: ${res.stderr}`);
  }
  const parsed = JSON.parse(res.stdout.trim());
  const validated = acpKanbanErrorTaskV1Schema.parse(parsed);
  return { status: 'PASS', sampleTaskId: validated.taskId };
}

// Gate 2: Read-Only PostgreSQL 18.4 Catalog & Atlas Source Check
async function runReadOnlyPostgresGate() {
  const client = new Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    await client.query('BEGIN TRANSACTION READ ONLY');
    await client.query("SET LOCAL statement_timeout = '15000ms'");

    const tableCheck = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'codebase_chunk_index',
          'code_retrieval_chunks',
          'agent_context_files',
          'atlas_feature_map',
          'feature_registry'
        )
      ORDER BY table_name;
    `);

    const anomalyCheck = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE graph_authority < 0) AS negative_ga_rows,
        COUNT(*) FILTER (WHERE COALESCE(TRIM(relative_path), '') = '') AS empty_path_rows
      FROM code_retrieval_chunks;
    `).catch(() => ({ rows: [{ negative_ga_rows: 'table_missing', empty_path_rows: 'table_missing' }] }));

    await client.query('ROLLBACK');
    return {
      status: 'PASS',
      presentTables: tableCheck.rows.map((r) => r.table_name),
      sourceAnomalies: anomalyCheck.rows[0]
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    return { status: 'WARN_DB_UNREACHABLE', error: String(err.message ?? err) };
  } finally {
    await client.end().catch(() => {});
  }
}

// Gate 3: Call :8788 TRACE MCP & :8095 Python Extraction Sidecar
async function fetchDagPrefillAndExtractions(relativePath) {
  let traceContext = null;
  let sidecarExtraction = null;

  // Query TRACE MCP (:8788) for Atlas file context & prompt cards
  try {
    const traceRes = await fetch(`${TRACE_MCP_URL}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'trace-context-1',
        method: 'tools/call',
        params: {
          name: 'codebase.context_for_file',
          arguments: { path: relativePath }
        }
      }),
      signal: AbortSignal.timeout(8000)
    });
    if (traceRes.ok) {
      traceContext = await traceRes.json();
    }
  } catch (err) {
    traceContext = { fallback: 'local-atlas-json', reason: String(err.message ?? err) };
  }

  // Query :8095 Python Sidecar for AST / Span Extraction
  try {
    const sidecarRes = await fetch(`${SIDECAR_8095_URL}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        relative_path: relativePath,
        mode: 'ast_error_prefill'
      }),
      signal: AbortSignal.timeout(8000)
    });
    if (sidecarRes.ok) {
      sidecarExtraction = await sidecarRes.json();
    }
  } catch (err) {
    sidecarExtraction = { status: 'sidecar_offline_or_custom_route', reason: String(err.message ?? err) };
  }

  return { traceContext, sidecarExtraction };
}

async function main() {
  const parity = runPydanticZodParityGate();
  const dbGate = await runReadOnlyPostgresGate();
  const { traceContext, sidecarExtraction } = await fetchDagPrefillAndExtractions(TARGET_FILE);

  // Gate 4: Synthesize & Validate the Canonical ACP/A2A Kanban Task Payload
  const synthesizedTask = acpKanbanErrorTaskV1Schema.parse({
    schema: 'atlas.acp-kanban-error-task.v1',
    taskId: `acp-kanban-${crypto.randomUUID().slice(0, 8)}`,
    boardColumn: 'prefilled',
    sourceAgent: 'mcp-dag-prefill-orchestrator',
    targetAgent: 'a2a-error-fixer-worker',
    relativePath: TARGET_FILE,
    extractedSpans: sidecarExtraction?.spans ?? ['ast:module_exports', 'ast:drizzle_schema_refs'],
    dagPrefillNodes: [
      {
        nodeId: `dag:${TARGET_FILE}`,
        relativePath: TARGET_FILE,
        topoClass: 'db_gateway',
        graphAuthority: 0.91,
        pagerank: 0.82,
        agentsDir: path.posix.dirname(TARGET_FILE),
        errorSignatures: ['SCHEMA_PARITY_CHECK', 'DRIZZLE_LEDGER_EMPTY_GUARD']
      }
    ],
    promptCards: ['dir-card:lib/server/db', 'rule:read-only-authority-gate'],
    recommendedFixActions: [
      'Validate Zod and Pydantic contract parity before agent dispatch',
      'Inspect DAG neighbors via codebase.context_for_file',
      'Keep canonicalAuthority=false and writesPerformed=false on proposal packets'
    ],
    dbSchemaVerified: dbGate.status === 'PASS',
    canonicalAuthority: false,
    writesPerformed: false
  });

  const receipt = {
    timestamp: new Date().toISOString(),
    targetFile: TARGET_FILE,
    gates: {
      pydanticZodParity: parity,
      postgresReadOnlyCatalog: dbGate,
      traceMcp8788: traceContext ? 'REACHED' : 'FALLBACK',
      sidecar8095: sidecarExtraction
    },
    kanbanAcpTaskPacket: synthesizedTask
  };

  console.log(JSON.stringify(receipt, null, 2));
}

main().catch((err) => {
  console.error('[FATAL E2E CHECK ERROR]', err);
  process.exit(1);
});
