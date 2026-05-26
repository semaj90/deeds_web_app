#!/usr/bin/env node

const endpoints = [
  { name: 'turbovec-sidecar', url: 'http://127.0.0.1:8791/mcp' },
  { name: 'engram-embed', url: 'http://127.0.0.1:8792/mcp' },
  { name: 'langextract', url: 'http://127.0.0.1:8793/mcp' }
];

async function postJson(url, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 240)}`);
    }
    if (!text.trim()) {
      return null;
    }
    return JSON.parse(text);
  } finally {
    clearTimeout(timeout);
  }
}

async function checkEndpoint(endpoint) {
  const initialize = await postJson(endpoint.url, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'opencode-sidecar-smoke',
        version: '1.0.0'
      }
    }
  });

  const tools = await postJson(endpoint.url, {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {}
  });

  const toolCount = tools?.result?.tools?.length ?? 0;
  if (!initialize?.result || toolCount === 0) {
    throw new Error(`${endpoint.name} returned no initialize result or no tools`);
  }

  return {
    name: endpoint.name,
    protocolVersion: initialize.result.protocolVersion,
    toolCount
  };
}

async function callTool(endpoint, name, args, id) {
  const response = await postJson(endpoint.url, {
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: {
      name,
      arguments: args
    }
  });
  if (response?.error) {
    throw new Error(`${name} returned MCP error: ${response.error.message ?? JSON.stringify(response.error)}`);
  }
  const text = response?.result?.content?.[0]?.text;
  if (typeof text !== 'string') {
    throw new Error(`${name} returned no text content`);
  }
  return JSON.parse(text);
}

async function checkEngramMemory(endpoint) {
  const redis = await callTool(endpoint, 'engram.redis_health', {}, 101);
  if (!redis.ok) {
    return { ok: false, skipped: true, reason: `Redis unavailable: ${redis.error ?? 'unknown error'}` };
  }

  const runId = `smoke-${Date.now()}`;
  const packet = await callTool(endpoint, 'engram.ace_packet_inject', {
    run_id: runId,
    context_blob: JSON.stringify({ ok: true, runId, source: 'smoke-opencode-mcp-sidecars' }),
    ttl_seconds: 120
  }, 102);
  if (!packet.ok || packet.status !== 'written') {
    throw new Error(`engram.ace_packet_inject did not write: ${JSON.stringify(packet)}`);
  }

  const readBack = await callTool(endpoint, 'engram.ace_packet_read', { run_id: runId }, 103);
  if (!readBack.ok || readBack.status !== 'hit') {
    throw new Error(`engram.ace_packet_read did not hit: ${JSON.stringify(readBack)}`);
  }

  const userId = `smoke-${runId}`;
  const memory = await callTool(endpoint, 'engram.chat_memory_store', {
    user_id: userId,
    turn: {
      role: 'user',
      content: 'smoke memory write',
      metadata: { runId }
    },
    max_turns: 5,
    ttl_seconds: 120
  }, 104);
  if (!memory.ok || memory.status !== 'written') {
    throw new Error(`engram.chat_memory_store did not write: ${JSON.stringify(memory)}`);
  }

  const recent = await callTool(endpoint, 'engram.chat_memory_recent', { user_id: userId, limit: 1 }, 105);
  if (!recent.ok || recent.count < 1) {
    throw new Error(`engram.chat_memory_recent did not read back: ${JSON.stringify(recent)}`);
  }

  return {
    ok: true,
    packetKey: packet.key,
    memoryKey: memory.redis_key,
    recentCount: recent.count
  };
}

const results = [];
for (const endpoint of endpoints) {
  try {
    const result = await checkEndpoint(endpoint);
    if (endpoint.name === 'engram-embed') {
      result.memory = await checkEngramMemory(endpoint);
    }
    results.push(result);
  } catch (error) {
    console.error(`[FAIL] ${endpoint.name}: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (results.length > 0) {
  console.log(JSON.stringify({ ok: process.exitCode !== 1, results }, null, 2));
}
