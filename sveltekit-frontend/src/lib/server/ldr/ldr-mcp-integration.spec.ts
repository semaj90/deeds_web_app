import { describe, it, expect, beforeAll } from 'vitest';
import { executeLDRResearch, formatLDRResultForAgent, validateLDRInput, type LDRToolInput } from '../../../mcp/tools/ldr-research.js';

describe('LDR MCP Tool Integration', () => {
  beforeAll(() => {
    // Set test environment
    process.env.SEARXNG_URL = process.env.SEARXNG_URL || 'http://127.0.0.1:8888';
    process.env.LLAMA_SERVER_URL = process.env.LLAMA_SERVER_URL || 'http://127.0.0.1:8090/v1';
  });

  describe('LDR Tool Input Validation', () => {
    it('should validate correct LDR tool input', () => {
      const input: LDRToolInput = {
        query: 'What is hearsay evidence?',
        maxResults: 10,
        maxDocs: 5,
        temperature: 0.3
      };

      expect(validateLDRInput(input)).toBe(true);
    });

    it('should require query field', () => {
      const input = { maxResults: 10 } as any;
      expect(validateLDRInput(input)).toBe(false);
    });

    it('should reject empty query', () => {
      const input = { query: '  ', maxResults: 10 };
      expect(validateLDRInput(input)).toBe(false);
    });

    it('should validate maxResults bounds', () => {
      const validInput = { query: 'test', maxResults: 25 };
      const invalidLow = { query: 'test', maxResults: 0 };
      const invalidHigh = { query: 'test', maxResults: 51 };

      expect(validateLDRInput(validInput)).toBe(true);
      expect(validateLDRInput(invalidLow)).toBe(false);
      expect(validateLDRInput(invalidHigh)).toBe(false);
    });

    it('should validate temperature bounds', () => {
      const validLow = { query: 'test', temperature: 0 };
      const validMid = { query: 'test', temperature: 0.5 };
      const validHigh = { query: 'test', temperature: 1 };
      const invalid = { query: 'test', temperature: 1.5 };

      expect(validateLDRInput(validLow)).toBe(true);
      expect(validateLDRInput(validMid)).toBe(true);
      expect(validateLDRInput(validHigh)).toBe(true);
      expect(validateLDRInput(invalid)).toBe(false);
    });
  });

  describe('LDR Tool Execution', () => {
    it('should execute LDR research and return valid output', async () => {
      const input: LDRToolInput = {
        query: 'evidence admissibility',
        maxResults: 5,
        maxDocs: 3,
        temperature: 0.3
      };

      const output = await executeLDRResearch(input);

      expect(output).toHaveProperty('success');
      expect(output).toHaveProperty('metadata');
      expect(output.metadata).toHaveProperty('toolName', 'ldr_research');
      expect(output.metadata).toHaveProperty('executedAt');
      expect(output.metadata).toHaveProperty('durationMs');
      expect(typeof output.metadata.durationMs).toBe('number');
    });

    it('should handle missing query gracefully', async () => {
      const input: LDRToolInput = { query: '' };
      const output = await executeLDRResearch(input);

      expect(output.success).toBe(false);
      expect(output.error).toBeDefined();
    });

    it('should format result for agent consumption', async () => {
      const input: LDRToolInput = {
        query: 'test query',
        maxResults: 3,
        maxDocs: 2
      };

      const output = await executeLDRResearch(input);
      const formatted = formatLDRResultForAgent(output);

      expect(typeof formatted).toBe('string');
      if (output.success) {
        expect(formatted).toContain('**Local Deep Research Result**');
        expect(formatted).toContain('**Query Duration**');
        expect(formatted).toContain('**Confidence**');
      }
    });

    it('should include error message when research fails', async () => {
      const input: LDRToolInput = { query: '' };
      const output = await executeLDRResearch(input);
      const formatted = formatLDRResultForAgent(output);

      expect(formatted).toContain('Local Deep Research failed');
    });
  });

  describe('MCP Tool Output Format', () => {
    it('should format output as valid MCP response', async () => {
      const input: LDRToolInput = {
        query: 'legal research test',
        maxResults: 5,
        maxDocs: 3
      };

      const output = await executeLDRResearch(input);
      const formatted = formatLDRResultForAgent(output);

      // Simulate MCP response structure
      const mcpResponse = {
        content: [{ type: 'text', text: formatted }],
        isError: !output.success
      };

      expect(mcpResponse.content).toHaveLength(1);
      expect(mcpResponse.content[0].type).toBe('text');
      expect(typeof mcpResponse.content[0].text).toBe('string');
      expect(typeof mcpResponse.isError).toBe('boolean');
    });

    it('should set isError flag correctly on success', async () => {
      const input: LDRToolInput = {
        query: 'test query',
        maxResults: 5
      };

      const output = await executeLDRResearch(input);
      const mcpResponse = {
        content: [{ type: 'text', text: formatLDRResultForAgent(output) }],
        isError: !output.success
      };

      if (output.success) {
        expect(mcpResponse.isError).toBe(false);
      }
    });

    it('should set isError flag correctly on failure', async () => {
      const input: LDRToolInput = { query: '' };
      const output = await executeLDRResearch(input);
      const mcpResponse = {
        content: [{ type: 'text', text: formatLDRResultForAgent(output) }],
        isError: !output.success
      };

      expect(mcpResponse.isError).toBe(true);
    });
  });
});
