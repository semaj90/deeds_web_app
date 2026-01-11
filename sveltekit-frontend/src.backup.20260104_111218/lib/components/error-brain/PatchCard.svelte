<script lang="ts">
 import { Badge } from '$lib/components/ui/badge';
 import { Button } from '$lib/components/ui/button';
 import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';

 interface Props {
 id: number;
 filePath: string;
 diffText: string;
 reason: string;
 confidence: number;
 applied: boolean;
 appliedAt?: Date | null;
 createdAt: Date;
 onApply?: (id: number) => void;
 onRollback?: (id: number) => void;
 }

 let {
 id,
 filePath,
 diffText,
 reason,
 confidence,
 applied,
 appliedAt = null,
 createdAt,
 onApply,
 onRollback
 }: Props = $props();

 // Parse confidence to percentage
 const confidencePercent = $derived(Math.round(confidence * 100));

 // Confidence badge color
 const confidenceColor = $derived(confidence >= 0.9 ? 'success' : confidence >= 0.7 ? 'warning' : 'destructive');
</script>

<Card class="mb-4 {applied ? 'border-green-500 dark:border-green-700' : ''}">
 <CardHeader>
 <div class="flex items-start justify-between">
 <div class="flex-1">
 <CardTitle class="text-lg font-mono">{filePath}</CardTitle>
 <p class="text-sm text-muted-foreground mt-1">{reason}</p>
 </div>
 <div class="flex items-center gap-2">
 <Badge variant={confidenceColor}>
 {confidencePercent}% confidence
 </Badge>
 {#if applied}
 <Badge variant="default" class="bg-green-600 dark:bg-green-700">
 Applied
 </Badge>
 {/if}
 </div>
 </div>
 </CardHeader>

 <CardContent>
 <!-- Diff Display -->
 <div class="bg-slate-950 dark:bg-slate-900 rounded-md p-4 overflow-x-auto">
 <pre class="text-xs font-mono text-slate-200"><code>{diffText}</code></pre>
 </div>

 <!-- Metadata -->
 <div class="mt-4 flex items-center justify-between text-xs text-muted-foreground">
 <div>
 Created: {new Date(createdAt).toLocaleString()}
 {#if appliedAt}
 <span class="ml-4">Applied: {new Date(appliedAt).toLocaleString()}</span>
 {/if}
 </div>
 <div class="flex gap-2">
 {#if !applied && onApply}
 <Button size="sm" onclick={() => onApply.id}>
 Apply Patch
 </Button>
 {/if}
 {#if applied && onRollback}
 <Button size="sm" variant="destructive" onclick={() => onRollback.id}>
 Rollback
 </Button>
 {/if}
 </div>
 </div>
 </CardContent>
</Card>
