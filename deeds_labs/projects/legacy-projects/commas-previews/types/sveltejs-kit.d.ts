declare module '@sveltejs/kit' {
  // Minimal preview-only stub to satisfy imports in preview stubs.
  // Expose a single uniquely-named export to avoid colliding with real type definitions.
  export const __preview_sveltekit_stub__: any;
  export function json(data: any, init?: any): any;
  export function error(status: number, message?: string): any;
  export function redirect(status: number, location: string): never;
}
