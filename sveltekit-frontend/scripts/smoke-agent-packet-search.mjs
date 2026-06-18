#!/usr/bin/env node

const BASE_URL = process.env.AGENT_RPC_BASE_URL ?? 'http://127.0.0.1:5173';
const ENDPOINT = `${BASE_URL}/api/agent/rpc`;
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 20_000);

async function rpc(method, params = {}, id = 1) {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const payload = await response.json().catch(async () => ({ raw: await response.text() }));
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function main() {
  console.log('🧪 Agent packet.search smoke');
  console.log(`Endpoint: ${ENDPOINT}`);

  const manifest = await rpc('tools/list', {}, 1);
  const names = (manifest.result?.tools ?? []).map((tool) => tool.name);
  if (!names.includes('packet.search')) {
    throw new Error(`packet.search missing from tools/list: ${names.join(', ')}`);
  }
  if (!names.includes('startup.briefing')) {
    throw new Error(`startup.briefing missing from tools/list: ${names.join(', ')}`);
  }
  console.log(`tools/list: ${names.length} tools`);

  const search = await rpc(
    'tools/call',
    {
      name: 'packet.search',
      arguments: {
        query: 'HyperRAG fusion wiring',
        limit: 5,
      },
    },
    2,
  );

  const result = search.result ?? {};
  if (result.ok === false) {
    throw new Error(`packet.search returned error: ${result.error ?? 'unknown'}`);
  }

  const packets = result.data?.packets ?? [];
  if (!Array.isArray(packets)) {
    throw new Error('packet.search did not return packets array');
  }
  if (packets.length === 0) {
    console.warn('packet.search returned zero packets; tool wiring is live but corpus may be sparse');
  }

  console.log(`packet.search: ${packets.length} packets`);
  console.log('✅ Agent packet.search smoke passed');
}

main().catch((error) => {
  console.error('❌ Agent packet.search smoke failed:', error?.message ?? error);
  process.exit(1);
});
