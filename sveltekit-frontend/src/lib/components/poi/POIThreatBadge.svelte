<script lang="ts">
 import { Badge } from '$lib/components/ui/badge';
 import AlertCircle from 'lucide-svelte/icons/alert-circle';
 import AlertTriangle from 'lucide-svelte/icons/alert-triangle';
 import CheckCircle from 'lucide-svelte/icons/check-circle';
 import Shield from 'lucide-svelte/icons/shield';

 let { threatLevel, size = 'md', showIcon = true } = $props<{
  threatLevel: string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
 }>();

 function getThreatConfig(level: string) {
 switch (level) {
 case 'critical':
 return {
 color: 'bg-red-500 text-white border-red-600',
 icon: AlertTriangle,
 label: 'CRITICAL'
 };
 case 'high':
 return {
 color: 'bg-orange-500 text-white border-orange-600',
 icon: AlertCircle,
 label: 'HIGH'
 };
 case 'medium':
 return {
 color: 'bg-yellow-500 text-black border-yellow-600',
 icon: Shield,
 label: 'MEDIUM'
 };
 case 'low':
 return {
 color: 'bg-green-500 text-white border-green-600',
 icon: CheckCircle,
 label: 'LOW'
 };
 default:
 return {
 color: 'bg-gray-500 text-white border-gray-600',
 icon: Shield,
 label: 'UNKNOWN'
 };
 }
 }
let config = $derived(getThreatConfig(threatLevel));

 function getSizeClasses(size: string) {
 switch (size) {
 case 'sm': return 'text-xs px-2 py-1';
 case 'lg': return 'text-sm px-4 py-2';
 default: return 'text-xs px-3 py-1';
 }
 }
</script>

<Badge class="{config.color} border font-semibold {getSizeClasses(size)}">
 {#if showIcon}
 <config.icon class="w-3 h-3 mr-1" />
 {/if}
 {config.label}
</Badge>


