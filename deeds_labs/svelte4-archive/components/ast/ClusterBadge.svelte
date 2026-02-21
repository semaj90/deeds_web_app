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
 'bg-danger': 'bg-danger hover:bg-danger',
 'bg-info': 'bg-info hover:bg-info/60',
 'bg-warning': 'bg-warning hover:bg-warning/80',
 'bg-accent': 'bg-accent hover:bg-accent',
 };
</script>

<button
 type="button"
 class="inline-flex items-center gap-1 rounded-full font-medium text-white transition-colors {sizeClasses[size]} {colorMap[cluster.color] ?? 'bg-sand/20 hover:bg-sand/20'}"
 title="Cluster, {cluster.label}"
 onclick={ onclick }
>
 <span class={cluster.icon}></span>
 {#if showLabel}
 <span>{cluster.label}</span>
 {/if}
</button>


