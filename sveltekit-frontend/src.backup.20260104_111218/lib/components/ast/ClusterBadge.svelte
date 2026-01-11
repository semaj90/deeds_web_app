<script lang="ts">
 /**
 * Phase 74: Cluster Badge Component
 * Displays semantic cluster information for suggestions
 */
 import type { ClusterInfo } from '$lib/ast/suggestion-engine';

 interface Props {
 cluster: ClusterInfo;
 size?: 'sm' | 'md' | 'lg';
 showLabel?: boolean;
 onclick?: () => void;
 }

 let { cluster, size = 'md', showLabel = true, onclick }: Props = $props();

 const sizeClasses = {
 sm: 'px-1.5 py-0.5 text-xs',
 md: 'px-2 py-1 text-sm',
 lg: 'px-3 py-1.5 text-base',
 };

 const colorMap: Record<string, string> = {
 'bg-red-500': 'bg-red-500 hover:bg-red-600',
 'bg-blue-500': 'bg-blue-500 hover:bg-blue-600',
 'bg-purple-500': 'bg-purple-500 hover:bg-purple-600',
 'bg-orange-500': 'bg-orange-500 hover:bg-orange-600',
 'bg-orange-600': 'bg-orange-600 hover:bg-orange-700',
 'bg-green-500': 'bg-green-500 hover:bg-green-600',
 'bg-yellow-500': 'bg-yellow-500 hover:bg-yellow-600',
 };
</script>

<button
 type="button"
 class="inline-flex items-center gap-1 rounded-full font-medium text-white transition-colors {sizeClasses[size]} {colorMap[cluster.color] ?? 'bg-gray-500 hover:bg-gray-600'}"
 title="Cluster: {cluster.label}"
 onclick={onclick}
>
 <span class={cluster.icon}></span>
 {#if showLabel}
 <span>{cluster.label}</span>
 {/if}
</button>
