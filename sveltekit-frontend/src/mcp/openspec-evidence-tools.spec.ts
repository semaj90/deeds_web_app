import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerOpenSpecEvidenceTools } from './openspec-evidence-tools.ts';

describe('OpenSpec evidence MCP tools', () => {
  it('searches the PostgreSQL task-source snapshot as bounded locators, not executable tasks', async () => {
    const server = new McpServer({ name: 'openspec-source-index-test-server', version: '1.0.0' });
    const sourceIndexSearch = async (input: {
      query: string;
      identity: 'ALL' | 'DECLARED_ID' | 'DERIVED_ID' | 'AMBIGUOUS';
      limit: number;
    }) => {
      expect(input).toEqual({ query: 'semantic matrix', identity: 'AMBIGUOUS', limit: 5 });
      return {
        schema: 'atlas.openspec-task-source-index-search.v1',
        status: 'SOURCE_LOCATORS_ONLY',
        snapshotId: `sha256:${'a'.repeat(64)}`,
        rows: [{ sourceRef: 'openspec/changes/example/tasks.md#L4', identityStatus: 'AMBIGUOUS' }],
        total: 1,
        canonicalAuthority: false,
        taskIdentityPromotion: false,
        executableKanban: false,
        writesPerformed: false,
      };
    };
    registerOpenSpecEvidenceTools(server, sourceIndexSearch);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'openspec-source-index-test-client', version: '1.0.0' });

    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const listed = await client.listTools();
      expect(listed.tools.some(({ name }) => name === 'openspec.source_index.search')).toBe(true);

      const called = await client.callTool({
        name: 'openspec.source_index.search',
        arguments: { query: 'semantic matrix', identity: 'AMBIGUOUS', limit: 5 },
      });
      const result = JSON.parse((called.content[0] as { text: string }).text);

      expect(result.status).toBe('SOURCE_LOCATORS_ONLY');
      expect(result.rows[0].sourceRef).toContain('tasks.md#L4');
      expect(result.canonicalAuthority).toBe(false);
      expect(result.taskIdentityPromotion).toBe(false);
      expect(result.executableKanban).toBe(false);
      expect(result.writesPerformed).toBe(false);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('searches current ledgers through bounded BM25 and labels hits claim-only', async () => {
    const server = new McpServer({ name: 'openspec-evidence-test-server', version: '1.0.0' });
    registerOpenSpecEvidenceTools(server);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'openspec-evidence-test-client', version: '1.0.0' });

    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const listed = await client.listTools();
      expect(listed.tools.some(({ name }) => name === 'openspec.search')).toBe(true);

      const called = await client.callTool({
        name: 'openspec.search',
        arguments: { query: 'HMM routing user query MCP', limit: 5 },
      });
      const result = JSON.parse((called.content[0] as { text: string }).text);

      expect(result.schema).toBe('atlas.openspec-claim-search.v1');
      expect(result.status).toBe('CLAIM_SEARCH_ONLY');
      expect(result.hits[0].taskId).toBe('TOUR-ROUTING-01');
      expect(result.hits[0].taskRef).toContain('tasks.md#L');
      expect(result.hits[0].ledgerContentDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(result.canonicalAuthority).toBe(false);
      expect(result.evidenceAdmission).toBe(false);
      expect(result.writesPerformed).toBe(false);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
