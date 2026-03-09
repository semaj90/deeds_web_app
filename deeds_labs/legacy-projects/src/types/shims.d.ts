/* Minimal module/type shims to silence language-server / TypeScript errors for project-local aliases
   and third-party packages referenced in components. Keep these as "any" shims until proper types
   or packages are added. */

declare module '$app/stores' {
  import type { Readable } from 'svelte/store';
  export const page: Readable<any>;
  export const navigating: Readable<any>;
  export const updated: Readable<any>;
}

declare module 'lucide-svelte' {
  // export the icons used in CaseDashboard.svelte as any so imports succeed in the editor
  export const Activity: any;
  export const BarChart3: any;
  export const Clock: any;
  export const AlertTriangle: any;
  export const CheckCircle: any;
  export const RefreshCw: any;
  export const Plus: any;
  export const FolderOpen: any;
  export const ListTodo: any;
  export const Brain: any;
  const _default: any;
  export default _default;
}

declare module '$lib/components/ui/bits-ui' {
  export const ButtonBits: any;
  export const CardBits: any;
  export const BadgeBits: any;
  export const AlertBits: any;
  export const ProgressBits: any;
  export const SeparatorBits: any;
  export const SkeletonBits: any;
  export default any;
}

declare module '$lib/server/services/case-management' {
  // Keep the type loose until real definitions are added
  export type CaseDashboardStats = any;
  export default any;
}
