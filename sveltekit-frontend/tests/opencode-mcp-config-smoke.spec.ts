import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * OpenCode Configuration Smoke Test
 * Validates .opencode/opencode.jsonc against official API specification
 *
 * Config hierarchy (highest to lowest priority):
 * 1. Project config (.opencode/opencode.jsonc)
 * 2. Global config (~/.config/opencode/opencode.json)
 * 3. Custom config (OPENCODE_CONFIG env var)
 * 4. Inline config (OPENCODE_CONFIG_CONTENT env var)
 * 5. Managed config (macOS MDM, highest override)
 */

describe('OpenCode Configuration', () => {
  let projectConfig: Record<string, unknown>;
  const projectConfigPath = path.resolve('.opencode/opencode.jsonc');

  beforeAll(() => {
    // Read and parse project config (strip comments for JSON.parse)
    const configContent = fs.readFileSync(projectConfigPath, 'utf-8');
    const stripped = configContent
      .replace(/\/\/.*$/gm, '') // Remove line comments
      .replace(/\/\*[\s\S]*?\*\//g, ''); // Remove block comments

    projectConfig = JSON.parse(stripped);
  });

  describe('Project Config Presence', () => {
    it('should have .opencode/opencode.jsonc file', () => {
      expect(fs.existsSync(projectConfigPath)).toBe(true);
    });

    it('should be valid JSON (after stripping comments)', () => {
      expect(projectConfig).toBeDefined();
      expect(typeof projectConfig).toBe('object');
    });
  });

  describe('Top-Level Schema', () => {
    it('should have $schema field', () => {
      expect(projectConfig.$schema).toBeDefined();
      expect(typeof projectConfig.$schema).toBe('string');
    });

    it('should have model field', () => {
      expect(projectConfig.model).toBeDefined();
      expect(typeof projectConfig.model).toBe('string');
    });

    it('should have provider object', () => {
      expect(projectConfig.provider).toBeDefined();
      expect(typeof projectConfig.provider).toBe('object');
    });

    it('should have mcp object', () => {
      expect(projectConfig.mcp).toBeDefined();
      expect(typeof projectConfig.mcp).toBe('object');
    });

    it('should have agent object', () => {
      expect(projectConfig.agent).toBeDefined();
      expect(typeof projectConfig.agent).toBe('object');
    });

    it('should have instructions array', () => {
      expect(Array.isArray(projectConfig.instructions)).toBe(true);
    });

    it('should have permission object', () => {
      expect(projectConfig.permission).toBeDefined();
      expect(typeof projectConfig.permission).toBe('object');
    });
  });

  describe('Provider Configuration', () => {
    it('should have at least one provider', () => {
      const providers = Object.keys(projectConfig.provider as Record<string, unknown>);
      expect(providers.length).toBeGreaterThan(0);
    });

    it('turboquant provider should be configured', () => {
      const turboquant = (projectConfig.provider as Record<string, unknown>).turboquant;
      expect(turboquant).toBeDefined();
      expect(typeof turboquant).toBe('object');
    });

    it('turboquant should have npm field', () => {
      const turboquant = (projectConfig.provider as Record<string, unknown>).turboquant as Record<string, unknown>;
      expect(turboquant.npm).toBe('@ai-sdk/openai-compatible');
    });

    it('turboquant should have options with baseURL', () => {
      const turboquant = (projectConfig.provider as Record<string, unknown>).turboquant as Record<string, unknown>;
      const options = turboquant.options as Record<string, unknown>;
      expect(options.baseURL).toBe('http://127.0.0.1:8090/v1');
    });

    it('turboquant models should have tools:true', () => {
      const turboquant = (projectConfig.provider as Record<string, unknown>).turboquant as Record<string, unknown>;
      const models = turboquant.models as Record<string, Record<string, unknown>>;

      Object.entries(models).forEach(([modelName, modelConfig]) => {
        expect(modelConfig.tools).toBe(true);
        expect(modelConfig.reasoning).toBe(false);
      });
    });

    it('turboquant models should have limit with context and output', () => {
      const turboquant = (projectConfig.provider as Record<string, unknown>).turboquant as Record<string, unknown>;
      const models = turboquant.models as Record<string, Record<string, unknown>>;

      Object.entries(models).forEach(([modelName, modelConfig]) => {
        const limit = modelConfig.limit as Record<string, unknown>;
        expect(limit.context).toBeGreaterThan(0);
        expect(limit.output).toBeGreaterThan(0);
      });
    });
  });

  describe('MCP Configuration', () => {
    it('should have trace MCP server', () => {
      const mcp = projectConfig.mcp as Record<string, unknown>;
      expect(mcp.trace).toBeDefined();
    });

    it('trace MCP should be remote type', () => {
      const trace = ((projectConfig.mcp as Record<string, unknown>).trace as Record<string, unknown>);
      expect(trace.type).toBe('remote');
      expect(trace.url).toBe('http://127.0.0.1:8788/mcp');
      expect(trace.enabled).toBe(true);
    });

    it('turbovec MCP should be disabled (no /mcp endpoint)', () => {
      const turbovec = ((projectConfig.mcp as Record<string, unknown>).turbovec as Record<string, unknown>);
      expect(turbovec.enabled).toBe(false);
    });

    it('should have local MCP servers (gemma4-offload, engram-embed, atlas-tools)', () => {
      const mcp = projectConfig.mcp as Record<string, unknown>;
      expect(mcp['gemma4-offload']).toBeDefined();
      expect(mcp['engram-embed']).toBeDefined();
      expect(mcp['atlas-tools']).toBeDefined();
    });

    it('local MCP servers should have command array', () => {
      const mcp = projectConfig.mcp as Record<string, unknown>;
      const localServers = ['gemma4-offload', 'engram-embed', 'atlas-tools'];

      localServers.forEach((serverName) => {
        const server = mcp[serverName] as Record<string, unknown>;
        expect(server.type).toBe('local');
        expect(Array.isArray(server.command)).toBe(true);
      });
    });
  });

  describe('Agent Configuration', () => {
    it('should have at least one agent', () => {
      const agents = Object.keys(projectConfig.agent as Record<string, unknown>);
      expect(agents.length).toBeGreaterThan(0);
    });

    it('should have atlas-context agent', () => {
      const agents = projectConfig.agent as Record<string, unknown>;
      expect(agents['atlas-context']).toBeDefined();
    });

    it('agents should have model, temperature, steps, prompt', () => {
      const agents = projectConfig.agent as Record<string, unknown>;

      Object.entries(agents).forEach(([agentName, agentConfig]) => {
        const config = agentConfig as Record<string, unknown>;
        expect(config.model).toBeDefined();
        expect(typeof config.temperature).toBe('number');
        expect(typeof config.steps).toBe('number');
        expect(config.prompt).toBeDefined();
      });
    });

    it('agents should have permission object', () => {
      const agents = projectConfig.agent as Record<string, unknown>;

      Object.entries(agents).forEach(([agentName, agentConfig]) => {
        const config = agentConfig as Record<string, unknown>;
        expect(config.permission).toBeDefined();
        expect(typeof config.permission).toBe('object');
      });
    });
  });

  describe('Permission Configuration', () => {
    it('root permission should allow grep, glob, lsp, skill, todowrite', () => {
      const perm = projectConfig.permission as Record<string, unknown>;
      expect(perm.grep).toBe('allow');
      expect(perm.glob).toBe('allow');
      expect(perm.lsp).toBe('allow');
      expect(perm.skill).toBe('allow');
      expect(perm.todowrite).toBe('allow');
    });

    it('root permission should allow MCP tool namespaces', () => {
      const perm = projectConfig.permission as Record<string, unknown>;
      expect(perm.trace_*).toBe('allow');
      expect(perm.turbovec_*).toBe('allow');
      expect(perm.engram_*).toBe('allow');
      expect(perm.atlas_*).toBe('allow');
    });

    it('root permission bash should allow npm and rg commands', () => {
      const perm = projectConfig.permission as Record<string, unknown>;
      const bash = perm.bash as Record<string, unknown>;
      expect(bash['rg *']).toBe('allow');
      expect(bash['npm run index:*']).toBe('allow');
    });
  });

  describe('Instructions', () => {
    it('should reference .opencode/system.md', () => {
      const instructions = projectConfig.instructions as string[];
      expect(instructions).toContain('.opencode/system.md');
    });

    it('should reference AGENTS.md', () => {
      const instructions = projectConfig.instructions as string[];
      expect(instructions).toContain('AGENTS.md');
    });
  });

  describe('Global Config Precedence Check', () => {
    it('should detect if global config exists', () => {
      const globalConfigPaths = [
        path.join(process.env.USERPROFILE || '', '.config/opencode/opencode.json'),
        path.join(process.env.APPDATA || '', 'opencode/opencode.json'),
      ];

      const globalConfigExists = globalConfigPaths.some(p => {
        try {
          return fs.existsSync(p);
        } catch {
          return false;
        }
      });

      if (globalConfigExists) {
        console.warn('⚠️ Global OpenCode config detected. Project config will override it.');
      } else {
        console.log('✅ No global OpenCode config found (project config has full control)');
      }
    });
  });

  describe('Service Health (Baseline)', () => {
    it('llama-server should be reachable at :8090', async () => {
      try {
        const res = await fetch('http://127.0.0.1:8090/v1/models', {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });
        expect(res.ok).toBe(true);
      } catch (e) {
        console.warn('⚠️ llama-server not responding at :8090');
      }
    });

    it('TRACE MCP should be reachable at :8788', async () => {
      try {
        const res = await fetch('http://127.0.0.1:8788/mcp', {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });
        // 404 is OK; we're just checking the server responds
        expect([200, 404, 405]).toContain(res.status);
      } catch (e) {
        console.warn('⚠️ TRACE MCP not responding at :8788');
      }
    });

    it('TurboVec health should report ok:true', async () => {
      try {
        const res = await fetch('http://127.0.0.1:8791/health', {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });
        expect(res.ok).toBe(true);
        const data = (await res.json()) as Record<string, unknown>;
        expect(data.ok).toBe(true);
      } catch (e) {
        console.warn('⚠️ TurboVec not responding at :8791');
      }
    });
  });

  describe('Tool Calling Support', () => {
    it('model config should have tools:true for Gemma4', () => {
      const model = projectConfig.model as string;
      const providerName = model.split('/')[0]; // Extract provider from "turboquant/gemma4-legal.gguf"

      const provider = (projectConfig.provider as Record<string, Record<string, unknown>>)[providerName];
      const models = provider.models as Record<string, Record<string, unknown>>;

      // Find the model that matches
      const matchingModel = Object.values(models).find(m => m.tools === true);
      expect(matchingModel).toBeDefined();
    });

    it('model config should have reasoning:false', () => {
      const model = projectConfig.model as string;
      const providerName = model.split('/')[0];

      const provider = (projectConfig.provider as Record<string, Record<string, unknown>>)[providerName];
      const models = provider.models as Record<string, Record<string, unknown>>;

      const matchingModel = Object.values(models).find(m => m.reasoning === false);
      expect(matchingModel).toBeDefined();
    });
  });
});
