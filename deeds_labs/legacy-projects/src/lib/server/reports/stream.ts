import { CONFIG } from '$lib/config/env.server';

// Optional Redis Pub/Sub for multi-instance deployments
let redisSubscriber: any = null;

// Local fallback event emitter
const listeners = new Set<(data: string) => void>();

// Initialize Redis subscriber (if available)
export async function initRedis(): Promise<any> {
  if (redisSubscriber) return redisSubscriber;
  try {
    const IORedis = (await import('ioredis')).default;
    redisSubscriber = new IORedis(CONFIG.REDIS_URL);
    redisSubscriber.subscribe('reports:updates');
    redisSubscriber.on('message', (_channel: string, message: string) => {
      listeners.forEach((send) => send(message));
    });
    console.log('✅ Redis Pub/Sub active for live report updates');
  } catch (err) {
    console.warn('⚠️ Redis not available, falling back to in-memory broadcast');
  }
  return redisSubscriber;
}

export function broadcastUpdate(event: any) {
  const data = typeof event === 'string' ? event : JSON.stringify(event);
  listeners.forEach((send) => send(data));
  if (redisSubscriber?.publish) redisSubscriber.publish('reports:updates', data);
}

export function getSSEStream(): ReadableStream<string> {
  return new ReadableStream<string>({
    start(controller) {
      const send = (data: string) => controller.enqueue(`data: ${data}\n\n`);
      listeners.add(send);

      const heartbeat = setInterval(() => controller.enqueue(':\n\n'), 30000);
      controller.enqueue(`event: connected\ndata: {"status":"ok"}\n\n`);

      return () => {
        clearInterval(heartbeat);
        listeners.delete(send);
      };
    },
  });
}
