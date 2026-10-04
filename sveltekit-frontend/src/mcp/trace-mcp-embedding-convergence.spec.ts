import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/mcp/trace-mcp-server.ts'), 'utf8');

describe('TRACE MCP embedding convergence', () => {
  it('routes embedding execution through the shared API with an explicit recipe', () => {
    expect(source.match(/\/api\/embed(?=['"`])/g)).toHaveLength(1);
    expect(source).toContain("sveltePost('/api/embed', { text: safeQuery, taskMode: mode })");
  });

  it('does not call Ollama embedding endpoints directly', () => {
    expect(source).not.toContain('/api/embeddings');
  });

  it('namespaces cached vectors by recipe mode and never falls back to raw endpoint execution', () => {
    expect(source).toContain('embed:mcp:v2:${mode}:${keyDigest}');
    expect(source).toContain('SEMANTIC_REPRESENTATION_ID}\\0${mode}\\0${promptRevision}');
    expect(source).toContain('inputRecipe.mode !== mode || inputRecipe.promptRevision !== promptRevision');
    expect(source).toContain('Canonical embedding API unavailable; direct executor fallback is disabled.');
    expect(source).not.toContain('embed:mcp:${createHash');
  });
});
