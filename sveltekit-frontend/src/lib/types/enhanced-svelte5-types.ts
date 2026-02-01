import { browser } from '$app/environment';

export type DrizzleTypes = {
  // Add placeholder types or re-export from your schema if available
  [key: string]: unknown;
};

export interface CachingTypes {
  ttl: number;
  strategy: 'memory' | 'redis' | 'hybrid';
}

export const detectEnvironment = () => {
  if (browser) return 'browser';
  return 'server';
};

export type BitsUI = any;
