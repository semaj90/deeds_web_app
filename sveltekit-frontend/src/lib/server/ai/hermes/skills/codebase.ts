import type { SkillRecipe } from './registry.js';

export const CODEBASE_SKILLS: Record<string, SkillRecipe> = {
  search_codebase: {
    id: 'search_codebase',
    family: 'Codebase',
    description: 'Search knowledge base using vector similarity',
    tools: [{ name: 'search:vector' }]
  },
  explain_file: {
    id: 'explain_file',
    family: 'Codebase',
    description: 'Explain the logic and purpose of a source file',
    tools: [{ name: 'fs:read' }, { name: 'llm:generate' }]
  },
  trace_imports: {
    id: 'trace_imports',
    family: 'Codebase',
    description: 'Trace module dependency graph and import paths',
    tools: [{ name: 'search:graph' }]
  },
  find_path_aliases: {
    id: 'find_path_aliases',
    family: 'Codebase',
    description: 'Resolve tsconfig path aliases and directory mappings',
    tools: [{ name: 'fs:read' }]
  },
  detect_server_client_leaks: {
    id: 'detect_server_client_leaks',
    family: 'Codebase',
    description: 'Scan for server-side logic leaking into client components',
    tools: [{ name: 'shell:run' }, { name: 'llm:generate' }]
  },
  summarize_directory: {
    id: 'summarize_directory',
    family: 'Codebase',
    description: 'Generate high-level overview of a directory architecture',
    tools: [
      { name: 'shell:run', args: (input) => ({ command: `rg --files src/${input.directory || ''} | head -n 50` }) },
      { name: 'llm:generate' }
    ]
  },
  inspect_routes: {
    id: 'inspect_routes',
    family: 'Codebase',
    description: 'Map SvelteKit routes and their API endpoints',
    tools: [
      { name: 'shell:run', args: () => ({ command: 'rg --files src/routes' }) }
    ]
  },
  find_env_usage: {
    id: 'find_env_usage',
    family: 'Codebase',
    description: 'Identify where environment variables are consumed',
    tools: [{ name: 'shell:run' }]
  },
  find_duplicate_logic: {
    id: 'find_duplicate_logic',
    family: 'Codebase',
    description: 'Identify semantically similar code blocks that may indicate duplication',
    tools: [
      { name: 'search:vector', args: (input) => ({ query: input.context, limit: 10 }) },
      { name: 'llm:generate', args: (input) => ({ prompt: `Identify potential duplication in: ${JSON.stringify(input.results)}` }) }
    ]
  },
  audit_drizzle_schema: {
    id: 'audit_drizzle_schema',
    family: 'Codebase',
    description: 'Verify consistency between Drizzle schema files and database state',
    tools: [
      { name: 'shell:run', args: () => ({ command: 'npx drizzle-kit check' }) },
      { name: 'search:sql', args: () => ({ query: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'" }) }
    ]
  },
  detect_circular_imports: {
    id: 'detect_circular_imports',
    family: 'Codebase',
    description: 'Scan the dependency graph for circular import cycles',
    tools: [
      { name: 'shell:run', args: () => ({ command: 'npx madge --circular sveltekit-frontend/src' }) }
    ]
  },
  scan_todo_comments: {
    id: 'scan_todo_comments',
    family: 'Codebase',
    description: 'Aggregate all TODO, FIXME, and HACK comments across the codebase',
    tools: [
      { name: 'shell:run', args: () => ({ command: 'rg -i "TODO|FIXME|HACK" src' }) }
    ]
  },
  generate_fix_plan: {
    id: 'generate_fix_plan',
    family: 'Codebase',
    description: 'Produce a ranked action plan for fixing errors and tech debt',
    tools: [
      { name: 'search:vector', args: (input) => ({ query: input.query ?? 'error fix plan', limit: 8 }) },
      { name: 'llm:generate' }
    ]
  }
};
