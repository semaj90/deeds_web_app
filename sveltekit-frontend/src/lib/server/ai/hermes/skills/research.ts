import type { SkillRecipe } from './registry.js';

export const RESEARCH_SKILLS: Record<string, SkillRecipe> = {
  playbook_lookup_by_language: {
    id: 'playbook_lookup_by_language',
    family: 'Research',
    description: 'Retrieve legal/compliance playbooks for a specific language intersecting with top codebase files',
    tools: [{ name: 'playbook_lookup_by_language' }]
  },
  deep_research: {
    id: 'deep_research',
    family: 'Research',
    description: 'Perform multi-hop research across vector and web sources',
    tools: [{ name: 'search:vector' }, { name: 'llm:generate' }]
  },
  source_summarize: {
    id: 'source_summarize',
    family: 'Research',
    description: 'Summarize a specific research source',
    tools: [{ name: 'fs:read' }, { name: 'llm:generate' }]
  },
  citation_builder: {
    id: 'citation_builder',
    family: 'Research',
    description: 'Build legal citations for found sources',
    tools: [{ name: 'extract:metadata' }, { name: 'llm:generate' }]
  },
  web_fallback: {
    id: 'web_fallback',
    family: 'Research',
    description: 'Fallback to web search when internal data is missing',
    tools: [{ name: 'web:search' }, { name: 'llm:generate' }]
  },
  compare_sources: {
    id: 'compare_sources',
    family: 'Research',
    description: 'Compare and contrast findings from multiple sources',
    tools: [{ name: 'batch:run' }, { name: 'llm:generate' }]
  },
  write_obsidian_note: {
    id: 'write_obsidian_note',
    family: 'Research',
    description: 'Export research findings to Obsidian vault',
    tools: [{ name: 'memory:write_note' }]
  },
  create_research_brief: {
    id: 'create_research_brief',
    family: 'Research',
    description: 'Generate a high-level brief of research progress',
    tools: [{ name: 'llm:generate' }]
  },
  find_contradictions: {
    id: 'find_contradictions',
    family: 'Research',
    description: 'Identify conflicting evidence across sources',
    tools: [{ name: 'llm:generate' }]
  },
  generate_questions: {
    id: 'generate_questions',
    family: 'Research',
    description: 'Suggest follow-up questions for further research',
    tools: [{ name: 'llm:generate' }]
  },
  trend_analysis: {
    id: 'trend_analysis',
    family: 'Research',
    description: 'Identify emerging trends and patterns across research corpora',
    tools: [{ name: 'search:vector' }, { name: 'llm:generate' }]
  },
  source_provenance_audit: {
    id: 'source_provenance_audit',
    family: 'Research',
    description: 'Verify the origin and reliability of research sources',
    tools: [{ name: 'search:sql' }, { name: 'llm:generate' }]
  },
  multi_perspective_synthesis: {
    id: 'multi_perspective_synthesis',
    family: 'Research',
    description: 'Synthesize research findings from multiple specialized perspectives',
    tools: [{ name: 'batch:run' }, { name: 'llm:generate' }]
  },
  identify_knowledge_gaps: {
    id: 'identify_knowledge_gaps',
    family: 'Research',
    description: 'Analyze research progress to identify missing critical information',
    tools: [{ name: 'llm:generate' }]
  },
  hypothesis_generator: {
    id: 'hypothesis_generator',
    family: 'Research',
    description: 'Generate testable hypotheses based on initial research findings',
    tools: [{ name: 'llm:generate' }]
  },
  fact_check_claims: {
    id: 'fact_check_claims',
    family: 'Research',
    description: 'Fact-check specific claims against a trusted knowledge base',
    tools: [{ name: 'search:vector' }, { name: 'llm:generate' }]
  },
  literature_review_builder: {
    id: 'literature_review_builder',
    family: 'Research',
    description: 'Automate the creation of a comprehensive literature review',
    tools: [{ name: 'batch:run' }, { name: 'llm:generate' }]
  },
  detect_research_redundancy: {
    id: 'detect_research_redundancy',
    family: 'Research',
    description: 'Identify redundant research efforts within the swarm',
    tools: [{ name: 'llm:generate' }]
  },
  cross_domain_mapping: {
    id: 'cross_domain_mapping',
    family: 'Research',
    description: 'Map research findings from one domain to another (e.g., tech to legal)',
    tools: [{ name: 'llm:generate' }]
  },
  automated_citation_validation: {
    id: 'automated_citation_validation',
    family: 'Research',
    description: 'Verify that all citations in a research report are valid and reachable',
    tools: [{ name: 'search:sql' }, { name: 'shell:run' }]
  }
};
