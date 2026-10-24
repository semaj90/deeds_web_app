import { describe, it, expect } from 'vitest';
import { createAutonomousAgent, AutonomousAgent } from './autonomous-agent.js';

describe('AutonomousAgent LangGraph & OAK Boundary Tests', () => {
  it('instantiates and includes oak_resolve_concept in tool instances', () => {
    const agent = createAutonomousAgent({ proposalOnly: true });
    const tools = agent.getToolInstances();
    const oakTool = tools.find((t) => t.name === 'oak_resolve_concept');
    expect(oakTool).toBeDefined();
    expect(oakTool?.description).toContain('OAK ontology kernel');
  });

  it('enforces LangGraph Boundary: mutation tools return structured proposals by default', async () => {
    const agent = new AutonomousAgent(); // default proposalOnly: true
    const tools = agent.getToolInstances();
    const casesCreateTool = tools.find((t) => t.name === 'cases_create');
    expect(casesCreateTool).toBeDefined();

    const resultStr = await (casesCreateTool as any).func({
      title: 'State v. Smith',
      description: 'Test case proposal',
      status: 'open',
      priority: 'high',
    });

    const parsed = JSON.parse(resultStr);
    expect(parsed.status).toBe('PROPOSED_MUTATION');
    expect(parsed.tool).toBe('cases_create');
    expect(parsed.admitted).toBe(false);
    expect(parsed.reason).toContain('LangGraph Boundary');
    expect(parsed.proposal.title).toBe('State v. Smith');
  });

  it('selects oak_resolve_concept on ontology/taxonomy queries', () => {
    const agent = new AutonomousAgent();
    // Access private selectTools via indexing
    const selected = (agent as any).selectTools('resolve ontology concept for legal evidence');
    expect(selected).toContain('oak_resolve_concept');
    expect(selected).toContain('glossary_search');
  });
});
