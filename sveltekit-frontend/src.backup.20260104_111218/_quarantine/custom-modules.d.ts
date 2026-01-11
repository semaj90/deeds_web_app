// Minimal module shims while the codebase is being repaired.
// Keep this file VALID TypeScript.

declare module 'lucide-svelte' {
  const mod: any;
  export default mod;
}

declare module 'svelte-sonner' {
  export const toast: any;
  const mod: any;
  export default mod;
}

declare module 'sveltekit-superforms';
declare module 'sveltekit-superforms/*';
declare module 'sveltekit-superforms/client';
declare module 'sveltekit-superforms/adapters';

declare module '$lib/*' {
  const value: any;
  export default value;
}

declare module 'xstate' {
  const mod: any;
  export default mod;
  export function createActor(...args: any[]): any;
  export type ActorRefFrom<T = any> = any;
}
