import type { SkillRecipe } from './registry.js';

export const RESEARCH_SKILLS: Record<string, SkillRecipe> = {
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
    tools: [{ name: 'http:fetch' }, { name: 'llm:generate' }]
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
  }
};
