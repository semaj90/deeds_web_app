/**
 * Redis Connection and Pub/Sub Utilities
 *
 * Provides:
 * - Redis instance creation
 * - Pub/Sub for Server-Sent Events (SSE)
 * - Caching utilities
 * - Session management
 */

import IORedis, { type RedisOptions } from 'ioredis';
import { logger } from '../utils/logger.js';

/**
 * Create a new Redis instance
 */
export function createRedisInstance(config?: RedisOptions): IORedis {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  const defaultConfig: RedisOptions = {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
    retryStrategy(times: number) {
      const delay = Math.min(times * 50, 2000);
      logger.warn('Redis retry attempt', { attempt: times, delay });
      return delay;
    },
  };

  const redis = new IORedis(redisUrl, {
    ...defaultConfig,
    ...config,
  });

  redis.on('connect', () => {
    logger.info('Redis connecting...');
  });

  redis.on('ready', () => {
    logger.info('Redis ready');
  });

  redis.on('error', (error) => {
    logger.error('Redis error', { error });
  });

  redis.on('close', () => {
    logger.warn('Redis connection closed');
  });

  redis.on('reconnecting', () => {
    logger.info('Redis reconnecting...');
  });

  return redis;
}

/**
 * Create a Redis Pub/Sub subscriber
 */
export function createSubscriber(): IORedis {
  const subscriber = createRedisInstance();

  subscriber.on('message', (channel, message) => {
    logger.debug('Redis message received', { channel, messageLength: message.length });
  });

  subscriber.on('subscribe', (channel, count) => {
    logger.info('Redis subscribed to channel', { channel, subscriptionCount: count });
  });

  return subscriber;
}

/**
 * Create a Redis Pub/Sub publisher
 */
export function createPublisher(): IORedis {
  return createRedisInstance();
}

/**
 * Publish a message to a Redis channel
 */
export async function publishMessage(
  redis: IORedis,
  channel: string,
  message: any
): Promise<number> {
  try {
    const payload = typeof message === 'string' ? message : JSON.stringify(message);
    const subscribersCount = await redis.publish(channel, payload);

    logger.debug('Message published to Redis channel', {
      channel,
      subscribersCount,
      messageLength: payload.length
    });

    return subscribersCount;
  } catch (error) {
    logger.error('Failed to publish Redis message', { channel, error });
    throw error;
  }
}

/**
 * Subscribe to a Redis channel with callback
 */
export async function subscribeToChannel(
  redis: IORedis,
  channel: string,
  callback: (message: string) => void | Promise<void>
): Promise<void> {
  try {
    await redis.subscribe(channel);

    redis.on('message', async (ch, message) => {
      if (ch === channel) {
        try {
          await callback(message);
        } catch (error) {
          logger.error('Error in subscription callback', { channel, error });
        }
      }
    });

    logger.info('Subscribed to Redis channel', { channel });
  } catch (error) {
    logger.error('Failed to subscribe to Redis channel', { channel, error });
    throw error;
  }
}

/**
 * Caching utilities
 */
export class RedisCache {
  constructor(private redis: IORedis, private prefix: string = 'cache') {}

  /**
   * Set a cache value with optional TTL
   */
   async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
     const fullKey = `${this.prefix}:${key}`;
     const serialized = JSON.stringify(value);

     if (ttlSeconds) {
       await this.redis.setex(fullKey, ttlSeconds, serialized);
     } else {
       await this.redis.set(fullKey, serialized);
     }

     logger.debug('Cache set', { key: fullKey, ttl: ttlSeconds });
   }

   /**
    * Get a cache value
    */
   async get<T = any>(key: string): Promise<T | null> {
     const fullKey = `${this.prefix}:${key}`;
     const value = await this.redis.get(fullKey);

     if (!value) {
       logger.debug('Cache miss', { key: fullKey });
       return null;
     }

     logger.debug('Cache hit', { key: fullKey });
     return JSON.parse(value) as T;
   }

   /**
    * Delete a cache value
    */
   async del(key: string): Promise<void> {
     const fullKey = `${this.prefix}:${key}`;
     await this.redis.del(fullKey);
     logger.debug('Cache deleted', { key: fullKey });
   }

   /**
    * Check if a key exists
    */
   async exists(key: string): Promise<boolean> {
     const fullKey = `${this.prefix}:${key}`;
     const result = await this.redis.exists(fullKey);
     return result === 1;
   }

   /**
    * Get or set with callback
    */
   async getOrSet<T = any>(
     key: string,
     factory: () => Promise<T>,
     ttlSeconds?: number
   ): Promise<T> {
     const cached = await this.get<T>(key);

     if (cached !== null) {
       return cached;
     }

     const value = await factory();
     await this.set(key, value, ttlSeconds);
     return value;
   }
 }

 /**
  * Session management utilities for workflow state
  */
 export class WorkflowSessionManager {
   private cache: RedisCache;

   constructor(private redis: IORedis) {
     this.cache = new RedisCache(redis, 'workflow:session');
   }

   /**
    * Store workflow session state
    */
   async setSessionState(sessionId: string, state: any, ttlSeconds = 3600): Promise<void> {
     await this.cache.set(sessionId, state, ttlSeconds);
     logger.info('Workflow session state stored', { sessionId });
   }

   /**
    * Get workflow session state
    */
   async getSessionState<T = any>(sessionId: string): Promise<T | null> {
     return await this.cache.get<T>(sessionId);
   }

   /**
    * Delete workflow session
    */
   async deleteSession(sessionId: string): Promise<void> {
     await this.cache.del(sessionId);
     logger.info('Workflow session deleted', { sessionId });
   }

   /**
    * Publish workflow event for SSE
    */
   async publishWorkflowEvent(sessionId: string, event: any): Promise<void> {
     const channel = `workflow:session:${sessionId}`;
     await publishMessage(this.redis, channel, event);
     logger.debug('Workflow event published', { sessionId, eventType: event?.type });
   }
 }
