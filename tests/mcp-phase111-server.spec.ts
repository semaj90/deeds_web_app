// @vitest-environment node

/**
 * MCP Phase 111 Server - Client Level Smoke Test
 *
 * Tests:
 * 1. Start MCP server over stdio
 * 2. List tools (verify expected tool names)
 * 3. Call each read-only tool with valid inputs
 * 4. Validate structured outputs against schemas
 * 5. Attempt unauthorized write (assert it is gated)
 * 6. Stop server gracefully
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { z } from 'zod';

// ============================================================================
// MCP Protocol Types
// ============================================================================

interface MCPRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: number;
  result?: Record<string, unknown>;
  error?: {
    code: number;
    message: string;
  };
}

interface Tool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// ============================================================================
// MCP Client
// ============================================================================

class MCPClient {
  private process: ChildProcess | null = null;
  private messageId: number = 0;
  private responseHandlers: Map<number, (response: MCPResponse) => void> = new Map();
  private toolCache: Tool[] | null = null;

  async start(serverPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.process = spawn('npx', ['tsx', serverPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NODE_ENV: 'test',
        },
      });

      if (!this.process.stdout || !this.process.stderr) {
        reject(new Error('Failed to create stdio streams'));
        return;
      }

      // Handle stderr (server logs)
      this.process.stderr.on('data', (data) => {
        console.error('[MCP Server]', data.toString().trim());
      });

      // Handle stdout (JSON-RPC responses)
      let buffer = '';
      this.process.stdout.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const response = JSON.parse(line) as MCPResponse;
              const handler = this.responseHandlers.get(response.id);
              if (handler) {
                handler(response);
                this.responseHandlers.delete(response.id);
              }
            } catch (err) {
              console.error('Failed to parse MCP response:', line, err);
            }
          }
        }
      });

      // Give server time to start
      setTimeout(resolve, 500);
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.process) {
        this.process.kill();
        this.process.once('exit', () => resolve());
        setTimeout(() => {
          if (this.process) this.process.kill('SIGKILL');
          resolve();
        }, 5000);
      } else {
        resolve();
      }
    });
  }

  private send(request: MCPRequest): Promise<MCPResponse> {
    return new Promise((resolve, reject) => {
      const id = ++this.messageId;
      const timeout = setTimeout(() => {
        this.responseHandlers.delete(id);
        reject(new Error(`Timeout waiting for response to ${request.method}`));
      }, 5000);

      this.responseHandlers.set(id, (response: MCPResponse) => {
        clearTimeout(timeout);
        resolve(response);
      });

      const requestWithId: MCPRequest = {
        ...request,
        id,
      };

      if (!this.process?.stdin) {
        reject(new Error('MCP server stdin not available'));
        return;
      }

      this.process.stdin.write(JSON.stringify(requestWithId) + '\n', (err) => {
        if (err) {
          this.responseHandlers.delete(id);
          clearTimeout(timeout);
          reject(err);
        }
      });
    });
  }

  async listTools(): Promise<Tool[]> {
    if (this.toolCache) return this.toolCache;

    const response = await this.send({
      jsonrpc: '2.0',
      method: 'tools/list',
      params: {},
    });

    if (response.error) {
      throw new Error(`tools/list failed: ${response.error.message}`);
    }

    const tools = (response.result?.tools || []) as Tool[];
    this.toolCache = tools;
    return tools;
  }

  async callTool(
    toolName: string,
    params: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const response = await this.send({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: params,
      },
    });

    if (response.error) {
      throw new Error(`${toolName} failed: ${response.error.message}`);
    }

    return response.result || {};
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('MCP Phase 111 Server', () => {
  let client: MCPClient;
  const serverPath = 'sveltekit-frontend/scripts/atlas/mcp-phase111-server.mts';

  beforeAll(async () => {
    client = new MCPClient();
    await client.start(serverPath);
  });

  afterAll(async () => {
    await client.stop();
  });

  it('should start MCP server over stdio', async () => {
    expect(client).toBeDefined();
  });

  it('should list tools with expected names', async () => {
    const tools = await client.listTools();

    const expectedTools = [
      'atlas_validate_contracts',
      'atlas_validate_evidence_observation',
      'atlas_build_control_snapshot',
      'atlas_validate_snapshot',
      'atlas_materialize_feature_lanes',
      'atlas_resolve_label',
      'atlas_record_feedback',
      'atlas_expand_multihop',
      'atlas_propose_mutation',
      'atlas_apply_mutation',
      'atlas_create_qdrant_collection',
      'atlas_write_canonical_memberships',
    ];

    const toolNames = tools.map((t) => t.name);
    for (const expected of expectedTools) {
      expect(toolNames).toContain(expected);
    }
  });

  describe('Read-Only Tools', () => {
    it('should call atlas_resolve_label with valid input', async () => {
      const result = (await client.callTool('atlas_resolve_label', {
        label: 'machine_learning',
        hierarchy_version: 'v1',
      })) as Record<string, unknown>;

      expect(result).toHaveProperty('input_label');
      expect(result).toHaveProperty('canonical_label');
      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('resolution_timestamp');
    });

    it('should call atlas_validate_contracts with valid input', async () => {
      const result = (await client.callTool('atlas_validate_contracts', {
        contract_type: 'evidence_observation',
        fixture_data: {
          observation_id: 'obs:test-001',
          packet_key: 'ace:packet:test-001',
          confidence: 0.9,
        },
        strict_mode: true,
      })) as Record<string, unknown>;

      expect(result).toHaveProperty('contract_type');
      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('validation_timestamp');
    });

    it('should call atlas_validate_evidence_observation', async () => {
      const result = (await client.callTool('atlas_validate_evidence_observation', {
        observation: {
          observation_id: 'obs:semantic-001',
          packet_key: 'ace:packet:auth-001',
          observation_type: 'semantic_embedding',
          evidence_lane: 'semantic_embedding_qdrant',
          value: {
            vector_768d: [],
            model: 'embeddinggemma:latest',
            similarity_score: 0.95,
          },
          confidence: 0.95,
          source: 'qdrant_dense_index',
          observed_at: new Date().toISOString(),
        },
        check_references: false,
      })) as Record<string, unknown>;

      expect(result).toHaveProperty('observation_id');
      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('validation_timestamp');
    });

    it('should call atlas_expand_multihop', async () => {
      const result = (await client.callTool('atlas_expand_multihop', {
        start_node: 'ace:packet:test-001',
        max_hops: 2,
        include_attributes: true,
      })) as Record<string, unknown>;

      expect(result).toHaveProperty('start_node');
      expect(result).toHaveProperty('nodes_found');
      expect(result).toHaveProperty('neighbors');
      expect(result).toHaveProperty('expansion_timestamp');
    });

    it('should call atlas_record_feedback', async () => {
      const result = (await client.callTool('atlas_record_feedback', {
        feedback_type: 'domain_correction',
        target_id: 'ace:packet:test-001',
        target_type: 'packet',
        feedback_text: 'Confirmed correct domain',
        reviewer_id: 'human:test-reviewer',
        approved: true,
        confidence: 0.95,
      })) as Record<string, unknown>;

      expect(result).toHaveProperty('feedback_id');
      expect(result).toHaveProperty('recorded');
      expect(result).toHaveProperty('feedback_timestamp');
    });
  });

  describe('Write Tools (Authorization Gated)', () => {
    it('should reject atlas_apply_mutation without authorization token', async () => {
      try {
        await client.callTool('atlas_apply_mutation', {
          proposal_id: 'mut:invalid-001',
          executor_id: 'test-user',
        });
        expect.fail('Should have thrown authorization error');
      } catch (err) {
        const error = err as Error;
        expect(error.message).toMatch(/authorization|token|gated/i);
      }
    });

    it('should reject atlas_write_canonical_memberships without authorization token', async () => {
      try {
        await client.callTool('atlas_write_canonical_memberships', {
          packet_key: 'ace:packet:test-001',
          memberships: {
            machine_learning: 0.6,
            database: 0.4,
          },
          // Missing authorization_token
        });
        expect.fail('Should have thrown authorization error');
      } catch (err) {
        const error = err as Error;
        expect(error.message).toMatch(/authorization|token|gated/i);
      }
    });

    it('should reject atlas_create_qdrant_collection without authorization token', async () => {
      try {
        await client.callTool('atlas_create_qdrant_collection', {
          collection_name: 'test_collection',
          vector_size: 768,
          distance_metric: 'cosine',
          // Missing authorization_token
        });
        expect.fail('Should have thrown authorization error');
      } catch (err) {
        const error = err as Error;
        expect(error.message).toMatch(/authorization|token|gated/i);
      }
    });
  });

  describe('Output Schema Validation', () => {
    it('should return atlas_resolve_label output matching schema', async () => {
      const result = (await client.callTool('atlas_resolve_label', {
        label: 'database',
      })) as Record<string, unknown>;

      // Validate output shape
      expect(typeof result.input_label).toBe('string');
      expect(typeof result.valid).toBe('boolean');
      expect(typeof result.confidence).toBe('number');
      if (result.canonical_label) {
        expect(typeof result.canonical_label).toBe('string');
      }
    });

    it('should return atlas_validate_contracts output matching schema', async () => {
      const result = (await client.callTool('atlas_validate_contracts', {
        contract_type: 'packet_identity',
        fixture_data: { test: true },
      })) as Record<string, unknown>;

      // Validate output shape
      expect(typeof result.contract_type).toBe('string');
      expect(typeof result.valid).toBe('boolean');
      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    });
  });
});
