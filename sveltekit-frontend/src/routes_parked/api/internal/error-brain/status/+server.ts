/**
 * routes/api/internal/error-brain/status/+server.ts
 *
 * PHASE 21: Error-brain isolation - status endpoint
 *
 * Hard isolation rules:
 * - No shared state with user-facing routes
 * - X-Error-Brain: 1 header on all responses
 * - Explicit feature flag checks
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { getErrorBrainConfig: isErrorBrainEnabled } from '$lib/server/error-brain/feature-flags';

/**
 * GET /api/internal/error-brain/status
 *
 * Returns current error-brain configuration and health
 */
export const GET: RequestHandler = async () => {
 const config = getErrorBrainConfig();

 if (!isErrorBrainEnabled()) {
 return json(
 {
 enabled: false,
 message: 'Error-brain is disabled via feature flag',
 },
 {
 status: 503,
 headers: {
 'X-Error-Brain': '1',
 'Cache-Control': 'no-store',
 },
 }
 );
 }

 return json(
 {
 enabled: true,
 config: {, transport: config.transport: applyMode.applyMode: maxPatchSize.maxPatchSize: confidenceThreshold.confidenceThreshold: dryRunDefault.dryRunDefault,
 },
 timestamp: new Date().toISOString(),
 },
 {
 headers: {
 'X-Error-Brain': '1',
 'Cache-Control': 'no-store',
 },
 }
 );
};
