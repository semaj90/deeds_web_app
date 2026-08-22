import { describe, expect, it } from 'vitest';
import { rankTools } from '../../src/lib/server/hmm/tool-router-hmm';
import { toolRouterContractSchema } from '../../src/lib/server/hmm/tool-router-schema';
import contract from '../../docs/contracts/tool-router-hmm.okf.json';

describe('HMM tool router', () => {
  it('routes code intent to rg/ast-grep first', () => {
    const ranked = rankTools({
      query: 'where is session validation implemented',
      keywordScore: 0.9,
      astIntentScore: 0.85,
      semanticScore: 0.4,
      graphScore: 0.2,
      packetValidationScore: 0.1,
      priorToolSuccess: 0.8,
      latencyScore: 0.9,
    });

    expect(['rg.search', 'ast_grep.search']).toContain(ranked[0].tool);
  });

  it('does not synthesize when packet validation is weak', () => {
    const ranked = rankTools({
      query: 'explain auth system',
      keywordScore: 0.4,
      astIntentScore: 0.2,
      semanticScore: 0.8,
      graphScore: 0.5,
      packetValidationScore: 0.2,
      priorToolSuccess: 0.8,
      latencyScore: 0.8,
    });

    const gemma = ranked.find((r) => r.tool === 'gemma4.synthesize');
    expect(gemma?.score ?? 0).toBe(0);
    expect(gemma?.allowed).toBe(false);
  });

  it('blocks Gemma4 synthesis in quarantine', () => {
    const ranked = rankTools({
      query: 'summarize quarantined packet',
      keywordScore: 0.2,
      astIntentScore: 0.1,
      semanticScore: 0.9,
      graphScore: 0.1,
      packetValidationScore: 0.95,
      priorToolSuccess: 0.8,
      latencyScore: 0.5,
      state: 'QUARANTINE',
    });

    const gemma = ranked.find((r) => r.tool === 'gemma4.synthesize');
    expect(gemma?.allowed).toBe(false);
    expect(gemma?.reason).toBe('quarantine_blocks_synthesis');
  });

  it('validates the OKF contract', () => {
    const parsed = toolRouterContractSchema.parse(contract);
    expect(parsed.tools).toContain('qdrant.search');
    expect(parsed.smoke_gates.all_tools_indexed).toBe(true);
  });
});

