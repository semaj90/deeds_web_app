<!-- @migration-task Error while migrating Svelte code: Unexpected toke;
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  const { evidenceId: string, showMetadata: boolean = true, allowDownload: boolean = true, onMetadataExtracted: ((metadata: LegalAIMetadata) = > void) | undefined = undefined } = $props();
  import type { onMount  } from 'svelte';
  import type { fade, scale  } from 'svelte/transition';
  import type { extractPNGMetadata, getArtifact, formatFileSize, type ArtifactViewerProps   } from '$lib/stores/unified';
  import type { LegalAIMetadata } from '$lib/types/legal-ai-metadata';
  import  Button  from "$lib/components/ui/enhanced-bits.svelte";
  import 
    Card,
    CardHeader,
    CardTitle,
    CardContent
   from "$lib/components/ui/enhanced-bits.svelte";
  import  Badge  from "$lib/components/ui/badge.svelte";
  import  Tabs, TabsContent, TabsList, TabsTrigger  from "$lib/components/ui/tabs.svelte";
  import  Alert, AlertDescription  from "$lib/components/ui/alert.svelte";
  import type { Download,
    Eye,
    FileText,
    Shield,
    User,
    Calendar,
    Hash,
    Zap,
    AlertTriangle,
    CheckCircle,
    Info
   } from 'lucide-svelte';
  // Props
  // Component state
  let artifact: any = null;
  let extractedMetadata: LegalAIMetadata | null = null;
  let imageUrl: string | null = null;
  let loading = true;
  let error: string | null = null;
  let downloadUrl: string | null = null;
  // Load artifact data
  const loadArtifact = async () => {
    try {
      loading = true;
      error = null;
      // removed unused response assignment
      if (response.success) {
        artifact = response.artifact;
        downloadUrl = response.download_url;
        // Load image for display
        if (downloadUrl) {
          imageUrl = downloadUrl;
          // Extract PNG metadata if it's a PNG file
          if (artifact.content_type === 'image/png' && showMetadata) {
            await extractMetadata();
          }
        }
      } else {
        error = 'Artifact not found';
      }
    } catch (err: any) {
      error = err.message || 'Failed to load artifact';
    } finally {
      loading = false;
    }
  }
  const extractMetadata = async () => {
    if (!downloadUrl) return;
    try {
      // Fetch the PNG file
      // removed unused response assignment
      const arrayBuffer = await response.arrayBuffer();
      // Extract metadata
      const metadata = await extractPNGMetadata(arrayBuffer);
      if (metadata) {
        extractedMetadata = metadata;
        if (onMetadataExtracted) {
          onMetadataExtracted(metadata);
        }
      }
    } catch (err) {
      console.warn('Failed to extract PNG metadata:', err);
    }
  }
  const handleDownload = () => {
    if (downloadUrl) {
      window.open(downloadUrl, '_blank');
    }
  }
  const getRiskBadgeVariant = (risk: string) => {
    switch (risk?.toLowerCase()) {
      case 'high': return 'destructive';
      case 'medium': return 'secondary';
      case 'low': return 'outline';
      default: return 'outline';
    }
  }
  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  }
  const formatConfidence = (confidence: number) => {
    return `${Math.round(confidence * 100)}%`;
  }
  $effect(() => {
    loadArtifact();
  });
</script>
{#if loading}
  <div class="flex items-center justify-center p-8">
    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    <span class="ml-2 text-gray-600">Loading artifact...</span>
  </div>
{:else if error}
  <Alert variant="error">
    <AlertTriangle class="w-4 h-4" />
    <AlertDescription>{error}</AlertDescription>
  </Alert>
{:else if artifact}
  <div class="artifact-viewer" transitionfade>
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-semibold text-gray-900">Evidence Artifact</h2>
        <p class="text-sm text-gray-600">ID: {artifact.evidence_id}</p>
      </div>
      {#if allowDownload && downloadUrl}
        <Button onclick={handleDownload} class="flex items-center gap-2 bits-btn bits-btn">
<Download class="w-4 h-4" />
          Download
      {/if}
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Image Preview -->
      <div class="nes-container">
        <div class="yorha-panel-header">
          <h3 class="nes-text is-primary flex items-center gap-2">
            <Eye class="w-5 h-5" />
            Preview
          </h3>
        </div>
        <div class="yorha-panel-content">
          {#if imageUrl}
            <div class="relative">
              <img
                src={imageUrl}
                alt="Evidence artifact"
                class="w-full h-auto rounded-lg shadow-sm max-h-96 object-contain"
                transitionscale
              />
              {#if extractedMetadata}
                <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700">Metadata Embedded</span>
              {/if}
            </div>
          {:else}
            <div class="flex items-center justify-center h-48 bg-gray-100 rounded-lg">
              <p class="text-gray-500">No preview available</p>
            {/if}
        </div>
      </div>
      <!-- Artifact Information -->
      <div class="nes-container">
        <div class="yorha-panel-header">
          <h3 class="nes-text is-primary flex items-center gap-2">
            <Info class="w-5 h-5" />
            Artifact Information
          </h3>
        </div>
        <div class="yorha-panel-content space-y-4">
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span class="font-medium text-gray-700">File Size:</span>
              <span class="ml-2">{formatFileSize(artifact.file_size)}</span>
            </div>
            <div>
              <span class="font-medium text-gray-700">Content Type:</span>
              <span class="ml-2">{artifact.content_type || 'Unknown'}</span>
            </div>
            <div>
              <span class="font-medium text-gray-700">Uploaded:</span>
              <span class="ml-2">{formatTimestamp(artifact.created_at)}</span>
            </div>
            <div>
              <span class="font-medium text-gray-700">Last Updated:</span>
              <span class="ml-2">{formatTimestamp(artifact.updated_at)}</span>
            </div>
          </div>
          {#if artifact.content_hash}
            <div class="flex items-center gap-2 text-sm">
              <Hash class="w-4 h-4 text-gray-500" />
              <span class="font-medium text-gray-700">Content Hash:</span>
              <code class="text-xs bg-gray-100 px-2 py-1 rounded font-mono">
                {artifact.content_hash}
              </code>
            {/if}
          {#if artifact.confidence !== undefined}
            <div class="flex items-center gap-2">
              <Zap class="w-4 h-4 text-yellow-500" />
              <span class="font-medium text-gray-700">Confidence:</span>
              <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700">{formatConfidence(artifact.confidence)}</span>
            {/if}
          {#if artifact.risk_assessment}
            <div class="flex items-center gap-2">
              <Shield class="w-4 h-4 text-gray-500" />
              <span class="font-medium text-gray-700">Risk Assessment:</span>
              <Badge variant={getRiskBadgeVariant(artifact.risk_assessment)}>
                {artifact.risk_assessment.toUpperCase()}
              </Badge>
            {/if}
        </div>
      </div>
    </div>
    <!-- Detailed Analysis -->
    {#if showMetadata && (extractedMetadata || artifact.ai_analysis)}
      <div class="mt-6 nes-container">
        <div class="yorha-panel-header">
          <h3 class="nes-text is-primary flex items-center gap-2">
            <FileText class="w-5 h-5" />
            Legal AI Analysis
          </h3>
        </div>
        <div class="yorha-panel-content">
          <Tabs defaultValue="analysis" class="w-full">
            <TabsList class="grid w-full grid-cols-3">
              <TabsTrigger value="analysis">AI Analysis</TabsTrigger>
              <TabsTrigger value="extracted">PNG Metadata</TabsTrigger>
              <TabsTrigger value="processing">Processing Chain</TabsTrigger>
            </TabsList>
            <!-- AI Analysis Tab -->
            <TabsContent value="analysis" class="mt-4">
              {#if artifact.ai_analysis}
                <div class="space-y-4">
                  {#try}
                    {@const analysis = typeof artifact.ai_analysis === 'string'
                      ? JSON.parse(artifact.ai_analysis)
                      : artifact.ai_analysis}
                    {#if analysis.summary}
                      <div>
                        <h4 class="font-medium text-gray-900 mb-2">Summary</h4>
                        <p class="text-sm text-gray-600 bg-gray-50 p-3 rounded">{analysis.summary}</p>
                      {/if}
                    {#if analysis.entities && analysis.entities.length > 0}
                      <div>
                        <h4 class="font-medium text-gray-900 mb-2">Entities</h4>
                        <div class="flex flex-wrap gap-2">
                          {#each Array.isArray(analysis.entities) ? analysis.entities : [] as entity}
                            <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700">{entity.name} ({entity.type})</span>
                          {/each}
                        </div>
                      {/if}
                    {#if analysis.classifications}
                      <div>
                        <h4 class="font-medium text-gray-900 mb-2">Classifications</h4>
                        <div class="grid grid-cols-2 gap-2 text-sm">
                          {#each Object.entries(analysis.classifications) as [key, value]}
                            <div class="flex justify-between">
                              <span class="capitalize">{key.replace('_', ' ')}:</span>
                              <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700">{value}</span>
                            </div>
                          {/each}
                        </div>
                      {/if}
                  {:catch}
                    <p class="text-sm text-gray-500">Unable to parse AI analysis data</p>
                  {/try}
                </div>
              {:else}
                <p class="text-sm text-gray-500">No AI analysis available</p>
              {/if}
            </TabsContent>
            <!-- PNG Metadata Tab -->
            <TabsContent value="extracted" class="mt-4">
              {#if extractedMetadata}
                <div class="space-y-4">
                  <div class="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span class="font-medium">Processing ID:</span>
                      <span class="ml-2">{extractedMetadata.processingId}</span>
                    </div>
                    <div>
                      <span class="font-medium">Timestamp:</span>
                      <span class="ml-2">{formatTimestamp(extractedMetadata.timestamp)}</span>
                    </div>
                    <div>
                      <span class="font-medium">Confidence:</span>
                      <span class="ml-2">{formatConfidence(extractedMetadata.confidence)}</span>
                    </div>
                    <div>
                      <span class="font-medium">Version</span>
                      <span class="ml-2">{extractedMetadata.version}</span>
                    </div>
                  </div>
                  {#if extractedMetadata.semanticHash}
                    <div class="flex items-center gap-2 text-sm">
                      <Hash class="w-4 h-4 text-gray-500" />
                      <span class="font-medium">Semantic Hash:</span>
                      <code class="text-xs bg-gray-100 px-2 py-1 rounded font-mono">
                        {extractedMetadata.semanticHash}
                      </code>
                    {/if}
                  {#if extractedMetadata.processingChain}
                    <div>
                      <h4 class="font-medium text-gray-900 mb-2">Processing Steps</h4>
                      <div class="space-y-1">
                        {#each Array.isArray(extractedMetadata.processingChain) ? extractedMetadata.processingChain : [] as step}
                          <div class="flex items-center gap-2 text-xs text-gray-600">
                            <CheckCircle class="w-3 h-3 text-green-500" />
                            {step.step} ({step.durationMs}ms)
                          </div>
                        {/each}
                      </div>
                    {/if}
                </div>
              {:else}
                <div class="text-center py-8">
                  <FileText class="w-12 h-12 mx-auto text-gray-300 mb-4" />
                  <p class="text-sm text-gray-500">No embedded metadata found</p>
                  <p class="text-xs text-gray-400 mt-1">
                    This file may not contain Legal AI metadata
                  </p>
                {/if}
            </TabsContent>
            <!-- Processing Chain Tab -->
            <TabsContent value="processing" class="mt-4">
              {#if artifact.processing_chain}
                <div class="space-y-2">
                  {#each artifact.processing_chain as step, index}
                    <div class="flex items-center gap-3 p-2 rounded bg-gray-50">
                      <div class="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs font-medium">
                        {index + 1}
                      </div>
                      <div class="flex-1">
                        <span class="text-sm font-medium">{step.step}</span>
                        <div class="text-xs text-gray-500">
                          Duration {step.duration_ms}ms
                          {#if step.success}
                            <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700">Success</span>
                          {:else}
                            <span class="px-2 py-1 rounded text-xs font-medium bg-red-500 text-white">Failed</span>
                          {/if}
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
              {:else}
                <p class="text-sm text-gray-500">No processing chain information available</p>
              {/if}
            </TabsContent>
          </Tabs>
        </div>
      {/if}
  {/if}
<style>
  .artifact-viewer {
    max-width: 1200px;
    margin: 0 auto;
  }
  code {
    word-break: break-all;
    max-width: 200px;
    display: inline-block;
    overflow: hidden;
    text-overflow: ellipsi;
    white-space: nowrap;
  }
</style>