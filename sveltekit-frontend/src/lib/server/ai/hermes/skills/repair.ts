import type { SkillRecipe } from './registry.js';

export const REPAIR_SKILLS: Record<string, SkillRecipe> = {
  auto_fix_lint_errors: {
    id: 'auto_fix_lint_errors',
    family: 'Repair',
    description: 'Automatically resolve common TypeScript/Svelte linting errors in the current file',
    tools: [{ name: 'shell:run', args: (input) => ({ command: `npx eslint --fix ${input.file}` }) }]
  },
  repair_broken_wiki_links: {
    id: 'repair_broken_wiki_links',
    family: 'Repair',
    description: 'Identify and fix broken internal links between wiki cards or documents',
    tools: [{ name: 'search:couchdb' }, { name: 'llm:generate' }, { name: 'memory:write_note' }]
  },
  database_index_rebuild: {
    id: 'database_index_rebuild',
    family: 'Repair',
    description: 'Re-trigger the creation of fragmented or missing database indices',
    tools: [{ name: 'shell:run' }]
  },
  reconcile_missing_vector_payloads: {
    id: 'reconcile_missing_vector_payloads',
    family: 'Repair',
    description: 'Find vectors in Qdrant with missing metadata and backfill from primary DB',
    tools: [{ name: 'search:vector' }, { name: 'search:sql' }]
  },
  self_heal_broken_dependencies: {
    id: 'self_heal_broken_dependencies',
    family: 'Repair',
    description: 'Detect and attempt to fix missing npm packages or broken local imports',
    tools: [{ name: 'shell:run' }, { name: 'llm:generate' }]
  },
  fix_orphaned_file_metadata: {
    id: 'fix_orphaned_file_metadata',
    family: 'Repair',
    description: 'Identify metadata entries for files that no longer exist on disk and prune them',
    tools: [{ name: 'search:sql' }, { name: 'shell:run' }]
  },
  repair_corrupted_json_blobs: {
    id: 'repair_corrupted_json_blobs',
    family: 'Repair',
    description: 'Use LLM to reconstruct malformed JSON objects retrieved from legacy stores',
    tools: [{ name: 'llm:generate' }]
  },
  validate_and_fix_graph_types: {
    id: 'validate_and_fix_graph_types',
    family: 'Repair',
    description: 'Ensure all graph relationships use the canonical semantic types and fix violations',
    tools: [{ name: 'search:graph' }, { name: 'llm:generate' }]
  },
  reset_hung_background_tasks: {
    id: 'reset_hung_background_tasks',
    family: 'Repair',
    description: 'Identify background jobs that have stalled and safely restart or terminate them',
    tools: [{ name: 'search:sql' }, { name: 'shell:run' }]
  },
  refresh_stale_mcp_configs: {
    id: 'refresh_stale_mcp_configs',
    family: 'Repair',
    description: 'Detect changes in local environment that require an MCP configuration reload',
    tools: [{ name: 'shell:run' }]
  },
  sync_missing_minio_objects: {
    id: 'sync_missing_minio_objects',
    family: 'Repair',
    description: 'Find database records with missing S3/SeaweedFS objects and trigger a re-upload',
    tools: [{ name: 'search:sql' }, { name: 'shell:run' }]
  }
};
