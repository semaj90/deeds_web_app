import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

process.env.DATABASE_URL = resolveDatabaseUrl(loadRepoEnv(process.env));
// ACPToolRegistry.ts transitively imports llm/runtime-contract.ts, which
// throws at MODULE LOAD TIME if this is unset — unrelated to the NLP tools
// this proof exercises, but the import chain fails without it. A placeholder
// is fine here: only the filename is derived from it, and this proof never
// calls llm:generate.
process.env.ROTORQUANT_MODEL_PATH ??= 'placeholder-model.gguf';

const { executeACPTool, getACPToolRegistry } = await import('../../sveltekit-frontend/src/lib/server/services/knowledge-search/ACPToolRegistry.ts');

/**
 * Live proof for the newly-registered nlp:capabilities/nlp:analyze/nlp:ast-chunk
 * ACP tools, against the real running miniforge-nlp-sidecar container (:8095).
 * No writes, no cleanup needed — read-only probes + stateless analysis calls.
 */

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERTION_FAILED: ${message}`);
}

async function main() {
  const report: Record<string, unknown> = { schema: 'atlas.acp-nlp-sidecar-tools-live-proof.v1' };

  const registry = getACPToolRegistry();
  const registered = registry.list().map((tool) => tool.name);
  report.nlpToolsRegistered = ['nlp:capabilities', 'nlp:analyze', 'nlp:ast-chunk'].every((name) => registered.includes(name));
  assert(report.nlpToolsRegistered, `expected all 3 nlp tools registered, got: ${registered.filter((n) => n.startsWith('nlp:'))}`);

  const capabilities = await executeACPTool('nlp:capabilities', {});
  report.capabilities = capabilities;
  assert(capabilities.success, `nlp:capabilities failed: ${JSON.stringify(capabilities)}`);
  assert((capabilities.data as any).status === 'ok', 'sidecar health status not ok');

  const analyze = await executeACPTool('nlp:analyze', {
    text: 'The court held that the defendant breached the contract and must pay damages.',
    extraction_mode: 'entities',
    source_type: 'plain_text',
  });
  report.analyze = { success: analyze.success, entityCount: (analyze.data as any)?.entities?.length ?? null };
  assert(analyze.success, `nlp:analyze failed: ${JSON.stringify(analyze)}`);

  const astChunk = await executeACPTool('nlp:ast-chunk', {
    source: 'export function add(a: number, b: number): number {\n  return a + b;\n}\n',
    language: 'typescript',
    filePath: 'scratch/acp-nlp-proof.ts',
    sourceRevision: 'sha256:acp-nlp-proof-fixture',
  });
  report.astChunk = {
    success: astChunk.success,
    schema: (astChunk.data as any)?.schema,
    chunkCount: (astChunk.data as any)?.chunks?.length ?? null,
    syntaxStatus: (astChunk.data as any)?.syntax_status,
  };
  assert(astChunk.success, `nlp:ast-chunk failed: ${JSON.stringify(astChunk)}`);
  assert((astChunk.data as any).schema === 'atlas.ast.evidence.v1', 'unexpected ast-chunk response schema');

  // dryRun mode must plan, not execute, for all 3.
  const dryRunCapabilities = await executeACPTool('nlp:capabilities', {}, { dryRun: true });
  const dryRunAnalyze = await executeACPTool('nlp:analyze', { text: 'x' }, { dryRun: true });
  const dryRunAstChunk = await executeACPTool('nlp:ast-chunk', { source: 'x', language: 'typescript', filePath: 'a.ts', sourceRevision: 'r1' }, { dryRun: true });
  report.dryRunModeWorks = [dryRunCapabilities, dryRunAnalyze, dryRunAstChunk].every((r) => r.kind === 'plan');
  assert(report.dryRunModeWorks, 'dryRun mode did not return plan-kind results for all 3 tools');

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
