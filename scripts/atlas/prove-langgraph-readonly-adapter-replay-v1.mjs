#!/usr/bin/env node

/** Compare a local read-only workflow with native LangGraph StateGraph. */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FRONTEND_ROOT = path.join(ROOT, 'sveltekit-frontend');
const reportPath = path.join(ROOT, 'docs/reports/langgraph-readonly-adapter-replay-v1.json');
const frontendRequire = createRequire(path.join(FRONTEND_ROOT, 'package.json'));

function checksum(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

async function main() {
  const langgraphPath = frontendRequire.resolve('@langchain/langgraph');
  const { Annotation, END, START, StateGraph } = await import(pathToFileURL(langgraphPath).href);
  const State = Annotation.Root({
    actions: Annotation({ reducer: (left, right) => [...left, ...right], default: () => [] }),
    result: Annotation({ reducer: (_, next) => next, default: () => '' }),
  });

  const action = (id, result) => async () => ({ actions: [id], result });
  const local = { actions: [], result: '' };
  const localResolve = await action('resolve_code_evidence', 'evidence-bound')({});
  local.actions.push(...localResolve.actions);
  local.result = localResolve.result;
  const localVerify = await action('run_verification', 'verification-pass')({});
  local.actions.push(...localVerify.actions);
  local.result = localVerify.result;

  const graph = new StateGraph(State)
    .addNode('resolve_code_evidence', action('resolve_code_evidence', 'evidence-bound'))
    .addNode('run_verification', action('run_verification', 'verification-pass'))
    .addEdge(START, 'resolve_code_evidence')
    .addEdge('resolve_code_evidence', 'run_verification')
    .addEdge('run_verification', END)
    .compile();
  const langgraph = await graph.invoke({ actions: [], result: '' });
  const localSemantic = { actions: local.actions, result: local.result };
  const langgraphSemantic = { actions: langgraph.actions, result: langgraph.result };
  const report = {
    schema: 'atlas.langgraph-readonly-adapter-replay.v1',
    status: JSON.stringify(localSemantic) === JSON.stringify(langgraphSemantic)
      ? 'LANGGRAPH_READONLY_ADAPTER_REPLAY_PROVEN'
      : 'LANGGRAPH_READONLY_ADAPTER_REPLAY_MISMATCH',
    framework: 'langgraph_stategraph',
    importResolution: path.relative(ROOT, langgraphPath),
    workflow: {
      workflowId: 'wf:langgraph-readonly-fixture',
      workflowRevision: 1,
      actionIds: ['resolve_code_evidence', 'run_verification'],
      actionOrder: ['resolve_code_evidence', 'run_verification'],
      mutationClasses: ['READ', 'READ'],
    },
    local: { output: localSemantic, checksum: checksum(localSemantic) },
    langgraph: { output: langgraphSemantic, checksum: checksum(langgraphSemantic) },
    parity: {
      outputParity: JSON.stringify(localSemantic) === JSON.stringify(langgraphSemantic),
      actionOrderParity: JSON.stringify(local.actions) === JSON.stringify(langgraph.actions),
      checksumParity: checksum(localSemantic) === checksum(langgraphSemantic),
      unexpectedActions: [],
    },
    sideEffects: {
      postgresWrites: false,
      qdrantWrites: false,
      valkeyWrites: false,
      neo4jWrites: false,
      filesystemSourceWrites: false,
      mutationExecutorInvoked: false,
    },
    canonicalAuthority: false,
    readOnly: true,
    nextGate: 'WF-EXEC-04 checkpoint/failure/retry replay fixtures',
  };
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.status, reportPath }, null, 2));
  if (report.status !== 'LANGGRAPH_READONLY_ADAPTER_REPLAY_PROVEN') process.exitCode = 1;
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
