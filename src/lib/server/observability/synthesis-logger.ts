import { db } from '$lib/server/db/client';
import { synthesisLogs } from './schema/synthesis-logs.js';

export async function logSynthesisRun(runId: string, payload: any, enrichments: { pathMapping?: any[], dynamicImports?: any[], runtimeDependencies?: any[], routeFlow?: any[] }): Promise<void> {
  await db.insert(synthesisLogs).values({
    runId: runId,
    payload: payload,
    pathMapping: enrichments?.pathMapping || [],
    dynamicImports: enrichments?.dynamicImports || [],
    runtimeDependencies: enrichments?.runtimeDependencies || [],
    routeFlow: enrichments?.routeFlow || [],
    sourceRefs: payload.sourceRefs || [],
  });
}