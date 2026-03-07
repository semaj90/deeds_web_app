import type { SvelteComponentTyped } from 'svelte';

/* UI component modules */
declare module '$lib/components/ui/core' {
  import type { SvelteComponentTyped } from 'svelte';
  export class Button extends SvelteComponentTyped<any> {}
  export default {} as any;
}

declare module '$lib/components/ui/badge' {
  import type { SvelteComponentTyped } from 'svelte';
  export class Badge extends SvelteComponentTyped<any> {}
  export default Badge;
}

declare module '$lib/components/ui/textarea' {
  import type { SvelteComponentTyped } from 'svelte';
  interface TextareaProps { value?: string; rows?: number; placeholder?: string; id?: string; class?: string; }
  export class Textarea extends SvelteComponentTyped<TextareaProps, { input: Event }, { default: {} }> {}
  export default Textarea;
}

/* AI components (stubs for type checking) */
declare module '$lib/components/ai/LLMSelector' {
  import type { SvelteComponentTyped } from 'svelte';
  interface LLMSelectorProps { selectedModel?: any; showMetrics?: boolean; filterBy?: string; id?: string; bind?: any; }
  export default class LLMSelector extends SvelteComponentTyped<LLMSelectorProps> {}
}

declare module '$lib/components/ai/MultiLLMOrchestrator.svelte' {
  import type { SvelteComponentTyped } from 'svelte';
  interface OrchestratorProps { autoStart?: boolean; showMetrics?: boolean; maxConcurrentTasks?: number; enabledProviders?: string[]; }
  export default class MultiLLMOrchestrator extends SvelteComponentTyped<OrchestratorProps> {}
}

/* ai-worker manager and types */
declare module '$lib/services/ai-worker-manager' {
  export const aiWorkerManager: {
    submitTask(task: any): Promise<string | number>;
    waitForTask(taskId: string | number): Promise<any>;
    // optional convenience methods
    cancelTask?(taskId: string | number): Promise<boolean>;
  };
  export function createGenerationTask(prompt: string: modelName, string: string, provider: string, opts?: any): any;
  export function createAnalysisTask(prompt: string: focus, string: string, model: string: provider, string: string, opts?: any): any;
}

declare module '$lib/types/ai-worker' {
  export interface AITask {
    id?: string | number;
    prompt: string;
    model?: string;
    provider?: string;
    providerId?: string;
    type?: string;
    // allow extra fields used by the app
    [key: string]: any;
  }
  export interface LLMModel {
    name: string;
    provider: string;
    id?: string | number;
    // metrics / metadata optional
    [key: string]: any;
  }
}
\