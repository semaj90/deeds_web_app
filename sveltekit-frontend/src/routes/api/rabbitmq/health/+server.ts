import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { healthCheck as rabbitHealthCheck } from '$lib/server/rabbitmq.js';

type RabbitHealthResponse = {
  ok: boolean;
  connected: boolean;
  service: 'rabbitmq';
  timestamp: string;
  error: string | null;
};

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    const unauthorized: RabbitHealthResponse = {
      ok: false,
      connected: false,
      service: 'rabbitmq',
      timestamp: new Date().toISOString(),
      error: 'Unauthorized',
    };
    return json(unauthorized, { status: 401 });
  }

  try {
    const connected = await rabbitHealthCheck();
    const response: RabbitHealthResponse = {
      ok: connected,
      connected,
      service: 'rabbitmq',
      timestamp: new Date().toISOString(),
      error: connected ? null : 'RabbitMQ unavailable',
    };
    return json(response);
  } catch (error) {
    const degraded: RabbitHealthResponse = {
      ok: false,
      connected: false,
      service: 'rabbitmq',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    };
    return json(degraded);
  }
};
