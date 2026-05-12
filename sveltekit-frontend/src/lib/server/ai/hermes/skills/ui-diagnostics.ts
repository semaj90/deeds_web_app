/**
 * Hermes UI / Diagnostics Skills
 * 
 * Recipes for frontend testing and observability.
 */

import type { SkillRecipe } from './registry.js';

export const UI_DIAGNOSTICS_SKILLS: Record<string, SkillRecipe> = {
  'route_smoke_test': {
    id: 'route_smoke_test',
    family: 'UI / Diagnostics',
    description: 'Run Vitest smoke tests on SvelteKit routes',
    tools: [
      {
        name: 'shell:run',
        args: () => ({
          command: 'npm run test:stubs:progress'
        })
      }
    ]
  },
  'stack_health_report': {
    id: 'stack_health_report',
    family: 'UI / Diagnostics',
    description: 'Generate a comprehensive health report for the entire infrastructure stack',
    tools: [
      {
        name: 'diagnostics:health'
      },
      {
        name: 'diagnostics:pipeline_gaps'
      },
      {
        name: 'llm:generate',
        args: (prev) => ({
          prompt: `Summarize the following health metrics into a status report: ${JSON.stringify(prev)}`
        })
      }
    ]
  },
  'screenshot_report': {
    id: 'screenshot_report',
    family: 'UI / Diagnostics',
    description: 'Capture screenshots of key dashboard routes',
    tools: [
      {
        name: 'shell:run',
        args: () => ({
          command: 'npm run screenshot:all'
        })
      }
    ]
  },
  'client_side_error_log_audit': {
    id: 'client_side_error_log_audit',
    family: 'UI / Diagnostics',
    description: 'Analyze browser error logs captured from active user sessions',
    tools: [{ name: 'search:sql', args: { query: 'SELECT * FROM client_logs WHERE level = "error" LIMIT 20' } }, { name: 'llm:generate' }]
  },
  'svelte_runes_migration_audit': {
    id: 'svelte_runes_migration_audit',
    family: 'UI / Diagnostics',
    description: 'Scan the codebase for legacy Svelte 4 syntax that requires migration to Runes',
    tools: [{ name: 'shell:run', args: { command: 'npm run audit:runes' } }]
  },
  'bundle_size_analysis': {
    id: 'bundle_size_analysis',
    family: 'UI / Diagnostics',
    description: 'Analyze the production bundle size and identify bloated dependencies',
    tools: [{ name: 'shell:run', args: { command: 'npm run build:analyze' } }]
  },
  'network_latency_probe': {
    id: 'network_latency_probe',
    family: 'UI / Diagnostics',
    description: 'Measure end-to-end latency between the frontend and all microservices',
    tools: [{ name: 'diagnostics:health' }]
  },
  'accessibility_audit': {
    id: 'accessibility_audit',
    family: 'UI / Diagnostics',
    description: 'Run an automated accessibility audit on a specific SvelteKit route',
    tools: [{ name: 'shell:run' }]
  },
  'ui_component_regression_test': {
    id: 'ui_component_regression_test',
    family: 'UI / Diagnostics',
    description: 'Execute targeted regression tests for a specific UI component',
    tools: [{ name: 'shell:run' }]
  },
  'trace_request_timeline': {
    id: 'trace_request_timeline',
    family: 'UI / Diagnostics',
    description: 'Trace the full lifecycle of a request through the entire 5-tier stack',
    tools: [{ name: 'search:sql' }, { name: 'llm:generate' }]
  },
  'database_migration_status': {
    id: 'database_migration_status',
    family: 'UI / Diagnostics',
    description: 'Verify if the database schema is aligned with current migrations',
    tools: [{ name: 'shell:run', args: { command: 'npm run db:status' } }]
  },
  'automated_lighthouse_scan': {
    id: 'automated_lighthouse_scan',
    family: 'UI / Diagnostics',
    description: 'Trigger a Lighthouse performance scan on a local route',
    tools: [{ name: 'shell:run' }]
  }
};
