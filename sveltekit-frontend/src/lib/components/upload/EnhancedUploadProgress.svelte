<script lang="ts">
import Button from '$lib/components/ui/button/Button.svelte';
import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
import Progress from '$lib/components/ui/progress/Progress.svelte';
import { enhancedUploadStore, type EnhancedUploadState } from '$lib/stores/unified';
import AlertCircle from 'lucide-svelte/icons/alert-circle';
import Brain from 'lucide-svelte/icons/brain';
import CheckCircle from 'lucide-svelte/icons/check-circle';
import Clock from 'lucide-svelte/icons/clock';
import Database from 'lucide-svelte/icons/database';
import Eye from 'lucide-svelte/icons/eye';
import Loader2 from 'lucide-svelte/icons/loader-2';
import Network from 'lucide-svelte/icons/network';
import Zap from 'lucide-svelte/icons/zap';
// Reactive state from enhanced upload machine
let uploadState = $state<EnhancedUploadState>();

// Subscribe to the enhanced upload store
enhancedUploadStore.subscribe((state) => {
uploadState = state;
});

// Progress stages with icons and descriptions
const progressStages = [
{
id: 'idle',
name: 'Ready to Upload',
icon: Clock,
description: 'Waiting for files to be selected',
color: 'bg-gray-500'
},
{
id: 'requesting_presign',
name: 'Preparing Upload',
icon: Network,
description: 'Generating secure upload URLs with MinIO',
color: 'bg-blue-500'
},
{
id: 'uploading',
name: 'File Upload',
icon: Zap,
description: 'Uploading chunks to secure storage',
color: 'bg-purple-500'
},
{
id: 'rabbitmq_queue',
name: 'Queue Processing',
icon: Network,
description: 'Adding to RabbitMQ processing queue',
color: 'bg-orange-500'
},
{
id: 'ocr_extraction',
name: 'OCR Analysis',
icon: Eye,
description: 'Extracting text from images and PDFs',
color: 'bg-cyan-500'
},
{
id: 'text_extraction',
name: 'Document Parsing',
icon: Database,
description: 'Advanced text extraction and preprocessing',
color: 'bg-green-500'
},
{
id: 'vector_embedding',
name: 'Vectorization',
icon: Brain,
description: 'Generating vector embeddings for AI search',
color: 'bg-indigo-500'
},
{
id: 'completed',
name: 'Upload Complete',
icon: CheckCircle,
description: 'File processed and indexed successfully',
color: 'bg-emerald-500'
},
{
id: 'error',
name: 'Upload Failed',
icon: AlertCircle,
description: 'An error occurred during processing',
color: 'bg-red-500'
}
];

function getActiveStageIndex(status: string) {
const idx = progressStages.findIndex(s => s.id === status);
return idx === -1 ? 0 : idx;
}

function formatJobId(id?: string) {
return id ? id.slice(0, 8) : '';
}
</script>

{#if uploadState}
<Card class="w-full">
<CardHeader>
<div class="flex items-center justify-between">
<CardTitle class="text-lg font-medium">Upload Progress</CardTitle>
{#if uploadState.jobId}
<div class="flex items-center text-xs text-muted-foreground">
Job ID:
<span class="ml-2 font-mono text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
{formatJobId(uploadState.jobId)}
</span>
</div>
{/if}
</div>
</CardHeader>
<CardContent>
<div class="space-y-6">
<!-- Overall Progress -->
<div class="space-y-2">
<div class="flex justify-between text-sm">
<span class="font-medium text-foreground">
{progressStages.find(s => s.id === uploadState?.status)?.name || 'Processing'}
</span>
<span class="text-muted-foreground">{Math.round(uploadState.progress || 0)}%</span>
</div>
<Progress value={uploadState.progress} class="h-2" />
</div>

<!-- Stage Timeline -->
<div class="relative space-y-4 pt-4">
{#each progressStages as stage, i}
{#if i <= getActiveStageIndex(uploadState.status) && stage.id !== 'idle' && stage.id !== 'error'}
<div class="flex items-start gap-4 animate-in fade-in slide-in-from-left-2 duration-300">
<div class={`p-2 rounded-full ${stage.color} bg-opacity-10 text-${stage.color.replace('bg-', '')}`}>
<stage.icon class="w-4 h-4" />
</div>
<div class="flex-1 space-y-1">
<p class="text-sm font-medium leading-none">{stage.name}</p>
<p class="text-xs text-muted-foreground">{stage.description}</p>
</div>
{#if uploadState.status === stage.id && uploadState.status !== 'completed'}
<div class="animate-spin text-muted-foreground">
<Loader2 class="w-4 h-4" />
</div>
{:else if i < getActiveStageIndex(uploadState.status) || uploadState.status === 'completed'}
<div class="text-emerald-500">
<CheckCircle class="w-4 h-4" />
</div>
{/if}
</div>
{/if}
{/each}

<!-- Error State -->
{#if uploadState.status === 'error'}
<div class="flex items-start gap-4 p-4 bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-200 dark:border-red-900">
<AlertCircle class="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
<div class="flex-1">
<h4 class="text-sm font-medium text-red-800 dark:text-red-300">Processing Failed</h4>
<p class="text-sm text-red-600 dark:text-red-400 mt-1">
{uploadState.error || 'Unknown error occurred'}
</p>
<Button variant="outline" size="sm" class="mt-3 border-red-200 hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900/20" onclick={() => enhancedUploadStore.reset()}>
Try Again
</Button>
</div>
</div>
{/if}
</div>
</div>
</CardContent>
</Card>
{/if}
