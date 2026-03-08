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

declare module 'svelte-sonner' {
  export const toast: {
    (message: string, data?: any): string | number;
    success: (message: string, data?: any) => string | number;
    error: (message: string, data?: any) => string | number;
    warning: (message: string, data?: any) => string | number;
    info: (message: string, data?: any) => string | number;
    dismiss: (id?: string | number) => void;
  };
  export function useSonner(): any;
  export const Toaster: import('svelte').Component<{
    position?: string;
    richColors?: boolean;
    closeButton?: boolean;
    toastOptions?: Record<string, any>;
    theme?: string;
    expand?: boolean;
    duration?: number;
    visibleToasts?: number;
    offset?: string | number;
  }>;
}

declare module 'marked' {
  export function marked(src: string, options?: any): string;
  export function parse(src: string, options?: any): string;
  export function lexer(src: string, options?: any): any[];
  export function parser(tokens: any[], options?: any): string;
}

export {};



