// @vitest-environment node
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod/v3';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerLlamaRuntimeTools, type LlamaControlRunner } from './llama-runtime-tools.js';
import { LLAMA_PROFILES, LLAMA_PROFILE_IDS, type LlamaControlAction } from './llama-runtime-contracts.js';
import { createLlamaLifecycleGate, type LlamaGateOptions, type LlamaLifecycleGate } from './llama-runtime-gate.js';

function receipt(action: LlamaControlAction) {
  return {
    schema: 'atlas.llama-runtime-control.v1', action, port: 8090, status: 'STOPPED',
    serviceMutationPerformed: false, before: null, after: null,
    memoryDeltas: [], memoryReleaseObserved: null, error: null,
  };
}

function payload(result: unknown) {
  const parsed = z.object({ content: z.array(z.object({ text: z.string() })) }).parse(result);
  return JSON.parse(parsed.content[0].text);
}

const openGate = (): LlamaLifecycleGate => ({ authorize: () => ({ allowed: true, grantNonce: 'test' }), audit: () => {} });

async function connect(
  runner: Mock<LlamaControlRunner> = vi.fn<LlamaControlRunner>(async (action) => receipt(action)),
  gate: LlamaLifecycleGate = openGate(),
) {
  const server = new McpServer({ name: 'llama-runtime-test', version: '1.0.0' });
  registerLlamaRuntimeTools(server, runner, gate);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'llama-runtime-client', version: '1.0.0' });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, runner, close: async () => { await client.close(); await server.close(); } };
}

describe('llama-server MCP controls', () => {
  it('lists five bounded tools and reads status through an actual MCP exchange', async () => {
    const session = await connect();
    try {
      const listed = await session.client.listTools();
      expect(listed.tools.map(({ name }) => name)).toEqual([
        'llama_server.status', 'llama_server.profiles', 'llama_server.unload', 'llama_server.start', 'llama_server.switch',
      ]);
      const result = await session.client.callTool({ name: 'llama_server.status', arguments: {} });
      expect(result.isError).toBe(false);
      expect(payload(result)).toMatchObject({ status: 'STOPPED', memoryReleaseObserved: null });
      expect(session.runner).toHaveBeenCalledWith('status', undefined);
      const profiles = await session.client.callTool({ name: 'llama_server.profiles', arguments: {} });
      expect(Object.keys(payload(profiles).profiles)).toEqual([...LLAMA_PROFILE_IDS]);
      expect(session.runner).toHaveBeenCalledTimes(1);
    } finally { await session.close(); }
  });

  it.each([
    ['llama_server.start', {}],
    ['llama_server.unload', { confirm: false }],
    ['llama_server.start', { confirm: true, profile: 'arbitrary-model' }],
    ['llama_server.switch', { confirm: true }],
    ['llama_server.switch', { confirm: true, profile: 'ornith-1.5', token: 'x'.repeat(32) }],
    ['llama_server.unload', { confirm: true, pid: 123 }],
    ['llama_server.status', { port: 8091 }],
  ])('rejects unsafe inputs before executing %s', async (name, args) => {
    const session = await connect();
    try {
      const result = await session.client.callTool({ name, arguments: args });
      expect(result.isError).toBe(true);
      expect(session.runner).not.toHaveBeenCalled();
    } finally { await session.close(); }
  });

  it('passes only approved profiles and explicit actions', async () => {
    const session = await connect();
    try {
      await session.client.callTool({ name: 'llama_server.start', arguments: { confirm: true } });
      await session.client.callTool({ name: 'llama_server.switch', arguments: { confirm: true, profile: 'ornith-1.5' } });
      await session.client.callTool({ name: 'llama_server.unload', arguments: { confirm: true } });
      expect(session.runner.mock.calls).toEqual([['start', undefined], ['switch', 'ornith-1.5'], ['unload', undefined]]);
    } finally { await session.close(); }
  });

  it('never reaches the controller when the gate refuses, and audits the refusal', async () => {
    const audit = vi.fn();
    const session = await connect(undefined, { authorize: () => ({ allowed: false, reason: 'HUMAN_GRANT_MISSING' }), audit });
    try {
      const result = await session.client.callTool({ name: 'llama_server.unload', arguments: { confirm: true } });
      expect(result.isError).toBe(true);
      expect(payload(result)).toMatchObject({ error: 'HUMAN_GRANT_MISSING', serviceMutationPerformed: false });
      expect(session.runner).not.toHaveBeenCalled();
      expect(audit).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'REFUSED', reason: 'HUMAN_GRANT_MISSING' }));
    } finally { await session.close(); }
  });

  it('does not act when the audit record cannot be written', async () => {
    const session = await connect(undefined, { authorize: () => ({ allowed: true, grantNonce: 'n' }), audit: () => { throw new Error('AUDIT_WRITE_FAILED'); } });
    try {
      const result = await session.client.callTool({ name: 'llama_server.unload', arguments: { confirm: true } });
      expect(result.isError).toBe(true);
      expect(session.runner).not.toHaveBeenCalled();
    } finally { await session.close(); }
  });

  it('preserves refusal receipts without claiming memory was released', async () => {
    const runner = vi.fn(async (action: LlamaControlAction) => ({ ...receipt(action), status: 'ERROR', error: 'SLOT_BUSY_OR_UNKNOWN_REFUSING_STOP' }));
    const session = await connect(runner);
    try {
      const result = await session.client.callTool({ name: 'llama_server.unload', arguments: { confirm: true } });
      expect(result.isError).toBe(true);
      expect(payload(result)).toMatchObject({ error: 'SLOT_BUSY_OR_UNKNOWN_REFUSING_STOP', serviceMutationPerformed: false, memoryReleaseObserved: null });
    } finally { await session.close(); }
  });

  it('fails closed on malformed or wrong-action backend receipts', async () => {
    for (const value of [{}, receipt('start')]) {
      const session = await connect(vi.fn<LlamaControlRunner>(async () => value));
      try {
        const result = await session.client.callTool({ name: 'llama_server.status', arguments: {} });
        expect(result.isError).toBe(true);
        expect(payload(result).serviceMutationPerformed).toBeNull();
      } finally { await session.close(); }
    }
  });

  it('keeps every mutating llama tool on the TRACE batch denylist', async () => {
    // Source check: importing trace-mcp-server would start the server.
    const source = readFileSync(fileURLToPath(new URL('./trace-mcp-server.ts', import.meta.url)), 'utf8');
    const denylist = /const BATCH_DENYLIST = new Set\(\[([\s\S]*?)\]\);/.exec(source)?.[1] ?? '';
    const session = await connect();
    try {
      const mutating = (await session.client.listTools()).tools.filter((tool) => tool.annotations?.readOnlyHint === false);
      expect(mutating.map((tool) => tool.name).sort()).toEqual(['llama_server.start', 'llama_server.switch', 'llama_server.unload']);
      for (const tool of mutating) expect(denylist).toContain(`'${tool.name}'`);
    } finally { await session.close(); }
  });

  it('keeps the TypeScript profile table identical to the PowerShell controller', () => {
    const script = readFileSync(fileURLToPath(new URL('../../../scripts/atlas/llama-server-control.ps1', import.meta.url)), 'utf8');
    for (const [id, profile] of Object.entries(LLAMA_PROFILES)) {
      const line = script.split(/\r?\n/).find((candidate) => candidate.trim().startsWith(`'${id}'`) && candidate.includes('modelId'));
      expect(line, id).toBeDefined();
      expect(line).toContain(`modelId = '${profile.modelId}'`);
      expect(line).toContain(`vision = $${profile.vision}`);
      expect(line).toContain(`files = @(${profile.files.map((file) => `'${file}'`).join(', ')})`);
    }
  });
});

describe('llama-server lifecycle gate', () => {
  const NOW = Date.parse('2026-11-26T12:00:00Z');
  const TOKEN = 'operator-token-configured-for-tests';
  let directory = '';
  afterEach(() => { if (directory) rmSync(directory, { recursive: true, force: true }); });

  function setup(grant: Record<string, unknown> | null, options: LlamaGateOptions = {}) {
    directory = mkdtempSync(path.join(tmpdir(), 'llama-gate-'));
    const source = path.join(directory, 'source.ts');
    writeFileSync(source, '');
    utimesSync(source, new Date(NOW - 60_000), new Date(NOW - 60_000));
    const grantPath = path.join(directory, 'grant.json');
    if (grant) {
      writeFileSync(grantPath, '﻿' + JSON.stringify({
        schema: 'atlas.llama-lifecycle-grant.v1', nonce: 'a'.repeat(32), action: 'switch', profile: 'ornith-1.5',
        createdAt: '2026-11-26T11:59:00Z', expiresAt: '2026-11-26T12:04:00Z', ...grant,
      }));
    }
    const gate = createLlamaLifecycleGate({
      grantPath, auditPath: path.join(directory, 'audit.ndjson'), sourcePaths: [source],
      expectedToken: TOKEN, processStartedAtMs: NOW - 30_000, now: () => NOW, ...options,
    });
    return { gate, grantPath, auditPath: path.join(directory, 'audit.ndjson') };
  }

  it('allows one matching grant exactly once and keeps the consumed file', () => {
    const { gate, grantPath } = setup({});
    expect(gate.authorize('switch', 'ornith-1.5')).toEqual({ allowed: true, grantNonce: 'a'.repeat(32) });
    expect(existsSync(`${grantPath}.consumed-${'a'.repeat(32)}`)).toBe(true);
    expect(gate.authorize('switch', 'ornith-1.5')).toEqual({ allowed: false, reason: 'HUMAN_GRANT_MISSING' });
  });

  it.each([
    ['no grant', null, {}, 'HUMAN_GRANT_MISSING'],
    ['no configured token', {}, { expectedToken: undefined }, 'OPERATOR_TOKEN_ENV_UNCONFIGURED'],
    ['a process older than its source', {}, { processStartedAtMs: NOW - 120_000 }, 'PROCESS_OLDER_THAN_SOURCE_RESTART_REQUIRED'],
    ['another profile', { profile: 'gemma4-legal-iq4xs' }, {}, 'HUMAN_GRANT_DOES_NOT_MATCH_REQUEST'],
    ['another action', { action: 'unload', profile: null }, {}, 'HUMAN_GRANT_DOES_NOT_MATCH_REQUEST'],
    ['an expired grant', { createdAt: '2026-11-26T11:50:00Z', expiresAt: '2026-11-26T11:55:00Z' }, {}, 'HUMAN_GRANT_EXPIRED'],
    ['a long-lived grant', { expiresAt: '2026-11-27T12:00:00Z' }, {}, 'HUMAN_GRANT_LIFETIME_INVALID'],
    ['a malformed grant', { nonce: '../escape' }, {}, 'HUMAN_GRANT_INVALID'],
  ])('refuses %s', (_name, grant, options, reason) => {
    const { gate } = setup(grant as Record<string, unknown> | null, options);
    expect(gate.authorize('switch', 'ornith-1.5')).toEqual({ allowed: false, reason });
  });

  it('writes audit lines that state no datastore write happened and never contain the token', () => {
    const { gate, auditPath } = setup(null);
    gate.audit({ action: 'unload', outcome: 'REFUSED' });
    const line = readFileSync(auditPath, 'utf8');
    expect(JSON.parse(line)).toMatchObject({ writesPerformed: false, outcome: 'REFUSED' });
    expect(line).not.toContain(TOKEN);
  });
});
