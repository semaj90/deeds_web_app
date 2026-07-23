/**
 * Root tRPC router — assembles all sub-routers.
 *
 * Procedures available:
 *   workflow.start / resume / approve / get / cancel
 *   agent.runs.get / cancel / list
 *   analytics.events.list
 *   analytics.recommendation.feedback
 *
 * Export AppRouter type for the client-side caller.
 */

import { router } from './init.js';
import { workflowRouter } from './routers/workflow.js';
import { agentRouter } from './routers/agent.js';
import { analyticsRouter } from './routers/analytics.js';

export const appRouter = router({
  workflow: workflowRouter,
  agent: agentRouter,
  analytics: analyticsRouter,
});

export type AppRouter = typeof appRouter;
