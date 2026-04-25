// --- Ambient shims for $lib aliases and 3rd party modules ---
declare module '$lib/config/env.server';
declare module '$lib/server/db/drizzle';
declare module '$lib/server/db/schema';
declare module '$lib/server/db/utils';
declare module '$lib/server/ai/embedder';
declare module '$lib/server/rabbitmq';
declare module '$lib/server/stream';
declare module '@qdrant/js-client-rest';
declare module '@aws-sdk/client-s3';
declare module 'ioredis';

// Optional: Lucia + App locals
declare namespace App {
  interface Locals {
    user?: { id: string; email?: string; name?: string } | null;
  }
}
