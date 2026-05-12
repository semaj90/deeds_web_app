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
  }
};
