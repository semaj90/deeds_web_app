<script lang="ts">
 import { Badge } from '$lib/components/ui/badge';
 let { threatLevel, size = 'md', showIcon = true }: {
  threatLevel: string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
 } = $props();

 function getThreatConfig(level: string) {
 switch (level) {
 case 'critical':
 return {
 color: 'bg-danger text-white border-danger',
 icon: 'alert-triangle',
 label: 'CRITICAL'
 };
 case 'high':
 return {
 color: 'bg-warning text-white border-warning/60',
 icon: 'alert-circle',
 label: 'HIGH'
 };
 case 'medium':
 return {
 color: 'bg-warning text-black border-warning/60',
 icon: 'shield',
 label: 'MEDIUM'
 };
 case 'low':
 return {
 color: 'bg-accent text-white border-accent',
 icon: 'check-circle',
 label: 'LOW'
 };
 default:return {
 color: 'bg-sand/20 text-white border-sand/30',
 icon: 'shield',
 label: 'UNKNOWN'
 };
 }
 }
let config = $derived(getThreatConfig(threatLevel));

 function getSizeClasses(size: string) {
 switch (size) {
 case 'sm': return 'text-xs px-2 py-1';
 case 'lg': return 'text-sm px-4 py-2';
 default:return 'text-xs px-3 py-1';
 }
 }
</script>

<Badge class="{config.color} border font-semibold {getSizeClasses(size)}">
 {#if showIcon}
 <span class="i-lucide-{config.icon} w-3 h-3 mr-1 inline-block"></span>
 {/if}
 {config.label}
</Badge>

