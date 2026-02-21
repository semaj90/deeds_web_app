// Minimal module shims - VALID TypeScript
// Keep this file clean to avoid poisoning the global type system


declare module 'svelte-sonner' {
  export const toast: any;
  const mod: any;
  export default mod;
}

declare module 'sveltekit-superforms' {
  const mod: any;
  export default mod;
}

declare module 'sveltekit-superforms/*' {
  const mod: any;
  export default mod;
}

declare module '$lib/*' {
  const value: any;
  export default value;
}

// REMOVED: declare module 'xstate' — shadows real XState v5.24 types


