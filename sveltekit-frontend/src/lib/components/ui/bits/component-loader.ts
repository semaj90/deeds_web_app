/**
 * Component Loader
 * Minimal generic loader for dynamic component imports
 */
import type { ComponentType, SvelteComponent } from 'svelte';

export type ComponentLoader<T = any> = () => Promise<{ default:ComponentType<SvelteComponent<T>> }>;

export async function loadComponent<T = any>(loader: ComponentLoader<T>): Promise<ComponentType<SvelteComponent<T>>> {
    const module = await loader();
    return module.default;
}
