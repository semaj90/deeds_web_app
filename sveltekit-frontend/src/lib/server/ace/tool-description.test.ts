import { describe, expect, it } from 'vitest';
import { buildToolDescription, withDescription } from './tool-description';

describe('tool-description', () => {
  it('prefers the graph recovery command description', () => {
    expect(buildToolDescription('npm run recover:graph')).toBe(
      'Recover graph export artifacts and validate recovery outputs'
    );
  });

  it('recognizes retrieval and vector-search commands', () => {
    expect(buildToolDescription('node scripts/atlas/qdrant-tag-backfill.mjs')).toBe(
      'Query the semantic vector index and payload tags'
    );
    expect(buildToolDescription('powershell.exe -File smoke-duckdb.ps1')).toBe(
      'Run DuckDB export contract smoke test'
    );
  });

  it('handles graph ranking hints and ACE cache commands', () => {
    expect(buildToolDescription('node scripts/atlas/webgpu-pagerank-mapreduce.mjs')).toBe(
      'Compute graph ranking or batch reduction hints'
    );
    expect(buildToolDescription('redis-cli GET ace:packet:foo')).toBe(
      'Read or write Redis ACE packet cache'
    );
  });

  it('returns a safe fallback for unknown commands', () => {
    expect(buildToolDescription('custom-command --flag')).toBe(
      'Execute command safely: custom-command --flag'
    );
  });

  it('normalizes whitespace in withDescription', () => {
    expect(withDescription('  npm   run   graph:exports   ').command).toBe('npm run graph:exports');
  });
});
