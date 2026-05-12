/**
 * Hermes Repair Skills
 * 
 * Recipes for system diagnostics and self-healing.
 */

import type { SkillRecipe } from './registry.js';

export const REPAIR_SKILLS: Record<string, SkillRecipe> = {
  'check_services': {
    id: 'check_services',
    family: 'Repair',
    description: 'Verify health of all core services (Postgres, Redis, Qdrant, Neo4j, CouchDB, Ollama)',
    tools: [
      {
        name: 'diagnostics:health'
      }
    ]
  },
  'infer_pipeline_gaps': {
    id: 'infer_pipeline_gaps',
    family: 'Repair',
    description: 'Analyze the indexing pipeline for missing states or stale artifacts',
    tools: [
      {
        name: 'diagnostics:pipeline_gaps'
      }
    ]
  },
  'repair_missing_summary': {
    id: 'repair_missing_summary',
    family: 'Repair',
    description: 'Identify files missing summaries and trigger generation',
    tools: [
      {
        name: 'search:sql',
        args: () => ({
          query: "SELECT file_path FROM codebase_chunk_index WHERE ai_summary IS NULL LIMIT 20"
        })
      },
      {
        name: 'batch:run',
        args: (prev) => ({
          tool: 'llm:generate',
          items: prev.rows.map((r: any) => ({ prompt: `Summarize the file at ${r.file_path}` }))
        })
      }
    ]
  },
  'validate_env': {
    id: 'validate_env',
    family: 'Repair',
    description: 'Validate environment variables and network connectivity',
    tools: [
      {
        name: 'shell:run',
        args: () => ({
          command: 'npm run validate:env'
        })
      }
    ]
  }
};
