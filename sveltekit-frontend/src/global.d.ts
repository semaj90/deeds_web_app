// Canonical global declarations for the frontend. This file is intentionally
// simple and includes only the ambient module declarations needed during
// incremental migration. Keep this file included by tsconfig so tsc finds it.
declare module '$env/dynamic/private' {
  const env: Record<string, string | undefined>;
  export { env };
}

// Provide a module for the evidence upload schema used across the frontend.
// This avoids import errors while the schema is being migrated or re-exported.
declare module '$lib/schemas/evidence-upload' {
  import { z } from 'zod';

  export type VideoMetadata = {
    width?: number;
    height?: number;
    duration?: number;
    codec?: string;
    sizeBytes?: number;
  };

  export const evidenceUploadSchema: z.ZodObject<any>;
  export type EvidenceUploadData = z.infer<typeof evidenceUploadSchema>;
}

// Also support direct source path imports
declare module 'src/lib/schemas/evidence-upload' {
  export * from '$lib/schemas/evidence-upload';
}

// Minimal amqplib fallback typing for dynamic import sites
declare module 'amqplib' {
  const content: unknown | any;
  export = content;
}

// Temporary module shims to satisfy tsc during incremental triage.
// These are lightweight declarations mapping internal path aliases used by the app.
declare module '$lib/server/redis';
declare module '$lib/server/redis-service';
declare module '$lib/server/redis-orchestrator';
declare module '$lib/services/xstate-integration';
declare module '$lib/services/mcp-registry';
declare module '$lib/types/integrations';
declare module '$lib/server/graph-service';
declare module '$lib/wasm/autoencoder-wasm';
declare module '$lib/server/queue/rabbitmq-workers';
declare module '$lib/services/redis-orchestrator';
declare module '$lib/server/redis';

// Generic wildcard to reduce noise for other $lib imports (keep minimal - remove later)
declare module '$lib/*';

export {};

// Ambient declarations to help TypeScript treat Svelte components as constructors
// This is a conservative fallback to reduce widespread: "instance vs constructor" type
// errors during migration to Svelte 5. It's meant as a temporary compatibility shim.
declare module '*.svelte' {
  // Permissive fallback: treat any imported .svelte as 'any' to avoid
  // constructor-vs-instance type errors while migrating to Svelte 5.
  const component: any;
  export default component;
}

// Allow imports of common asset modules
declare module '*.svg';
declare module '*.css';

// Svelte 5 + SvelteKit global type declarations
/// <reference types="svelte" />
/// <reference types="vite/client" />

declare global {
  // WebGPU support (avoid conflict with @webgpu/types)
  interface Navigator {
    gpu?: GPU;
  }

  // Global WebGPU types (simplified)
  interface GPU {
    requestAdapter(): Promise<any>;
  }

  // Telemetry and GPU Manager global properties
  interface Window {
    __TELEMETRY__?: unknown;
    __GPU_MANAGER__?: {
      getAcceleration(): unknown;
    };
  }
}

// Stub out problematic drizzle-orm gel module types
declare module 'gel' {
  export interface Duration {
    [key: string]: any;
  }

  export interface LocalDate {
    [key: string]: any;
  }

  export interface LocalTime {
    [key: string]: any;
  }

  export interface Timestamp {
    [key: string]: any;
  }

  export interface DateDuration {
    [key: string]: any;
  }

  export interface RelativeDuration {
    [key: string]: any;
  }
}

export {};


