<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected toke;
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { onMount  } from 'svelte';
  import type { goto  } from '$app/navigation';
  import type { Plus, Upload, FileText, Search, Filter, Eye, Download,
    Trash2, Edit2, Bot, Zap, AlertCircle, CheckCircle,
    Clock, BarChart3
   } from 'lucide-svelte';
  import Button from '$lib/components/ui/enhanced-bits.svelte';
  import 
    Input
   from "$lib/components/ui/enhanced-bits.svelte";
  import Label from '$lib/components/ui/label/Label.svelte';
  import * as Card from '$lib/components/ui/card.svelte';
  import * as Dialog from '$lib/components/ui/dialog.svelte';
  import * as Select from '$lib/components/ui/select.svelte';
  import Badge from '$lib/components/ui/badge/Badge.svelte';
  import Progress from '$lib/components/ui/progress/Progress.svelte';
  import type { toast  } from 'svelte-sonner';
  import type { cn  } from '$lib/utils';
  interface Document {
    id: string;
    title: string;
    type: 'legal_brief' | 'contract' | 'evidence' | 'report' | 'template' | 'other';
    status: 'draft' | 'processing' | 'review' | 'final' | 'archived';
    created: string;
    updated?: string;
    size: number;
    author: string;
    caseId?: string;
    tags: string[];
    aiAnalysis?: {
      summary: string;
      keyPoints: string[];
      confidence: number;
      legalConcepts: string[];
    }
    processingStatus?: {
      ocr: 'pending' | 'processing' | 'completed' | 'failed';
      analysis: 'pending' | 'processing' | 'completed' | 'failed';
      embeddings: 'pending' | 'processing' | 'completed' | 'failed';
    }
  }
  // State management with Svelte 5 runes
  let documents = $state<Document[]>([]);
  let filteredDocuments = $state<Document[]>([]);
  let loading = $state(true);
  let uploading = $state(false);
  let uploadProgress = $state(0);
  let searchQuery = $state('');
  let statusFilter = $state('all');
  let typeFilter = $state('all');
  let showUploadDialog = $state(false);
  let showAIAnalysisDialog = $state(false);
  let selectedDocument = $state<Document: null>(null);
  let dragOver = $state(false);
  // Upload form state
  let uploadTitle = $state('');
  let uploadType = $state('other');
  let uploadFile = $state<File: null>(null);
  let uploadCaseId = $state('');
  let uploadTags = $state('');
  let enableAIProcessing = $state(true);
  // Computed properties
  let documentStats = $derived(() => {
    const total = documents.length;
    const processing = documents.filter(item =>
      item.processingStatus &&
      (item.processingStatus.ocr === 'processing' ||
       item.processingStatus.analysis === 'processing' ||
       item.processingStatus.embeddings === 'processing')
    ).length;
    const completed = documents.filter(item =>
      item.status === 'final' ||
      (item.processingStatus && item.processingStatus.analysis === 'completed')
    ).length;
    const withAI = documents.filter(item => !!item.aiAnalysis).length;
    return { total, processing, completed, withAI };
  });
  $effect(() => {
    (async () => {
      await loadDocuments();
    })();
  });
  async function loadDocuments() {
    try {
      loading = true;
      // Try real API, fallback to mockDocuments
      const response = await fetch('/api/documents');
      if (response?.ok) {
        const data = await response.json();
        documents = data?.documents ?? mockDocuments;
      } else {
        documents = mockDocuments;
      }
      filterDocuments();
    } catch (error) {
      console.error('Error loading documents:', error);
      documents = mockDocuments;
      filterDocuments();
    } finally {
      loading = false;
    }
  }
  function filterDocuments() {
    let filtered = [...documents];
    if (searchQuery?.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(doc =>
        doc.title?.toLowerCase().includes(query) ||
        doc.author?.toLowerCase().includes(query) ||
        (doc.tags || []).some(tag => tag.toLowerCase().includes(query))
      );
    }
    if (statusFilter !== 'all') {
      filtered = filtered.filter(doc => doc.status === statusFilter);
    }
    if (typeFilter !== 'all') {
      filtered = filtered.filter(doc => doc.type === typeFilter);
    }
    filteredDocuments = filtered;
  }
  // Mock data for development
  const mockDocuments: Document[] = [
    {
      id: '1',
      title: 'Case File #2024-001',
      type: 'legal_brief',
      status: 'final',
      created: '2024-01-15',
      updated: '2024-01-18',
      size: 2548720,
      author: 'Attorney Smith',
      caseId: 'case-001',
      tags: ['criminal', 'priority', 'federal'],
      aiAnalysis: {
        summary: 'Comprehensive legal brief for federal criminal case involving financial fraud.',
        keyPoints: [
          'Multiple defendants across state lines',
          'Complex financial evidence trail',
          'RICO Act implications'
        ],
        confidence: 0.92,
        legalConcepts: ['RICO', 'Financial Fraud', 'Jurisdiction'];
      },
      processingStatus: { ocr: 'completed', analysis: 'completed', embeddings: 'completed' }
    },
    { id: '2', title: 'Evidence Analysis Report', type: 'report', status: 'processing', created: '2024-01-18', size: 1024000, author: 'Forensic Analyst', tags: ['evidence', 'digital-forensics'], processingStatus: {
        ocr: 'completed', analysis: 'processing', embeddings: 'pending' }
    },
    {
      id: '3',
      title: 'Contract Amendment Draft',
      type: 'contract',
      status: 'draft',
      created: '2024-01-20',
      size: 256000,
      author: 'Legal Counsel',
      caseId: 'case-002',
      tags: ['contract', 'amendment', 'corporate'];
    }
  ];
  function getStatusColor(status: string) {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
      case 'processing': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'review': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      case 'final': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'archived': return 'bg-gray-100 text-gray-600 dark: bg-gray-900 dark:text-gray-400';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
    }
  }
  function getTypeIcon(type: string) {
    switch (type) {
      case 'legal_brief': return '📋';
      case 'contract': return '📝';
      case 'evidence': return '🔍';
      case 'report': return '📊';
      case 'template': return '📄';
      default: return '📎';
    }
  }
  function formatFileSize(bytes: number): string {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }
  // File upload handlers
  function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement: null;
    const file = input?.files?.[0] ?? null;
    if (file) {
      uploadFile = file;
      if (!uploadTitle) uploadTitle = file.name.replace(/\.[^/.]+$/, '');
    }
  }
  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    dragOver = true;
  }
  function handleDragLeave(event: DragEvent) {
    event.preventDefault();
    dragOver = $state(false);
  }
  function handleDrop(event: DragEvent) {
    event.preventDefault();
    dragOver = $state(false);
    const file = event.dataTransfer?.files?.[0] ?? null;
    if (file) {
      uploadFile = file;
      if (!uploadTitle) uploadTitle = file.name.replace(/\.[^/.]+$/, '');
    }
  }
  async function uploadDocument() {
    if (!uploadFile || !uploadTitle) {
      toast.error('Please provide a file and title');
      return;
    }
    uploading = true;
    uploadProgress = 0;
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('title', uploadTitle);
      formData.append('type', uploadType);
      formData.append('caseId', uploadCaseId);
      formData.append('tags', uploadTags);
      formData.append('enableAI', enableAIProcessing.toString());
      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData
      });
      if (response.ok) {
        const result = await response.json();
        toast.success('Document uploaded successfully');
        showUploadDialog = $state(false);
        resetUploadForm();
        await loadDocuments();
        if (enableAIProcessing) {
          toast.info('AI analysis started - check back in a few minutes');
        }
      } else {
        throw new Error('Upload failed');
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload document');
    } finally {
      uploading = false;
      uploadProgress = 0;
    }
  }
  function resetUploadForm() {
    uploadTitle = '';
    uploadType = 'other';
    uploadFile = null;
    uploadCaseId = '';
    uploadTags = '';
    enableAIProcessing = true;
  }
  function viewDocument(doc: Document) {
    selectedDocument = doc;
    showAIAnalysisDialog = true;
  }
  function editDocument(doc: Document) {
    goto(`/legal/documents/${doc.id}/edit`);
  }
  async function deleteDocument(doc: Document) {
    if (!confirm('Are you sure you want to delete this document?')) return;
    try {
      const response = await fetch(`/api/legal/documents/${doc.id}`, { method: 'DELETE' });
      if (response.ok) {
        toast.success('Document deleted');
        await loadDocuments();
      } else {
        throw new Error('Delete failed');
      }
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to delete document');
    }
  }
  // Watch for search/filter changes
  $effect(() => {
    filterDocuments();
  });
</script>
<svelte:head>
  <title>Legal Documents - AI-Powered Document Management</title>
  <meta name="description" content="Upload, analyze, and manage legal documents with AI-powered processing and vector search" />
</svelte:head>
<div class="container mx-auto py-6 px-4 max-w-7xl">
  <div class="flex flex-col space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold tracking-tight text-foreground">Legal Documents</h1>
        <p class="nes-text is-disabled">
          AI-powered document management with OCR, analysis, and vector search
        </p>
      </div>
      <div class="flex gap-2">
        <!-- fixed: properly closed Button tags and valid onclick handlers -->
        <Button class="bits-btn" variant="ghost" onclick={() => goto('/legal/documents/templates')}>
          <FileText class="h-4 w-4 mr-2" />
          Templates
        </Button>
        <Button class="bits-btn" onclick={() => (showUploadDialog = true)}>
          <Plus class="h-4 w-4 mr-2" />
          Upload Document
        </Button>
      </div>
    </div>
    <!-- Statistics Overview -->
    <div class="grid gap-4 md:grid-cols-4">
      <div.Root>
        <div.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
          <div.Title class="text-sm font-medium">Total Documents</div.Title>
          <FileText class="h-4 w-4 nes-text is-disabled" />
        </div.Header>
        <div.Content>
          <div class="text-2xl font-bold">{documentStats.total}</div>
        </div>
      </div>
      <div.Root>
        <div.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
          <div.Title class="text-sm font-medium">Processing</div.Title>
          <Clock class="h-4 w-4 text-blue-500" />
        </div.Header>
        <div.Content>
          <div class="text-2xl font-bold text-blue-600">{documentStats.processing}</div>
        </div>
      </div>
      <div.Root>
        <div.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
          <div.Title class="text-sm font-medium">Completed</div.Title>
          <CheckCircle class="h-4 w-4 text-green-500" />
        </div.Header>
        <div.Content>
          <div class="text-2xl font-bold text-green-600">{documentStats.completed}</div>
        </div>
      </div>
      <div.Root>
        <div.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
          <div.Title class="text-sm font-medium">AI Analyzed</div.Title>
          <Bot class="h-4 w-4 text-purple-500" />
        </div.Header>
        <div.Content>
          <div class="text-2xl font-bold text-purple-600">{documentStats.withAI}</div>
        </div>
      </div>
    </div>
    <!-- Search and Filters -->
    <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div class="flex flex-col gap-4 md:flex-row md:items-center">
        <div class="relative">
          <Search class="absolute left-2 top-2.5 h-4 w-4 nes-text is-disabled" />
          <Input
            bind:value={searchQuery}
            placeholder="Search documents by title, author, or tags..."
            class="pl-8 w-full md:w-[400px]"
          />
        </div>
        <Select bind:selected={statusFilter}>
          <Select.Trigger class="w-[140px]">
            <Select.Value placeholder="Status" />
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="all">All Status</Select.Item>
            <Select.Item value="draft">Draft</Select.Item>
            <Select.Item value="processing">Processing</Select.Item>
            <Select.Item value="review">Review</Select.Item>
            <Select.Item value="final">Final</Select.Item>
            <Select.Item value="archived">Archived</Select.Item>
          </Select.Content>
        </Select>
        <Select bind:selected={typeFilter}>
          <Select.Trigger class="w-[140px]">
            <Select.Value placeholder="Type" />
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="all">All Types</Select.Item>
            <Select.Item value="legal_brief">Legal Brief</Select.Item>
            <Select.Item value="contract">Contract</Select.Item>
            <Select.Item value="evidence">Evidence</Select.Item>
            <Select.Item value="report">Report</Select.Item>
            <Select.Item value="template">Template</Select.Item>
            <Select.Item value="other">Other</Select.Item>
          </Select.Content>
        </Select>
      </div>
    </div>
    <!-- Documents Grid -->
    {#if loading}
      <div class="flex items-center justify-center py-12">
        <div class="flex items-center gap-2">
          <div class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
          <span class="nes-text is-disabled">Loading documents...</span>
        </div>
      </div>
    {:else if documents.length === 0}
      <div.Root>
        <div.Content class="flex flex-col items-center justify-center py-12">
          <FileText class="h-12 w-12 nes-text is-disabled mb-4" />
          <h3 class="text-lg font-semibold mb-2">
            {searchQuery || statusFilter !== 'all' || typeFilter !== 'all'
              ? 'No documents found matching your filters'
              : 'No documents found'}
          </h3>
          <p class="nes-text is-disabled mb-4">
            {documents.length === 0
              ? 'Upload your first document to get started with AI-powered analysis'
              : 'Try adjusting your search terms or filters'}
          </p>
          <Button class="bits-btn" onclick={() => (showUploadDialog = true)}>
            <Plus class="h-4 w-4 mr-2" />
            Upload Document
          </Button>
        </div.Content>
      </div.Root>
    {:else}
      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {#each Array.isArray(filteredDocuments) ? filteredDocuments : [] as document}
          <div.Root class="cursor-pointer transition-colors hover:bg-muted/50" onclick={() => viewDocument(document)}>
            <div.Header>
              <div class="flex items-start justify-between">
                <div class="flex items-center gap-3">
                  <div class="text-2xl">{getTypeIcon(document.type)}</div>
                  <div class="space-y-1">
                    <div.Title class="text-lg line-clamp-2">{document.title}</div.Title>
                    <div class="flex items-center gap-2">
                      <Badge class={cn(getStatusColor(document.status), 'text-xs')}>
                        {document.status}
                      </Badge>
                      {#if document.aiAnalysis}
                        <Badge variant="secondary" class="text-xs">
                          <Bot class="h-3 w-3 mr-1" />
                          AI Analyzed
                        </Badge>
                      {/if}
                    </div>
                  </div>
                </div>
                <div class="flex gap-1">
                  <!-- Document card actions: ensure Button tags are closed and handlers stop propagation properly -->
                  <Button class="bits-btn" variant="ghost" size="sm" onclick={(e) => { e.stopPropagation(); editDocument(document); }}>
                    <Edit2 class="h-4 w-4" />
                  </Button>
                  <Button class="bits-btn" variant="ghost" size="sm" onclick={(e) => { e.stopPropagation(); deleteDocument(document); }}>
                    <Trash2 class="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div.Header>
            <div.Content>
              <div class="space-y-3">
                <div class="text-sm nes-text is-disabled">
                  <p>Author: {document.author}</p>
                  <p>Size: {formatFileSize(document.size)}</p>
                  <div class="flex justify-between items-center mt-2">
                    <span>Created: {new Date(document.created).toLocaleDateString()}</span>
                    {#if document.updated}
                      <span>Updated: {new Date(document.updated).toLocaleDateString()}</span>
                    {/if}
                  </div>
                </div>
                {#if document.tags.length > 0}
                  <div class="flex flex-wrap gap-1">
                    {#each Array.isArray(document.tags.slice(0, 3)) ? document.tags.slice(0, 3) : [] as tag}
                      <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700">{tag}</span>
                    {/each}
                    {#if document.tags.length > 3}
                      <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700">+{document.tags.length - 3} more</span>
                    {/if}
                  </div>
                {/if}
                {#if document.processingStatus}
                  <div class="space-y-2">
                    <div class="text-xs nes-text is-disabled">Processing Status:</div>
                    <div class="flex gap-2 text-xs">
                      <span class="{document.processingStatus.ocr === 'completed' ? 'text-green-600' : document.processingStatus.ocr === 'processing' ? 'text-blue-600' : 'text-gray-500'}">
                        OCR: {document.processingStatus.ocr}
                      </span>
                      <span class="{document.processingStatus.analysis === 'completed' ? 'text-green-600' : document.processingStatus.analysis === 'processing' ? 'text-blue-600' : 'text-gray-500'}">
                        AI: {document.processingStatus.analysis}
                      </span>
                    </div>
                  </div>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
<!-- Upload Document Dialog -->
<Dialog bind:open={showUploadDialog}>
  <Dialog.Content class="sm:max-w-[600px]">
    <Dialog.Header>
      <Dialog.Title>Upload Document</Dialog.Title>
      <Dialog.Description>
        Upload and analyze legal documents with AI-powered processing including OCR, summarization, and vector embeddings.
      </Dialog.Description>
    </Dialog.Header>
    <div class="grid gap-4 py-4">
      <!-- File Upload Area -->
      <div class="grid gap-2">
        <Label>Document File *</Label>
        <div
          class="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
                 {dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-muted-foreground/50'}
                 {uploadFile ? 'border-green-500 bg-green-50' : ''}"
          ondragover={handleDragOver}
          ondragleave={handleDragLeave}
          role="region" aria-label="Drop zone" ondrop={handleDrop}
        >
          {#if uploadFile}
            <div class="space-y-2">
              <FileText class="h-8 w-8 mx-auto text-green-600" />
              <p class="font-medium">{uploadFile.name}</p>
              <p class="text-sm nes-text is-disabled">{formatFileSize(uploadFile.size)}</p>
              <Button class="bits-btn" variant="ghost" size="sm" onclick={() => (uploadFile = null)}>
                Remove
              </Button>
            </div>
          {:else}
            <div class="space-y-2">
              <Upload class="h-8 w-8 mx-auto nes-text is-disabled" />
              <div>
                <p class="font-medium">Drop your document here, or</p>
                <label for="file-upload" class="text-primary cursor-pointer hover:underline">
                  browse files
                  <input
                    id="file-upload"
                    type="file"
                    class="sr-only"
                    accept=".pdf,.doc,.docx,.txt,.rtf"
                    onchange={handleFileSelect}
                  />
                </label>
              </div>
              <p class="text-sm nes-text is-disabled">
                Supports PDF, DOC, DOCX, TXT, RTF (max 50MB)
              </p>
            </div>
          {/if}
        </div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div class="grid gap-2">
          <Label for="upload-title">Document Title *</Label>
          <Input id="upload-title" bind:value={uploadTitle} placeholder="Enter document title" />
        </div>
        <div class="grid gap-2">
          <Label for="upload-type">Document Type</Label>
          <Select bind:selected={uploadType}>
            <Select.Trigger>
              <Select.Value placeholder="Select type" />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="legal_brief">Legal Brief</Select.Item>
              <Select.Item value="contract">Contract</Select.Item>
              <Select.Item value="evidence">Evidence</Select.Item>
              <Select.Item value="report">Report</Select.Item>
              <Select.Item value="template">Template</Select.Item>
              <Select.Item value="other">Other</Select.Item>
            </Select.Content>
          </Select>
        </div>
      </div>
      <div class="grid gap-2">
        <Label for="upload-case">Case ID (Optional)</Label>
        <Input id="upload-case" bind:value={uploadCaseId} placeholder="Link to specific case" />
      </div>
      <div class="grid gap-2">
        <Label for="upload-tags">Tags (comma-separated)</Label>
        <Input id="upload-tags" bind:value={uploadTags} placeholder="e.g., contract, confidential, priority" />
      </div>
      <div class="flex items-center space-x-2">
        <input type="checkbox" id="enable-ai" bind:checked={enableAIProcessing} class="rounded" />
        <Label for="enable-ai" class="text-sm font-medium">
          Enable AI Processing (OCR, Analysis, Embeddings)
        </Label>
      </div>
      {#if uploading}
        <div class="space-y-2">
          <div class="flex justify-between text-sm">
            <span>Uploading...</span>
            <span>{uploadProgress}%</span>
          </div>
          <Progress value={uploadProgress} />
        </div>
      {/if}
    </div>
    <!-- Upload dialog footer: fixed closing tags and onclick handlers -->
    <Dialog.Footer>
      <Button class="bits-btn" variant="ghost" onclick={() => { showUploadDialog = $state(false); resetUploadForm(); }}>
        Cancel
      </Button>
      <Button class="bits-btn" onclick={uploadDocument} disabled={uploading || !uploadFile || !uploadTitle}>
        {#if uploading}
          <div class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2"></div>
        {:else}
          <Upload class="h-4 w-4 mr-2" />
        {/if}
        Upload Document
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog>
<!-- AI Analysis Dialog -->
<Dialog bind:open={showAIAnalysisDialog}>
  <Dialog.Content class="sm:max-w-[700px]">
    {#if selectedDocument}
      <Dialog.Header>
        <Dialog.Title class="flex items-center gap-2">
          <span class="text-2xl">{getTypeIcon(selectedDocument.type)}</span>
          {selectedDocument.title}
        </Dialog.Title>
        <Dialog.Description>
          Document analysis and details
        </Dialog.Description>
      </Dialog.Header>
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-4 text-sm">
          <div><strong>Type:</strong> {selectedDocument.type.replace('_', ' ')}</div>
          <div><strong>Status:</strong> <Badge class={cn(getStatusColor(selectedDocument.status), 'text-xs')}>{selectedDocument.status}</Badge></div>
          <div><strong>Author:</strong> {selectedDocument.author}</div>
          <div><strong>Size:</strong> {formatFileSize(selectedDocument.size)}</div>
          <div><strong>Created:</strong> {new Date(selectedDocument.created).toLocaleDateString()}</div>
          {#if selectedDocument.updated}
            <div><strong>Updated:</strong> {new Date(selectedDocument.updated).toLocaleDateString()}</div>
          {/if}
        </div>
        {#if selectedDocument.tags.length > 0}
          <div>
            <strong class="text-sm">Tags:</strong>
            <div class="flex flex-wrap gap-1 mt-1">
              {#each Array.isArray(selectedDocument.tags) ? selectedDocument.tags : [] as tag}
                <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700">{tag}</span>
              {/each}
            </div>
          </div>
        {/if}
        {#if selectedDocument.aiAnalysis}
          <div class="space-y-3">
            <div class="flex items-center gap-2">
              <Bot class="h-5 w-5 text-purple-600" />
              <h3 class="font-semibold">AI Analysis</h3>
              <span class="px-2 py-1 rounded text-xs font-medium bg-gray-200 text-gray-700">Confidence: {(selectedDocument.aiAnalysis.confidence * 100).toFixed(1)}%</span>
            </div>
            <div class="space-y-2">
              <div>
                <strong class="text-sm">Summary:</strong>
                <p class="text-sm nes-text is-disabled mt-1">{selectedDocument.aiAnalysis.summary}</p>
              </div>
              <div>
                <strong class="text-sm">Key Points:</strong>
                <ul class="text-sm nes-text is-disabled mt-1 space-y-1">
                  {#each Array.isArray(selectedDocument.aiAnalysis.keyPoints) ? selectedDocument.aiAnalysis.keyPoints : [] as point}
                    <li class="flex items-start gap-2">
                      <span class="text-primary mt-1">•</span>
                      {point}
                    </li>
                  {/each}
                </ul>
              </div>
              <div>
                <strong class="text-sm">Legal Concepts:</strong>
                <div class="flex flex-wrap gap-1 mt-1">
                  {#each Array.isArray(selectedDocument.aiAnalysis.legalConcepts) ? selectedDocument.aiAnalysis.legalConcepts : [] as concept}
                    <Badge class="text-xs bg-purple-100 text-purple-800">{concept}</Badge>
                  {/each}
                </div>
              </div>
            </div>
          </div>
        {:else}
          <div class="text-center py-4 nes-text is-disabled">
            <Bot class="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>AI analysis not available for this document</p>
          </div>
        {/if}
        {#if selectedDocument.processingStatus}
          <div class="space-y-2">
            <strong class="text-sm">Processing Status:</strong>
            <div class="grid grid-cols-3 gap-2 text-xs">
              <div class="text-center p-2 rounded border">
                <div class="font-medium">OCR</div>
                <div class="{selectedDocument.processingStatus.ocr === 'completed' ? 'text-green-600' : selectedDocument.processingStatus.ocr === 'processing' ? 'text-blue-600' : 'text-gray-500'}">
                  {selectedDocument.processingStatus.ocr}
                </div>
              </div>
              <div class="text-center p-2 rounded border">
                <div class="font-medium">Analysis</div>
                <div class="{selectedDocument.processingStatus.analysis === 'completed' ? 'text-green-600' : selectedDocument.processingStatus.analysis === 'processing' ? 'text-blue-600' : 'text-gray-500'}">
                  {selectedDocument.processingStatus.analysis}
                </div>
              </div>
              <div class="text-center p-2 rounded border">
                <div class="font-medium">Embeddings</div>
                <div class="{selectedDocument.processingStatus.embeddings === 'completed' ? 'text-green-600' : selectedDocument.processingStatus.embeddings === 'processing' ? 'text-blue-600' : 'text-gray-500'}">
                  {selectedDocument.processingStatus.embeddings}
                </div>
              </div>
            </div>
          </div>
        {/if}
      </div>
      <!-- AI Analysis Dialog footer: fixed closing tags -->
      <Dialog.Footer>
        <Button class="bits-btn" variant="ghost" onclick={() => (showAIAnalysisDialog = false)}>
          Close
        </Button>
        <Button class="bits-btn" onclick={() => editDocument(selectedDocument!)}>
          <Edit2 class="h-4 w-4 mr-2" />
          Edit Document
        </Button>
      </Dialog.Footer>
    {/if}
  </Dialog.Content>
</Dialog>
<style>
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>