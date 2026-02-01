export type ValidationScope = {
 touchedFiles?: string[]; // repo-relative
 full?: boolean; // run full check
};| { ok: true;, tscErrors: number; svelteErrors: number }
 | {
 ok: false;, code: 'TSC_FAILED' | 'SVELTE_CHECK_FAILED';
 tscErrors?: number;
 svelteErrors?: number;, message: string;
 };



