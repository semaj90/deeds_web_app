#!/usr/bin/env node
/**
 * Read-only live ownership audit for LangGraph, llama-server, and Ollama.
 * No synthesis request, embedding request, checkpoint setup, or data mutation
 * is performed.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? '.');
const reportPath = path.resolve(
  process.argv[3] ?? 'docs/reports/langgraph-live-provider-ownership-v1.json',
);

const readJson = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  const body = await response.json();
  return { status: response.status, body };
};

const failures = [];
let synthesis;
let chat;
let embedding;
try {
  [synthesis, chat, embedding] = await Promise.all([
    readJson('http://127.0.0.1:8091/health/summary'),
    readJson('http://127.0.0.1:8090/v1/models'),
    readJson('http://127.0.0.1:11434/api/tags'),
  ]);
} catch (error) {
  failures.push(`LIVE_PROVIDER_REQUEST_FAILED:${error instanceof Error ? error.message : String(error)}`);
}

const synthesisBody = synthesis?.body ?? {};
const chatIds = (chat?.body?.data ?? []).map((item) => item?.id).filter(Boolean);
const embeddingNames = (embedding?.body?.models ?? []).map((item) => item?.name).filter(Boolean);
const checks = [
  {
    id: 'LANGGRAPH_HEALTHY',
    passed: synthesis?.status === 200 && synthesisBody.status === 'ok',
    detail: `status=${synthesisBody.status ?? 'UNAVAILABLE'}`,
  },
  {
    id: 'STRICT_MSGPACK_ENABLED',
    passed: synthesisBody.langgraph_strict_msgpack === true,
    detail: `strict=${String(synthesisBody.langgraph_strict_msgpack)}`,
  },
  {
    id: 'CHECKPOINT_NAMESPACE_ISOLATED',
    passed: synthesisBody.langgraph_checkpoint?.schema === 'langgraph_py' &&
      synthesisBody.langgraph_checkpoint?.enabled === false,
    detail: JSON.stringify(synthesisBody.langgraph_checkpoint ?? null),
  },
  {
    id: 'LLAMA_CHAT_OWNER',
    passed: synthesisBody.chat_owner === 'llama-server' &&
      synthesisBody.chat_model === 'ornith-1.5-9b' &&
      chatIds.includes('ornith-1.5-9b'),
    detail: `owner=${synthesisBody.chat_owner ?? 'UNAVAILABLE'} model=${chatIds.join(',') || 'UNAVAILABLE'}`,
  },
  {
    id: 'OLLAMA_EMBEDDING_OWNER',
    passed: synthesisBody.embedding_owner === 'ollama' &&
      embeddingNames.includes('embeddinggemma:latest'),
    detail: `owner=${synthesisBody.embedding_owner ?? 'UNAVAILABLE'} models=${embeddingNames.join(',') || 'UNAVAILABLE'}`,
  },
];

const failedChecks = checks.filter((check) => !check.passed);
const report = {
  schema: 'atlas.langgraph-live-provider-ownership-audit.v1',
  generatedAt: new Date().toISOString(),
  endpoints: {
    synthesis: 'http://127.0.0.1:8091/health/summary',
    chat: 'http://127.0.0.1:8090/v1/models',
    embedding: 'http://127.0.0.1:11434/api/tags',
  },
  checks,
  failures,
  summary: {
    total: checks.length,
    passed: checks.length - failedChecks.length,
    failed: failedChecks.length + failures.length,
    status: failedChecks.length === 0 && failures.length === 0
      ? 'LIVE_PROVIDER_OWNERSHIP_PROVEN'
      : 'LIVE_PROVIDER_REVIEW_REQUIRED',
  },
  canonicalAuthority: false,
  writesPerformed: false,
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ reportPath, ...report.summary, writesPerformed: false }, null, 2));
process.exitCode = report.summary.failed === 0 ? 0 : 1;
