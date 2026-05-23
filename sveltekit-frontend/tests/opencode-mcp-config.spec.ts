import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function readJson(filePath: string) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

describe('opencode MCP wiring', () => {
  const frontendRoot = process.cwd();
  const repoRoot = path.resolve(frontendRoot, '..');
  const frontendConfigPath = path.join(frontendRoot, 'opencode.json');
  const rootConfigPath = path.join(repoRoot, 'opencode.jsonc');
  const atlasDocPath = path.join(repoRoot, 'docs', 'ai-os', 'opencode-mcp-atlas.md');
  const commandDocPath = path.join(repoRoot, '.opencode', 'command', 'mcp-health.md');
  const rgAtlasCommandPath = path.join(repoRoot, '.opencode', 'command', 'rg-atlas.md');
  const mcpTraceCommandPath = path.join(repoRoot, '.opencode', 'command', 'mcp-trace.md');
  const mcpTurboVecCommandPath = path.join(repoRoot, '.opencode', 'command', 'mcp-turbovec.md');
  const mcpEngramCommandPath = path.join(repoRoot, '.opencode', 'command', 'mcp-engram.md');
  const mcpLangExtractCommandPath = path.join(repoRoot, '.opencode', 'command', 'mcp-langextract.md');
  const rgAtlasAgentPath = path.join(repoRoot, '.opencode', 'agents', 'rg-atlas.md');
  const mcpToolchainAgentPath = path.join(repoRoot, '.opencode', 'agents', 'mcp-toolchain.md');
  const traceMcpToolingAgentPath = path.join(
    repoRoot,
    '.opencode',
    'agents',
    'trace-mcp-tooling.md'
  );
  const metadataContextAgentPath = path.join(
    repoRoot,
    '.opencode',
    'agents',
    'metadata-context-analysis.md'
  );
  const rgAtlasSkillPath = path.join(repoRoot, '.opencode', 'skills', 'rg-atlas', 'SKILL.md');
  const mcpToolchainSkillPath = path.join(repoRoot, '.opencode', 'skills', 'mcp-toolchain', 'SKILL.md');
  const traceMcpToolingSkillPath = path.join(
    repoRoot,
    '.opencode',
    'skills',
    'trace-mcp-tooling',
    'SKILL.md'
  );
  const metadataContextSkillPath = path.join(
    repoRoot,
    '.opencode',
    'skills',
    'metadata-context-analysis',
    'SKILL.md'
  );

  it('keeps required frontend MCP servers enabled with expected endpoints', () => {
    const cfg = readJson(frontendConfigPath);
    expect(cfg.mcp).toBeTruthy();

    expect(cfg.mcp.trace).toMatchObject({
      type: 'remote',
      url: 'http://127.0.0.1:8788/mcp',
      enabled: true,
    });
    expect(cfg.mcp.turbovec).toMatchObject({
      type: 'remote',
      url: 'http://127.0.0.1:8791/mcp',
      enabled: true,
    });
    expect(cfg.mcp.engram).toMatchObject({
      type: 'remote',
      url: 'http://127.0.0.1:8792/mcp',
      enabled: true,
    });
    expect(cfg.mcp['langextract-remote']).toMatchObject({
      type: 'remote',
      url: 'http://127.0.0.1:8793/mcp',
      enabled: true,
    });

    expect(cfg.mcp['gemma4-offload']).toMatchObject({
      type: 'local',
      command: 'node',
      enabled: true,
    });
    expect(Array.isArray(cfg.mcp['gemma4-offload'].args)).toBe(true);
    expect(cfg.mcp['gemma4-offload'].args).toContain('scripts/mcp/gemma4-offload-mcp.mjs');

    expect(cfg.permission).toMatchObject({
      skill: 'allow',
      'trace_*': 'allow',
      'turbovec_*': 'allow',
      'engram_*': 'allow',
      'langextract_*': 'allow',
    });
    expect(cfg.skills?.paths).toContain('../.opencode/skills');
  });

  it('contains resource labels for docs and datastore lanes', () => {
    const cfg = readJson(frontendConfigPath);
    expect(Array.isArray(cfg.resources)).toBe(true);

    const resourceNames = new Set(cfg.resources.map((r: any) => r.name));
    expect(resourceNames.has('svelte')).toBe(true);
    expect(resourceNames.has('reactNpm')).toBe(true);
    expect(resourceNames.has('drizzleNpm')).toBe(true);
    expect(resourceNames.has('qdrantNpm')).toBe(true);
    expect(resourceNames.has('redisNpm')).toBe(true);

    const allLabels = new Set(
      cfg.resources.flatMap((r: any) => (Array.isArray(r.labels) ? r.labels : []))
    );
    for (const label of ['postgresql', 'drizzle', 'qdrant', 'clusters', 'redis', 'cards']) {
      expect(allLabels.has(label)).toBe(true);
    }
  });

  it('keeps root opencode jsonc aligned with bifrost provider and MCP endpoints', () => {
    const cfg = readJson(rootConfigPath);
    expect(cfg.model).toBe('bifrost-local/gemma4-offload');
    expect(cfg.provider?.['bifrost-local']).toBeTruthy();
    expect(cfg.permission).toMatchObject({
      skill: 'allow',
      'trace_*': 'allow',
      'turbovec_*': 'allow',
      'engram_*': 'allow',
      'langextract_*': 'allow',
    });
    expect(cfg.skills?.paths).toContain('./.opencode/skills');
    expect(cfg.mcp?.trace?.url).toBe('http://127.0.0.1:8788/mcp');
    expect(cfg.mcp?.turbovec?.url).toBe('http://127.0.0.1:8791/mcp');
    expect(cfg.mcp?.engram?.url).toBe('http://127.0.0.1:8792/mcp');
    expect(cfg.mcp?.langextract?.url).toBe('http://127.0.0.1:8793/mcp');
  });

  it('ships the required OpenCode docs and command prompt', () => {
    expect(fs.existsSync(atlasDocPath)).toBe(true);
    expect(fs.existsSync(commandDocPath)).toBe(true);
    expect(fs.existsSync(rgAtlasCommandPath)).toBe(true);
    expect(fs.existsSync(mcpTraceCommandPath)).toBe(true);
    expect(fs.existsSync(mcpTurboVecCommandPath)).toBe(true);
    expect(fs.existsSync(mcpEngramCommandPath)).toBe(true);
    expect(fs.existsSync(mcpLangExtractCommandPath)).toBe(true);
    expect(fs.existsSync(rgAtlasAgentPath)).toBe(true);
    expect(fs.existsSync(mcpToolchainAgentPath)).toBe(true);
    expect(fs.existsSync(traceMcpToolingAgentPath)).toBe(true);
    expect(fs.existsSync(metadataContextAgentPath)).toBe(true);
    expect(fs.existsSync(rgAtlasSkillPath)).toBe(true);
    expect(fs.existsSync(mcpToolchainSkillPath)).toBe(true);
    expect(fs.existsSync(traceMcpToolingSkillPath)).toBe(true);
    expect(fs.existsSync(metadataContextSkillPath)).toBe(true);

    const atlasDoc = fs.readFileSync(atlasDocPath, 'utf8');
    const commandDoc = fs.readFileSync(commandDocPath, 'utf8');
    const rgAtlasCommand = fs.readFileSync(rgAtlasCommandPath, 'utf8');
    const mcpTraceCommand = fs.readFileSync(mcpTraceCommandPath, 'utf8');
    const mcpTurboVecCommand = fs.readFileSync(mcpTurboVecCommandPath, 'utf8');
    const mcpEngramCommand = fs.readFileSync(mcpEngramCommandPath, 'utf8');
    const mcpLangExtractCommand = fs.readFileSync(mcpLangExtractCommandPath, 'utf8');
    const rgAtlasAgent = fs.readFileSync(rgAtlasAgentPath, 'utf8');
    const mcpToolchainAgent = fs.readFileSync(mcpToolchainAgentPath, 'utf8');
    const traceMcpToolingAgent = fs.readFileSync(traceMcpToolingAgentPath, 'utf8');
    const metadataContextAgent = fs.readFileSync(metadataContextAgentPath, 'utf8');
    const rgAtlasSkill = fs.readFileSync(rgAtlasSkillPath, 'utf8');
    const mcpToolchainSkill = fs.readFileSync(mcpToolchainSkillPath, 'utf8');
    const traceMcpToolingSkill = fs.readFileSync(traceMcpToolingSkillPath, 'utf8');
    const metadataContextSkill = fs.readFileSync(metadataContextSkillPath, 'utf8');

    expect(atlasDoc).toContain('Do not delete existing MCP tools.');
    expect(atlasDoc).toContain('RabbitMQ remains backend-only.');
    expect(commandDoc).toContain('Run MCP health checks.');
    expect(commandDoc).toContain('Do not delete tools.');
    expect(rgAtlasCommand).toContain('Run the tool-first retrieval lane');
    expect(rgAtlasCommand).toContain('LangExtract-style compact extraction');
    expect(mcpTraceCommand).toContain('Use TRACE MCP tools first');
    expect(mcpTurboVecCommand).toContain('Use TurboVec MCP tools');
    expect(mcpEngramCommand).toContain('Use Engram MCP tools');
    expect(mcpLangExtractCommand).toContain('Use LangExtract MCP tools');
    expect(rgAtlasAgent).toContain('rg-atlas retrieval agent');
    expect(rgAtlasAgent).toContain('trace_*');
    expect(mcpToolchainAgent).toContain('mcp-toolchain agent');
    expect(mcpToolchainAgent).toContain('trace: gather exact code and graph context');
    expect(traceMcpToolingAgent).toContain('trace-mcp-tooling agent');
    expect(metadataContextAgent).toContain('metadata-context-analysis agent');
    expect(rgAtlasSkill).toContain('name: rg-atlas');
    expect(rgAtlasSkill).toContain('Exact repo search and compact extraction lane');
    expect(mcpToolchainSkill).toContain('name: mcp-toolchain');
    expect(mcpToolchainSkill).toContain('Run the four-server MCP retrieval chain');
    expect(traceMcpToolingSkill).toContain('name: trace-mcp-tooling');
    expect(metadataContextSkill).toContain('name: metadata-context-analysis');
  });
});
