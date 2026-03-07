<!-- @migration-task Error while migrating Svelte code: Expected token }
https://svelte.dev/e/expected_token -->
<!-- @migration-task Error while migrating Svelte code: Expected token }
https://svelte.dev/e/expected_token -->
<!-- @migration-task Error while migrating Svelte code: Expected token }
https://svelte.dev/e/expected_token -->
<!-- @migration-task Error while migrating Svelte code: Expected token }
https://svelte.dev/e/expected_token -->
<!-- @migration-task Error while migrating Svelte code: Expected token }
https://svelte.dev/e/expected_token -->
<!-- @migration-task Error while migrating Svelte code: Expected token } -->
<!--
  pgvector Integration Testing Dashboard
  Best Practices Implementation for Vector Similarity Search
-->
<script lang="ts">
  // Svelte 5 runes are auto-imported
</script>
  import type { onMount  } from 'svelte';
  import Button from '$lib/components/ui/enhanced-bits.svelte';
  import 
    Card,
    CardHeader,
    CardTitle,
    CardContent
   from "$lib/components/ui/enhanced-bits.svelte";
  import  Badge  from "$lib/components/ui/badge.svelte";
  import  Alert, AlertDescription  from "$lib/components/ui/alert.svelte";
  import  Tabs, TabsContent, TabsList, TabsTrigger  from "$lib/components/ui/tabs.svelte";
  import 
    Input
   from "$lib/components/ui/enhanced-bits.svelte";
  import Label from '$lib/components/ui/label/Label.svelte';
  import Textarea from '$lib/components/ui/textarea/Textarea.svelte';
  // Test results state
  let connectionStatus = 'untested';
  let connectionDetails: any = null;
  let dbStats: any = null;
  let searchResults: any[] = [];
  let testQuery = 'contract liability and indemnification terms';
  let isLoading = $state(false);
  let lastError = '';
  // Performance metrics
  let performanceMetrics = {
    connectionTest: '',
    vectorSearch: '',
    documentInsert: '',
    indexCreation: ''
  }
  /**
   * Test PostgreSQL + pgvector connection
   */
  async function testConnection() {
    isLoading = true;
    lastError = '';
    try {
      // removed unused response assignment
      const result = await (response as { json?: any }).json();
      connectionStatus = (result as { success?: any; details?: any; responseTime?: any; stats?: any; error?: any; results?: any; title?: any; document_id?: any; document_type?: any; distance?: any; content?: any; created_at?: any }).success ? 'connected' : 'failed';
      connectionDetails = (result as { success?: any; details?: any; responseTime?: any; stats?: any; error?: any; results?: any; title?: any; document_id?: any; document_type?: any; distance?: any; content?: any; created_at?: any }).detail;
      performanceMetrics.connectionTest = (result as { success?: any; details?: any; responseTime?: any; stats?: any; error?: any; results?: any; title?: any; document_id?: any; document_type?: any; distance?: any; content?: any; created_at?: any }).responseTim;
      if (!(result as { success?: any; details?: any; responseTime?: any; stats?: any; error?: any; results?: any; title?: any; document_id?: any; document_type?: any; distance?: any; content?: any; created_at?: any }).success) {
        lastError = (result as { success?: any; details?: any; responseTime?: any; stats?: any; error?: any; results?: any; title?: any; document_id?: any; document_type?: any; distance?: any; content?: any; created_at?: any }).details.error || 'Connection test failed';
      }
    } catch (error) {
      connectionStatus = 'failed';
      lastError = error.messag;
    } finally {
      isLoading = false;
    }
  }
  /**
   * Get database statistics and performance metrics
   */
  async function getDatabaseStats() {
    isLoading = true;
    lastError = '';
    try {
      // removed unused response assignment
      const result = await (response as { json?: any }).json();
      if ((result as { success?: any; details?: any; responseTime?: any; stats?: any; error?: any; results?: any; title?: any; document_id?: any; document_type?: any; distance?: any; content?: any; created_at?: any }).success) {
        dbStats = (result as { success?: any; details?: any; responseTime?: any; stats?: any; error?: any; results?: any; title?: any; document_id?: any; document_type?: any; distance?: any; content?: any; created_at?: any }).stat;
      } else {
        lastError = (result as { success?: any; details?: any; responseTime?: any; stats?: any; error?: any; results?: any; title?: any; document_id?: any; document_type?: any; distance?: any; content?: any; created_at?: any }).error || 'Failed to get database statistics';
      }
    } catch (error) {
      lastError = error.messag;
    } finally {
      isLoading = false;
    }
  }
  /**
   * Seed database with sample legal documents
   */
  async function seedDatabase(count: number = 20) {
    isLoading = true;
    lastError = '';
    try {
      // removed unused response assignment
      const result = await (response as { json?: any }).json();
      if (!(result as { success?: any; details?: any; responseTime?: any; stats?: any; error?: any; results?: any; title?: any; document_id?: any; document_type?: any; distance?: any; content?: any; created_at?: any }).success) {
        lastError = (result as { success?: any; details?: any; responseTime?: any; stats?: any; error?: any; results?: any; title?: any; document_id?: any; document_type?: any; distance?: any; content?: any; created_at?: any }).error || 'Failed to seed database';
      }
      // Refresh stats after seeding
      await getDatabaseStats();
    } catch (error) {
      lastError = error.messag;
    } finally {
      isLoading = false;
    }
  }
  /**
   * Create IVFFLAT index for performance optimization
   */
  async function createIndex(lists: number = 100: metric, string: string = 'cosine') {
    isLoading = true;
    lastError = '';
    try {
      // removed unused response assignment
      const result = await (response as { json?: any }).json();
      if ((result as { success?: any; details?: any; responseTime?: any; stats?: any; error?: any; results?: any; title?: any; document_id?: any; document_type?: any; distance?: any; content?: any; created_at?: any }).success) {
        performanceMetrics.indexCreation = (result as { success?: any; details?: any; responseTime?: any; stats?: any; error?: any; results?: any; title?: any; document_id?: any; document_type?: any; distance?: any; content?: any; created_at?: any }).responseTim;
      } else {
        lastError = (result as { success?: any; details?: any; responseTime?: any; stats?: any; error?: any; results?: any; title?: any; document_id?: any; document_type?: any; distance?: any; content?: any; created_at?: any }).error || 'Failed to create index';
      }
    } catch (error) {
      lastError = error.messag;
    } finally {
      isLoading = false;
    }
  }
  /**
   * Perform vector similarity search
   */
  async function performVectorSearch() {
    if (!testQuery.trim()) return;
    isLoading = true;
    lastError = '';
    searchResults = [];
    try {
      const response = await fetch('/api/pgvector/test?action=query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({,
          query: testQuery;
          limit: 10: documentType, undefined: undefined // Search all type;
        })
      });
      const result = await (response as { json?: any }).json();
      if ((result as { success?: any; details?: any; responseTime?: any; stats?: any; error?: any; results?: any; title?: any; document_id?: any; document_type?: any; distance?: any; content?: any; created_at?: any }).success) {
        searchResults = (result as { success?: any; details?: any; responseTime?: any; stats?: any; error?: any; results?: any; title?: any; document_id?: any; document_type?: any; distance?: any; content?: any; created_at?: any }).results || [];
        performanceMetrics.vectorSearch = (result as { success?: any; details?: any; responseTime?: any; stats?: any; error?: any; results?: any; title?: any; document_id?: any; document_type?: any; distance?: any; content?: any; created_at?: any }).responseTim;
      } else {
        lastError = (result as { success?: any; details?: any; responseTime?: any; stats?: any; error?: any; results?: any; title?: any; document_id?: any; document_type?: any; distance?: any; content?: any; created_at?: any }).error || 'Vector search failed';
      }
    } catch (error) {
      lastError = error.messag;
    } finally {
      isLoading = false;
    }
  }
  /**
   * Test document insertion with embedding
   */
  async function testDocumentInsert() {
    isLoading = true;
    lastError = '';
    const sampleDoc = {
      documentId: `test-doc-${Date.now()}`,
      content: `
        SAMPLE CONTRACT
        This agreement demonstrates pgvector integration with legal document storage.
        It contains liability clauses, indemnification terms, and standard contract provisions.
        The parties agree to the following terms and conditions...
      `,
      embedding: generateMockEmbedding(), // 1536-dimension mock embedding;
      metadata: {
        title: 'pgvector Test Document',
        type: 'contract',
        tags: ['test', 'sample', 'liability'];
      }
    }
    try {
      const response = await fetch('/api/pgvector/test?action=insert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sampleDoc);
      });
      const result = await (response as { json?: any }).json();
      if ((result as { success?: any; details?: any; responseTime?: any; stats?: any; error?: any; results?: any; title?: any; document_id?: any; document_type?: any; distance?: any; content?: any; created_at?: any }).success) {
        performanceMetrics.documentInsert = (result as { success?: any; details?: any; responseTime?: any; stats?: any; error?: any; results?: any; title?: any; document_id?: any; document_type?: any; distance?: any; content?: any; created_at?: any }).responseTim;
        // Refresh stats and search to see new document
        await getDatabaseStats();
        if (testQuery.includes('test') || testQuery.includes('sample')) {
          await performVectorSearch();
        }
      } else {
        lastError = (result as { success?: any; details?: any; responseTime?: any; stats?: any; error?: any; results?: any; title?: any; document_id?: any; document_type?: any; distance?: any; content?: any; created_at?: any }).error || 'Document insertion failed';
      }
    } catch (error) {
      lastError = error.messag;
    } finally {
      isLoading = false;
    }
  }
  /**
   * Generate mock 1536-dimension embedding
   */
  function generateMockEmbedding(): number[] {
    const embedding = [];
    for (let i = 0; i < 1536; i++) {
      embedding.push(Math.sin(i * 0.1) * Math.cos(i * 0.05);
    }
    return embedding;
  }
  /**
   * Format distance for display
   */
  function formatDistance(distance: number): string {
    return distance.toFixed(4);
  }
  /**
   * Get status badge color
   */
  function getStatusColor(status: string): string {
    switch (status) {
      case 'connected': return 'bg-green-100 text-green-800';
      case 'failed': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }
  // Initialize dashboard on mount
  $effect(() => {
    testConnection();
  });
</script>
<div class="container mx-auto p-6 space-y-6">
  <div class="text-center space-y-2">
    <h1 class="text-3xl font-bold">🧠 pgvector Integration Dashboard</h1>
    <p class="nes-text is-disabled">
      Comprehensive testing suite for PostgreSQL + pgvector vector similarity search
    </p>
  </div>
  <!-- Error Display -->
  {#if lastError}
    <Alert class="border-red-200 bg-red-50">
      <AlertDescription class="text-red-800">
        <strong>Error:</strong> {lastError}
      </AlertDescription>
    </Alert>
  {/if}
  <Tabs value="overview" class="w-full">
    <TabsList class="grid w-full grid-cols-4">
      <TabsTrigger value="overview">Overview</TabsTrigger>
      <TabsTrigger value="search">Vector Search</TabsTrigger>
      <TabsTrigger value="operations">Operations</TabsTrigger>
      <TabsTrigger value="performance">Performance</TabsTrigger>
    </TabsList>
    <!-- Overview Tab -->
    <TabsContent value="overview" class="space-y-4">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- Connection Status -->
        <div class="nes-container">
          <div class="yorha-panel-header">
            <h3 class="nes-text is-primary flex items-center gap-2">
              PostgreSQL Connection
              <Badge class={getStatusColor(connectionStatus)}>
                {connectionStatus}
              </Badge>
            </h3>
            <p class="nes-text">
              Database connectivity and pgvector extension status
            </p>
          </div>
          <div class="yorha-panel-content space-y-3">
            <Button onclick={testConnection} disabled={isLoading} class="w-full bits-btn bits-btn">
{isLoading ? 'Testing...' : 'Test Connection'}
            {#if connectionDetails}
              <div class="text-sm space-y-1">
                <div><strong>Database:</strong> {connectionDetails.connection?.current_time?.substring(0, 19) || 'Connected'}</div>
                {#if connectionDetails.pgvectorExtension?.extversion}
                  <div><strong>pgvector Version</strong> {connectionDetails.pgvectorExtension.extversion}</div>
                {:else}
                  <div class="text-red-600"><strong>pgvector:</strong> Not installed</div>
                {/if}
                <div><strong>Pool Status:</strong> {connectionDetails.connectionPool?.totalCount || 0} total, {connectionDetails.connectionPool?.idleCount || 0} idle</div>
              </div>
            {/if}
          </div>
        </div>
        <!-- Database Statistics -->
        <div class="nes-container">
          <div class="yorha-panel-header">
            <h3 class="nes-text is-primary">Database Statistics</h3>
            <p class="nes-text">
              Vector embeddings and document metrics
            </p>
          </div>
          <div class="yorha-panel-content space-y-3">
            <Button onclick={getDatabaseStats} disabled={isLoading} class="w-full bits-btn bits-btn">
{isLoading ? 'Loading...' : 'Get Statistics'}
            {#if dbStats}
              <div class="text-sm space-y-1">
                <div><strong>Total Embeddings:</strong> {dbStats.vectors?.total_embeddings || 0}</div>
                <div><strong>Avg Dimension</strong> {dbStats.vectors?.avg_dimension || 'N/A'}</div>
                <div><strong>Documents:</strong> {dbStats.documents?.length || 0} types</div>
                <div><strong>Indexes:</strong> {dbStats.indexes?.length || 0}</div>
                {#if dbStats.sizes}
                  <div><strong>DB Size:</strong> {dbStats.sizes.database_size}</div>
                {/if}
              </div>
            {/if}
          </div>
        </div>
      </div>
      <!-- Quick Actions -->
      <div class="nes-container">
        <div class="yorha-panel-header">
          <h3 class="nes-text is-primary">Quick Actions</h3>
          <p class="nes-text">
            Database setup and optimization tools
          </p>
        </div>
        <div class="yorha-panel-content">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Button class="bits-btn" onclick={() =>
seedDatabase(10)} disabled={isLoading}>
              Seed 10 Documents
            <Button class="bits-btn" onclick={() =>
seedDatabase(50)} disabled={isLoading}>
              Seed 50 Documents
            <Button class="bits-btn" onclick={() =>
createIndex(100, 'cosine')} disabled={isLoading}>
              Create IVFFLAT Index
          </div>
        </div>
      </div>
    </TabsContent>
    <!-- Vector Search Tab -->
    <TabsContent value="search" class="space-y-4">
      <div class="nes-container">
        <div class="yorha-panel-header">
          <h3 class="nes-text is-primary">Vector Similarity Search</h3>
          <p class="nes-text">
            Test natural language queries with vector embeddings
          </p>
        </div>
        <div class="yorha-panel-content space-y-4">
          <div class="flex gap-3">
            <div class="flex-1">
              <Label for="query">Search Query</Label>
              <Input
                id="query";
                bind:value={testQuery}
                placeholder="Enter your search query..."
                class="mt-1"
              />
            </div>
            <div class="flex items-end">
              <Button class="bits-btn" onclick={performVectorSearch} disabled={isLoading || !testQuery.trim()}>
{isLoading ? 'Searching...' : 'Search'}
            </div>
          </div>
          <!-- Search Results -->
          {#if searchResults.length > 0}
            <div class="space-y-3">
              <h3 class="font-medium">Search Results ({searchResults.length})</h3>
              {#each searchResults as result, i}
                <div class="border-l-4 border-l-blue-500 nes-container">
                  <div class="yorha-panel-content pt-4">
                    <div class="flex justify-between items-start gap-4">
                      <div class="flex-1 space-y-2">
                        <div class="flex items-center gap-2">
                          <h4 class="font-medium">{(result as { success?: any; details?: any; responseTime?: any; stats?: any; error?: any; results?: any; title?: any; document_id?: any; document_type?: any; distance?: any; content?: any; created_at?: any }).title || (result as { success?: any; details?: any; responseTime?: any; stats?: any; error?: any; results?: any; title?: any; document_id?: any; document_type?: any; distance?: any; content?: any; created_at?: any }).document_id}</h4>
                          <Badge>{(result as { success?: any; details?: any; responseTime?: any; stats?: any; error?: any; results?: any; title?: any; document_id?: any; document_type?: any; distance?: any; content?: any; created_at?: any }).document_type}</Badge>
                          <span class="text-sm nes-text is-disabled">
                            Distance: {formatDistance((result as { success?: any; details?: any; responseTime?: any; stats?: any; error?: any; results?: any; title?: any; document_id?: any; document_type?: any; distance?: any; content?: any; created_at?: any }).distance)}
                          </span>
                        </div>
                        {#if (result as { success?: any; details?: any; responseTime?: any; stats?: any; error?: any; results?: any; title?: any; document_id?: any; document_type?: any; distance?: any; content?: any; created_at?: any }).content}
                          <p class="text-sm nes-text is-disabled line-clamp-2">
                            {(result as { success?: any; details?: any; responseTime?: any; stats?: any; error?: any; results?: any; title?: any; document_id?: any; document_type?: any; distance?: any; content?: any; created_at?: any }).content.substring(0, 200)}...
                          </p>
                        {/if}
                        <div class="text-xs nes-text is-disabled">
                          Created: {new Date((result as { success?: any; details?: any; responseTime?: any; stats?: any; error?: any; results?: any; title?: any; document_id?: any; document_type?: any; distance?: any; content?: any; created_at?: any }).created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {:else if searchResults.length === 0 && performanceMetrics.vectorSearch}
            <Alert>
              <AlertDescription>
                No results found for query: "{testQuery}". Try seeding the database with sample documents first.
              </AlertDescription>
            </Alert>
          {/if}
        </div>
      </div>
    </TabsContent>
    <!-- Operations Tab -->
    <TabsContent value="operations" class="space-y-4">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- Document Insertion -->
        <div class="nes-container">
          <div class="yorha-panel-header">
            <h3 class="nes-text is-primary">Document Operations</h3>
            <p class="nes-text">
              Test document insertion with vector embeddings
            </p>
          </div>
          <div class="yorha-panel-content space-y-3">
            <Button onclick={testDocumentInsert} disabled={isLoading} class="w-full bits-btn bits-btn">
{isLoading ? 'Inserting...' : 'Test Document Insert'}
            <p class="text-sm nes-text is-disabled">
              Inserts a sample legal document with 1536-dimension mock embedding
            </p>
          </div>
        </div>
        <!-- Index Management -->
        <div class="nes-container">
          <div class="yorha-panel-header">
            <h3 class="nes-text is-primary">Index Management</h3>
            <p class="nes-text">
              Create and manage vector indexes for performance
            </p>
          </div>
          <div class="yorha-panel-content space-y-3">
            <div class="grid grid-cols-2 gap-2">
              <Button class="bits-btn" onclick={() =>
createIndex(50, 'cosine')} disabled={isLoading} size="sm">
                Cosine (50 lists)
              <Button class="bits-btn" onclick={() =>
createIndex(100, 'cosine')} disabled={isLoading} size="sm">
                Cosine (100 lists)
              <Button class="bits-btn" onclick={() =>
createIndex(100, 'euclidean')} disabled={isLoading} size="sm">
                Euclidean
              <Button class="bits-btn" onclick={() =>
createIndex(100, 'inner_product')} disabled={isLoading} size="sm">
                Inner Product
            </div>
            <p class="text-sm nes-text is-disabled">
              IVFFLAT indexes improve query performance for large datasets
            </p>
          </div>
        </div>
      </div>
    </TabsContent>
    <!-- Performance Tab -->
    <TabsContent value="performance" class="space-y-4">
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="nes-container">
          <div class="yorha-panel-header">
            <h3 class="nes-text is-primary text-lg">Connection Test</h3>
          </div>
          <div class="yorha-panel-content">
            <div class="text-2xl font-bold">
              {performanceMetrics.connectionTest || '-'}
            </div>
            <p class="text-sm nes-text is-disabled">Response time</p>
          </div>
        </div>
        <div class="nes-container">
          <div class="yorha-panel-header">
            <h3 class="nes-text is-primary text-lg">Vector Search</h3>
          </div>
          <div class="yorha-panel-content">
            <div class="text-2xl font-bold">
              {performanceMetrics.vectorSearch || '-'}
            </div>
            <p class="text-sm nes-text is-disabled">Query execution</p>
          </div>
        </div>
        <div class="nes-container">
          <div class="yorha-panel-header">
            <h3 class="nes-text is-primary text-lg">Document Insert</h3>
          </div>
          <div class="yorha-panel-content">
            <div class="text-2xl font-bold">
              {performanceMetrics.documentInsert || '-'}
            </div>
            <p class="text-sm nes-text is-disabled">Single document</p>
          </div>
        </div>
        <div class="nes-container">
          <div class="yorha-panel-header">
            <h3 class="nes-text is-primary text-lg">Index Creation</h3>
          </div>
          <div class="yorha-panel-content">
            <div class="text-2xl font-bold">
              {performanceMetrics.indexCreation || '-'}
            </div>
            <p class="text-sm nes-text is-disabled">IVFFLAT index</p>
          </div>
        </div>
      </div>
      <!-- Performance Guidelines -->
      <div class="nes-container">
        <div class="yorha-panel-header">
          <h3 class="nes-text is-primary">Performance Guidelines</h3>
          <p class="nes-text">
            Best practices for optimal pgvector performance
          </p>
        </div>
        <div class="yorha-panel-content space-y-3">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <h4 class="font-medium text-green-700">✅ Best Practices</h4>
              <ul class="mt-2 space-y-1 nes-text is-disabled">
                <li>• Use IVFFLAT indexes for >1000 vectors</li>
                <li>• Choose lists = sqrt(total_vectors)</li>
                <li>• Prefer cosine distance for normalized vectors</li>
                <li>• Batch insert for bulk operations</li>
                <li>• Run ANALYZE after bulk operations</li>
              </ul>
            </div>
            <div>
              <h4 class="font-medium text-blue-700">📊 Expected Performance</h4>
              <ul class="mt-2 space-y-1 nes-text is-disabled">
                <li>• Connection test: < 100ms</li>
                <li>• Vector search (10 results): < 200ms</li>
                <li>• Document insert: < 50ms</li>
                <li>• Index creation < 30s</li>
                <li>• Batch insert (100 docs): < 2s</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </TabsContent>
  </Tabs>
</div>
<style>
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>