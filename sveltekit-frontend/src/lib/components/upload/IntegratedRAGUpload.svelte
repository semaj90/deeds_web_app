<script lang="ts">
import Alert from "$lib/components/ui/alert/Alert.svelte";
import AlertDescription from "$lib/components/ui/alert/AlertDescription.svelte";
import Badge from "$lib/components/ui/Badge.svelte";
import Button from '$lib/components/ui/Button.svelte';
import Input from "$lib/components/ui/input/Input.svelte";
import Progress from "$lib/components/ui/progress/Progress.svelte";
import AlertCircle from 'lucide-svelte/icons/alert-circle';
import CheckCircle from 'lucide-svelte/icons/check-circle';
import Database from 'lucide-svelte/icons/database';
import FileText from 'lucide-svelte/icons/file-text';
import Loader2 from 'lucide-svelte/icons/loader-2';
import Search from 'lucide-svelte/icons/search';
import Server from 'lucide-svelte/icons/server';
import Upload from 'lucide-svelte/icons/upload';

interface IntegrationResult { document: { id: string;
    filename: string;
    chunks: number;
    qdrantStored: boolean;
  };
  recommendations: Array<{ similarity: number, content: string;
    source?: string;
  }>;
}

interface SearchResult { content: string, similarity: number;
  source?: string;
  id?: string;
}

interface Props {
  onSuccess?: (result: IntegrationResult) => void;
  onError?: (error: string) => void;
}

let { onSuccess, onError }: Props = $props();

let fileInput = $state<HTMLInputElement | null>(null);
let uploading = $state<boolean>(false);
let progress = $state<number>(0);
let result = $state<IntegrationResult | null>(null);
let error = $state<string | null>(null);

let searchQuery = $state<string>('');
let searchResults = $state<SearchResult[]>([]);
let searching = $state<boolean>(false);

async function handleFileSelect(e: Event) {
  const input = e.currentTarget as HTMLInputElement;
  if (!input.files?.length) return;

  const file = input.files[0];
  await uploadFile(file);
}

async function uploadFile(file: File) {
  uploading = true;
  progress = 0;
  error = null;
  result = null;

  try {
    const formData = new FormData();
    formData.append('file', file);

    // Simulate progress
    const progressInterval = setInterval(() => {
      progress = Math.min(progress + 10, 90);
    }, 200);

    const response = await fetch('/api/integrated/upload', {
      method: 'POST',
      body: formData
    });

    clearInterval(progressInterval);
    progress = 100;

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.details || errorData.error || 'Upload failed');
    }

    const data = await response.json();
    result = data;
    onSuccess?.(data);
    console.log('✅ Upload successful:', data);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Upload failed';
    error = errorMsg;
    onError?.(errorMsg);
    console.error('❌ Upload error:', err);
  } finally {
    uploading = false;
  }
}

async function searchDocuments() {
  if (!searchQuery.trim()) return;

  searching = true;
  searchResults = [];

  try {
    const response = await fetch('/api/integrated/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
       query: searchQuery,
        limit: 5
      })
    });

    if (!response.ok) {
      throw new Error('Search failed');
    }

    const data = await response.json();
    searchResults = data.results || [];
    console.log('🔍 Search results:', searchResults);
  } catch (err) {
    console.error('❌ Search error:', err);
    error = err instanceof Error ? err.message : 'Search failed';
  } finally {
    searching = false;
  }
}

function handleDragOver(e: DragEvent) {
  e.preventDefault();
}

function handleDrop(e: DragEvent) {
  e.preventDefault();
  const files = e.dataTransfer?.files;
  if (files?.length) {
    uploadFile(files[0]);
  }
}

function handleClick() {
  fileInput?.click();
}
</script>

<div class="integrated-rag-upload space-y-8 p-6 bg-background rounded-lg border border-border">
  <!-- Upload Section -->
  <div class="upload-section space-y-4">
    <div class="flex items-center gap-2">
      <Upload class="h-5 w-5 text-primary" />
      <h3 class="font-semibold text-lg">Upload Document</h3>
    </div>

    <!-- Drop Zone -->
    <button
      class="w-full drop-zone border-2 border-dashed border-input rounded-xl p-8 text-center hover:bg-accent/50 transition-colors cursor-pointer relative focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      class:opacity-50={uploading}
      class:cursor-not-allowed={uploading}
      ondragover={handleDragOver}
      ondrop={handleDrop}
      onclick={handleClick}
      disabled={uploading}
    >
      {#if uploading}
        <div class="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm rounded-xl">
          <div class="w-full max-w-xs space-y-2 p-4">
            <div class="flex items-center justify-between text-sm text-muted-foreground">
              <span>Processing...</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} />
          </div>
        </div>
      {/if}

      <div class="flex flex-col items-center gap-2 text-muted-foreground">
        <Server class="h-10 w-10 mb-2 opacity-50" />
        <p class="font-medium text-foreground">Drag & drop or click to upload</p>
        <span class="text-xs">Supported: .txt, .md, .json, .csv (max 10MB)</span>
      </div>
    </button>

    <input
      type="file"
      bind:this={fileInput}
      accept=".txt,.md,.json,.csv"
      onchange={handleFileSelect}
      class="hidden"
    />
  </div>

  <!-- Results Section -->
  {#if result}
    <div class="result-section bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-4 space-y-3">
      <div class="flex items-center gap-2 text-green-700 dark:text-green-400">
        <CheckCircle class="h-5 w-5" />
        <h4 class="font-medium">Upload Successful</h4>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div class="space-y-1">
          <div class="flex items-center gap-2 text-muted-foreground">
            <FileText class="h-3 w-3" />
            <span>File: {result.document.filename}</span>
          </div>
          <div class="flex items-center gap-2 text-muted-foreground">
            <Database class="h-3 w-3" />
            <span>Chunks: {result.document.chunks}</span>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <Badge variant="outline" class="bg-background">
             {result.document.qdrantStored ? '✓ Qdrant' : 'Pending'}
          </Badge>
          <Badge variant="outline" class="bg-background">✓ pgvector</Badge>
          <Badge variant="outline" class="bg-background">✓ MinIO</Badge>
        </div>
      </div>

      {#if result.recommendations && result.recommendations.length > 0}
        <div class="border-t border-green-200 dark:border-green-800/50 pt-3 mt-3">
          <h5 class="text-xs font-semibold text-green-700 dark:text-green-400 mb-2 flex items-center gap-2">
            <Search class="h-3 w-3" /> Similar Documents Found
          </h5>
          <div class="space-y-2">
            {#each result.recommendations as rec}
              <div class="text-xs bg-background/50 p-2 rounded border border-green-100 dark:border-green-800/30">
                <div class="flex items-center justify-between mb-1">
                  <span class="font-medium text-green-800 dark:text-green-300">
                    {Math.round(rec.similarity * 100)}% Match
                  </span>
                </div>
                <p class="text-muted-foreground line-clamp-2">{rec.content}</p>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Error Message -->
  {#if error}
    <Alert variant="destructive">
      <AlertCircle class="h-4 w-4" />
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  {/if}

  <!-- Semantic Search Section -->
  <div class="search-section border-t border-border pt-6 space-y-4">
    <div class="flex items-center gap-2 mb-2">
      <Search class="h-5 w-5 text-primary" />
      <h3 class="font-semibold text-lg">Semantic Search</h3>
    </div>

    <div class="flex gap-2">
      <div class="relative flex-1">
        <Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search across uploaded documents..."
          class="pl-9"
          bind:value={searchQuery}
          onkeydown={(e) => e.key === 'Enter' && searchDocuments()}
        />
      </div>
      <Button
        onclick={searchDocuments}
        disabled={searching || !searchQuery.trim()}
      >
        {#if searching}
          <Loader2 class="h-4 w-4 animate-spin mr-2" />
          Searching...
        {:else}
          Search
        {/if}
      </Button>
    </div>

    {#if searchResults.length > 0}
      <div class="search-results space-y-3 mt-4">
        <h5 class="text-sm font-medium text-muted-foreground">Results ({searchResults.length})</h5>
        {#each searchResults as result}
          <div class="search-result-item p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors">
            <div class="flex items-center justify-between mb-2">
              <Badge variant="secondary" class={result.similarity > 0.8 ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : ''}>
                {Math.round(result.similarity * 100)}% Relevance
              </Badge>
              {#if result.source}
                <span class="text-xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
                  {result.source}
                </span>
              {/if}
            </div>
            <p class="text-sm text-foreground/90 line-clamp-3 leading-relaxed">
              {result.content}
            </p>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

