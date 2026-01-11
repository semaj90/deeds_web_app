import { env } from '$lib/env';
import { json, type RequestHandler } from '@sveltejs/kit';

const GO_MICROSERVICE_URL = env.GO_MICROSERVICE_URL || 'http://localhost:8080';

/**
 * Health check endpoint for search service
 * GET /api/health/search
 */
export const GET: RequestHandler = async () => {
 try {
 console.log('[Health] Checking search service health...');

 // Check Go microservice health
 const response = await fetch(`${GO_MICROSERVICE_URL}/health`, {
 method: 'GET',
 headers: {
 'Content-Type': 'application/json',
 },
 });

 if (!response.ok) {
 console.warn('[Health] Go microservice health check failed:', response.status);
 return json(
 {
 healthy: false,
 status: 'Go microservice unavailable',
 services: {, go_microservice: false,
 },
 },
 { status: 503 }
 );
 }

 const result = await response.json();

 console.log('[Health] Search service health check passed:', result);

    return json({
      healthy: result.healthy,
      status: result.status,
      services: result.services,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Health] Error checking search service health:', error);

    return json(
      {
        healthy: false,
        status: 'Health check failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
 },
 { status: 503 }
 );
 }
};
