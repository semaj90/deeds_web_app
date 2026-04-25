/**
 * Centralized utility functions for retrieving environment variables,
 * respecting Docker service names and providing localhost fallbacks.
 */

/**
 * Retrieves the Redis URL from environment variables, with a localhost fallback.
 * @returns The Redis connection URL.
 */
export function getRedisUrl(): string {
  // Prefer Docker service hostname first, then localhost for local dev
  return process.env.REDIS_URL || 'redis://:redis@localhost:6379/0';
}

/**
 * Retrieves the PostgreSQL database URL from environment variables, with a localhost fallback.
 * @returns The PostgreSQL connection URL.
 */
export function getDatabaseUrl(): string {
  // Prefer Docker service hostname first, then localhost for local dev
  return process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db';
}

// Add other environment variable getters here as needed, e.g., getQdrantUrl
export const getGoServiceBase = (serviceName?: string) => {
  // allow overriding specific service hostnames via SERVICE_<NAME>_URL
  if (serviceName) {
    const key = `SERVICE_${serviceName.toUpperCase()}_URL`;
    return process.env[key] || process.env.GO_MICROSERVICE_URL || 'http://localhost:8080'; // Added a default localhost fallback for GO_MICROSERVICE_URL
  }
  return process.env.GO_MICROSERVICE_URL || 'http://localhost:8080'; // Added a default localhost fallback
};
