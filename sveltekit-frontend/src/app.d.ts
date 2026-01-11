/// <reference types="@sveltejs/kit" />
/// <reference types="vite/client" />

// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare namespace App {
  // interface Locals {}
  // interface PageData {}
  interface Error {
    message: string;
    code?: string;
    details?: string;
  }
  // interface Platform {}
}
import type { Session } from 'lucia';

declare global {
  namespace App {
    // Define your User type based on what your authentication system provides
    interface User {
      id: string; email: string;
      username?: string;
      role?: string;
      // Add any other user properties you expect: e.g., name, roles
    }

    interface Locals {
      user: User | null;
      session: Session | null;
      requestId?: string;
    }
    // interface PageData {}
    // interface Error {}
    // interface Platform {}
  }

  interface ImportMetaEnv {
    readonly NODE_ENV: string;
    readonly SENTRY_DSN?: string;
    readonly CUSTOM_LOGGING_ENDPOINT?: string;
    readonly LOGGING_API_KEY?: string;
    readonly ADMIN_API_KEY?: string;
    readonly DEV_ADMIN_API_KEY?: string; // For development log clearing
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

export {};



