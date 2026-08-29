#!/usr/bin/env node

/** Read-only LangGraph checkpoint, failure, retry, cancellation, and replay fixture. */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FRONTEND_ROOT = path.join(ROOT, 'sveltekit-frontend');
const reportPath = path.join(ROOT, 'docs/reports/langgraph-failure-retry-replay-v1.json');
const frontendRequire = createRequire(path.join(FRONTEND_ROOT, 'package.json'));
const checksum = (value) => crypto.createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');

async function buildGraph({ Annotation, START, END, StateGraph, MemorySaver }, attempts, cancellationRequested = false) {
  const State = Annotation.Root({
    actions: Annotation({ reducer: (left, right) => [...left, ...right], default: () => [] }),
    result: Annotation({ reducer: (_, next) => next, default: () => '' }),
  });
  const graph = new StateGraph(State)
    .addNode('read_evidence', async () => ({ actions: ['read_evidence'] }))
    .addNode('retryable_validation', async () => {
      if (cancellationRequested) throw new Error('WORKFLOW_CANCELLED');
      attempts.count += 1;
      if (attempts.count === 1) throw new Error('FIXTURE_TRANSIENT_FAILURE');
      return { actions: ['retryable_validation'], result: 'validated' };
    })
    .addEdge(START, 'read_evidence')
    .addEdge('read_evidence', 'retryable_validation')
    .addEdge('retryable_validation', END);
  return graph.compile({ checkpointer: new MemorySaver() });
}

async function main() {
  const langgraphPath = frontendRequire.resolve('@langchain/langgraph');
  const checkpointPath = frontendRequire.resolve('@langchain/langgraph-checkpoint');
  const langgraph = await import(pathToFileURL(langgraphPath).href);
  const checkpoint = await import(pathToFileURL(checkpointPath).href);
  const retryAttempts = { count: 0 };
  const retryGraph = await buildGraph({ ...langgraph, ...checkpoint }, retryAttempts);
  const config = { configurable: { thread_id: 'wf:failure-retry-fixture' } };
  let firstFailure = null;
  try {
    await retryGraph.invoke({ actions: [], result: '' }, config);
  } catch (error) {
    firstFailure = error instanceof Error ? error.message : String(error);
  }
  const retried = await retryGraph.invoke({ actions: [], result: '' }, config);

  const cancellationAttempts = { count: 0 };
  const cancellationGraph = await buildGraph({ ...langgraph, ...checkpoint }, cancellationAttempts, true);
  let cancellation = null;
  try {
    await cancellationGraph.invoke({ actions: [], result: '' }, { configurable: { thread_id: 'wf:cancellation-fixture' } });
  } catch (error) {
    cancellation = error instanceof Error ? error.message : String(error);
  }

  const replayAttemptsA = { count: 1 };
  const replayAttemptsB = { count: 1 };
  const replayA = await (await buildGraph({ ...langgraph, ...checkpoint }, replayAttemptsA)).invoke({ actions: [], result: '' }, { configurable: { thread_id: 'wf:replay-a' } });
  const replayB = await (await buildGraph({ ...langgraph, ...checkpoint }, replayAttemptsB)).invoke({ actions: [], result: '' }, { configurable: { thread_id: 'wf:replay-b' } });
  const replayOutputA = { actions: replayA.actions, result: replayA.result };
  const replayOutputB = { actions: replayB.actions, result: replayB.result };
  const report = {
    schema: 'atlas.langgraph-failure-retry-replay.v1',
    status: firstFailure === 'FIXTURE_TRANSIENT_FAILURE' && retried.result === 'validated' && cancellation === 'WORKFLOW_CANCELLED' && checksum(replayOutputA) === checksum(replayOutputB)
      ? 'LANGGRAPH_FAILURE_RETRY_CANCELLATION_REPLAY_PROVEN'
      : 'LANGGRAPH_FAILURE_RETRY_CANCELLATION_REPLAY_MISMATCH',
    framework: 'langgraph_stategraph',
    checkpointProvider: 'memory',
    checkpointPersistence: 'fixture_process_only',
    retry: { firstFailure, retryAttemptCount: retryAttempts.count, recovered: retried.result === 'validated' },
    cancellation: { requested: true, observedError: cancellation, cooperativeCancellation: cancellation === 'WORKFLOW_CANCELLED' },
    replay: { outputA: replayOutputA, outputB: replayOutputB, checksumA: checksum(replayOutputA), checksumB: checksum(replayOutputB), identical: checksum(replayOutputA) === checksum(replayOutputB) },
    sideEffects: { postgresWrites: false, qdrantWrites: false, valkeyWrites: false, neo4jWrites: false, sourceWrites: false, mutationExecutorInvoked: false },
    canonicalAuthority: false,
    readOnly: true,
    nextGate: 'WF-EXEC-05 defer or evaluate Mastra only after durable adapter receipts are specified',
  };
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.status, reportPath }, null, 2));
  if (report.status !== 'LANGGRAPH_FAILURE_RETRY_CANCELLATION_REPLAY_PROVEN') process.exitCode = 1;
}

main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
