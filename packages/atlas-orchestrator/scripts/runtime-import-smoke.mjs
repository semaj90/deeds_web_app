#!/usr/bin/env node
import assert from 'node:assert/strict';

const [major, minor] = process.versions.node.split('.').map(Number);
assert.ok(major > 22 || (major === 22 && minor >= 22), `Node >=22.22.0 required by the resolved runtime graph; got ${process.version}`);

const [mastra, durable, postgres, redis, deepAgents, langchain, langgraph] = await Promise.all([
  import('@mastra/core/mastra'),
  import('@mastra/core/agent/durable'),
  import('@mastra/pg'),
  import('@mastra/redis'),
  import('deepagents'),
  import('langchain'),
  import('@langchain/langgraph'),
]);

const requiredExports = {
  Mastra: mastra.Mastra,
  createDurableAgent: durable.createDurableAgent,
  PostgresStore: postgres.PostgresStore,
  WorkflowsPG: postgres.WorkflowsPG,
  RedisServerCache: redis.RedisServerCache,
  createDeepAgent: deepAgents.createDeepAgent,
  langchainTool: langchain.tool,
  StateGraph: langgraph.StateGraph,
};

for (const [name, value] of Object.entries(requiredExports)) {
  assert.equal(typeof value, 'function', `Expected ${name} runtime export`);
}

console.log(JSON.stringify({
  schema: 'atlas.orchestrator-runtime-install-smoke.v1',
  nodeVersion: process.version,
  imported: Object.keys(requiredExports),
  agentsInstantiated: 0,
  databaseConnections: 0,
  canonicalWrites: 0,
  canonicalAuthority: false,
}, null, 2));
