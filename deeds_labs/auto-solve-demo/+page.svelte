<script lang="ts">
  import { onMount } from 'svelte';

  // State management with Svelte 5 runes
  let activeService = $state('overview');
  let isProcessing = $state(false);
  let processingLogs = $state<string[]>([]);
  let currentJobId = $state<string | null>(null);
  let jobProgress = $state({ stage: '', percentage: 0, completed: 0, total: 0 });
  let systemHealth = $state({
    ollama: false,
    gemma_embeddings: false,
    tensorrt: false,
    postgresql: false,
    redis: false,
    auto_fetcher: false
  });

  // Service results
  let fetchResults = $state<any[]>([]);
  let searchResults = $state<any[]>([]);
  let trainingData = $state<any[]>([]);
  let workflowStatus = $state<any>(null);

  // Demo configuration
  let demoConfig = $state({
    maxDocuments: 25,
    includeEmbeddings: true,
    storeResults: true,
    searchQuery: 'What are the essential elements of a valid contract under common law?',
    legalArea: 'contract-law',
    exportFormat: 'jsonl' as const,
    cornellEnabled: true,
    justiaEnabled: true
  });

  // Derived sources array based on checkbox states
  const sources = $derived(() => {
    const sourceList: string[] = [];
  if (demoConfig.cornellEnabled) sourceList.push('legal-info-institute');
  if (demoConfig.justiaEnabled) sourceList.push('justia-legal-resources');
    return sourceList;
  });

  const services = [
    { id: 'overview', name: '🎯 System Overview', icon: '📊' },
    { id: 'health', name: '🏥 Health Check', icon: '❤️' },
    { id: 'fetcher', name: '🕷️ Document Fetcher', icon: '📄' },
    { id: 'search', name: '🔍 Semantic Search', icon: '🧠' },
    { id: 'training', name: '🎓 QLoRA Export', icon: '📚' },
    { id: 'workflow', name: '🎭 Full Pipeline', icon: '⚡' }
  ];

  onMount(() => {
    addLog('Auto-Solve Demo System initialized');
    checkSystemHealth();
  });

  function addLog(message: string) {
    const timestamp = new Date().toLocaleTimeString();
    processingLogs = [...processingLogs, `[${timestamp}] ${message}`];
  }

  async function checkSystemHealth() {
    addLog('🔍 Checking system health...');

    try {
      // Check each service
      const healthChecks = [
        { service: 'ollama', url: 'http://localhost:11434/api/tags' },
        { service: 'tensorrt', url: 'http://localhost:8100/health' },
        { service: 'postgresql', url: '/api/documents/search?type=stats' },
        { service: 'redis', url: '/api/workflow/orchestrate?action=templates' }
      ];

      for (const check of healthChecks) {
        try {
          const response = await fetch(check.url);
          systemHealth[check.service] = response.ok;
          addLog(`✅ ${check.service.toUpperCase()} - ${response.ok ? 'Healthy' : 'Issues detected'}`);
        } catch (error) {
          systemHealth[check.service] = false;
          addLog(`❌ ${check.service.toUpperCase()} - Unavailable`);
        }
      }

      // Check Gemma models specifically
      try {
        const ollamaResponse = await fetch('http://localhost:11434/api/tags');
        if (ollamaResponse.ok) {
          const models = await ollamaResponse.json();
          const hasGemmaEmbeddings = models.models?.some((m: any) =>
            m.name.includes('embeddinggemma') || m.name.includes('gemma') && m.name.includes('embed')
          );
          systemHealth.gemma_embeddings = hasGemmaEmbeddings;
          addLog(`${hasGemmaEmbeddings ? '✅' : '❌'} Gemma Embeddings - ${hasGemmaEmbeddings ? 'Available' : 'Missing'}`);
        }
      } catch (error) {
        addLog('❌ Unable to check Gemma models');
      }

    } catch (error) {
      addLog(`❌ Health check failed: ${error.message}`);
    }
  }

  async function runDocumentFetcher() {
    if (isProcessing) return;

    isProcessing = true;
    addLog('🚀 Starting document fetching pipeline...');

    try {
      const response = await fetch('/api/documents/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sources: sources(),
          maxDocuments: demoConfig.maxDocuments,
          includeEmbeddings: demoConfig.includeEmbeddings,
          storeResults: demoConfig.storeResults,
          processingOptions: {
            extractEntities: true,
            calculateComplexity: true,
            generateTags: true
          }
        })
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const job = await response.json();
      currentJobId = job.jobId;
      addLog(`📋 Job started: ${job.jobId}`);

      // Poll for progress
      await pollJobProgress();

    } catch (error) {
      addLog(`❌ Document fetching failed: ${error.message}`);
    } finally {
      isProcessing = false;
    }
  }

  async function runSemanticSearch() {
    if (isProcessing) return;

    isProcessing = true;
    addLog('🔍 Performing semantic search...');

    try {
      const response = await fetch('/api/documents/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: demoConfig.searchQuery,
          context: {
            legal_area: demoConfig.legalArea,
            user_expertise_level: 'intermediate',
            search_intent: 'research'
          },
          options: {
            limit: 20,
            threshold: 0.7,
            includeContent: true,
            searchChunks: false
          },
          filters: {
            document_type: ['case-law', 'statute'],
            confidence_min: 0.7
          }
        })
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const results = await response.json();
      searchResults = results.results;

      addLog(`✅ Search completed: ${results.results.length} results found`);
      addLog(`⚡ Search time: ${results.metadata.search_time_ms}ms`);
      addLog(`🧠 Model used: ${results.metadata.model_used}`);
      addLog(`📊 Ranking strategy: ${results.metadata.ranking_strategy}`);

    } catch (error) {
      addLog(`❌ Semantic search failed: ${error.message}`);
    } finally {
      isProcessing = false;
    }
  }

  async function runQLoRAExport() {
    if (isProcessing) return;

    isProcessing = true;
    addLog('🎓 Exporting QLoRA training data...');

    try {
      const response = await fetch('/api/training/qlora', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format: demoConfig.exportFormat,
          filters: {
            document_types: ['case-law', 'statute'],
            practice_areas: ['contract-law', 'tort-law'],
            confidence_min: 0.8,
            limit: 100
          },
          training_config: {
            max_token_length: 2048,
            include_context: true,
            difficulty_levels: [3, 4, 5]
          }
        })
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const results = await response.json();
      trainingData = [results];

      addLog(`✅ QLoRA export completed: ${results.statistics.total_examples} examples`);
      addLog(`📏 Average tokens: ${results.statistics.avg_token_count}`);
      addLog(`💾 File size: ${results.statistics.file_size_mb}MB`);
      addLog(`📁 Format: ${results.format.toUpperCase()}`);

    } catch (error) {
      addLog(`❌ QLoRA export failed: ${error.message}`);
    } finally {
      isProcessing = false;
    }
  }

  async function runFullWorkflow() {
    if (isProcessing) return;

    isProcessing = true;
    addLog('🎭 Starting full pipeline workflow...');

    try {
      const response = await fetch('/api/workflow/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow_type: 'full_pipeline',
          parameters: {
            fetch_documents: {
              sources: sources(),
              maxDocuments: Math.min(demoConfig.maxDocuments, 20) // Limit for demo
            }
          },
          options: {
            error_handling: 'retry',
            notifications: true
          }
        })
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const workflow = await response.json();
      currentJobId = workflow.execution_id;
      addLog(`🎭 Workflow started: ${workflow.execution_id}`);

      // Poll for workflow progress
      await pollWorkflowProgress();

    } catch (error) {
      addLog(`❌ Full workflow failed: ${error.message}`);
    } finally {
      isProcessing = false;
    }
  }

  async function pollJobProgress() {
    if (!currentJobId) return;

    const maxPolls = 60; // 5 minutes max
    let pollCount = 0;

    while (pollCount < maxPolls) {
      try {
        const response = await fetch(`/api/documents/process?jobId=${currentJobId}`);
        if (!response.ok) break;

        const status = await response.json();
        jobProgress = status.progress;

        addLog(`📊 ${status.progress.stage}: ${status.progress.percentage}%`);

        if (status.status === 'completed') {
          addLog(`✅ Job completed successfully!`);
          if (status.results) {
            addLog(`📄 Documents processed: ${status.results.documents_processed}`);
            addLog(`🧠 Embeddings generated: ${status.results.embeddings_generated}`);
            addLog(`💾 Documents stored: ${status.results.documents_stored}`);
          }
          break;
        } else if (status.status === 'failed') {
          addLog(`❌ Job failed: ${status.error}`);
          break;
        }

        await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second intervals
        pollCount++;
      } catch (error) {
        addLog(`❌ Polling error: ${error.message}`);
        break;
      }
    }
  }

  async function pollWorkflowProgress() {
    if (!currentJobId) return;

    const maxPolls = 60; // 5 minutes max
    let pollCount = 0;

    while (pollCount < maxPolls) {
      try {
        const response = await fetch(`/api/workflow/orchestrate?executionId=${currentJobId}`);
        if (!response.ok) break;

        const status = await response.json();
        workflowStatus = status;
        jobProgress = status.progress;

        addLog(`🎭 Workflow: ${status.progress.stage} (${status.progress.percentage}%)`);

        if (status.status === 'completed') {
          addLog(`✅ Workflow completed successfully!`);
          break;
        } else if (status.status === 'failed') {
          addLog(`❌ Workflow failed: ${status.errors?.join(', ') || 'Unknown error'}`);
          break;
        }

        await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second intervals
        pollCount++;
      } catch (error) {
        addLog(`❌ Workflow polling error: ${error.message}`);
        break;
      }
    }
  }

  function clearLogs() {
    processingLogs = [];
  }
</script>

<svelte:head>
  <title>Auto-Solve Legal Document Processing System Demo</title>
  <meta name="description" content="Complete legal document processing pipeline with Playwright, Gemma embeddings, and QLoRA training" />
</svelte:head>

<div class="auto-solve-demo">
  <div class="demo-header">
    <div class="hero-section">
      <h1>🤖 Auto-Solve Legal Document Processing System</h1>
      <p class="hero-subtitle">
        Complete pipeline: Playwright Fetching → Gemma Embeddings → PostgreSQL Storage → QLoRA Training
      </p>
      <div class="hero-features">
        <span class="feature">🕷️ Playwright Web Scraping</span>
        <span class="feature">🧠 Gemma Embeddings</span>
        <span class="feature">⚡ TensorRT-LLM Optimization</span>
        <span class="feature">📊 PostgreSQL pgvector</span>
        <span class="feature">🎓 QLoRA Training Export</span>
      </div>
    </div>

    <!-- System Health Status -->
    <div class="health-panel">
      <h3>🏥 System Health</h3>
      <div class="health-grid">
        <div class="health-item" class:healthy={systemHealth.ollama}>
          <span class="health-icon">{systemHealth.ollama ? '✅' : '❌'}</span>
          <span>Ollama Server</span>
        </div>
        <div class="health-item" class:healthy={systemHealth.gemma_embeddings}>
          <span class="health-icon">{systemHealth.gemma_embeddings ? '✅' : '❌'}</span>
          <span>Gemma Embeddings</span>
        </div>
        <div class="health-item" class:healthy={systemHealth.tensorrt}>
          <span class="health-icon">{systemHealth.tensorrt ? '✅' : '❌'}</span>
          <span>TensorRT-LLM</span>
        </div>
        <div class="health-item" class:healthy={systemHealth.postgresql}>
          <span class="health-icon">{systemHealth.postgresql ? '✅' : '❌'}</span>
          <span>PostgreSQL</span>
        </div>
        <div class="health-item" class:healthy={systemHealth.redis}>
          <span class="health-icon">{systemHealth.redis ? '✅' : '❌'}</span>
          <span>Redis Cache</span>
        </div>
      </div>
      <button onclick={checkSystemHealth} class="btn btn-sm">🔄 Refresh</button>
    </div>
  </div>

  <div class="demo-content">
    <!-- Service Navigation -->
    <nav class="service-nav">
      {#each services as service}
        <button
          class="service-btn"
          class:active={activeService === service.id}
          onclick={() => activeService = service.id}
        >
          <span class="service-icon">{service.icon}</span>
          {service.name}
        </button>
      {/each}
    </nav>

    <!-- Service Panels -->
    <div class="service-content">
      {#if activeService === 'overview'}
        <div class="service-panel">
          <h2>🎯 Auto-Solve System Architecture</h2>
          <div class="architecture-diagram">
            <div class="pipeline-step">
              <div class="step-icon">🕷️</div>
              <div class="step-info">
                <h3>Document Fetcher</h3>
                <p>Playwright-based web scraping from legal sources (Cornell Law, Justia, FindLaw)</p>
                <ul>
                  <li>Rate limiting & concurrent processing</li>
                  <li>Legal domain classification</li>
                  <li>Automatic retry mechanisms</li>
                </ul>
              </div>
            </div>

            <div class="hidden lg:flex items-center justify-center text-2xl text-blue-500">➡️</div>

            <div class="pipeline-step">
              <div class="step-icon">🧠</div>
              <div class="step-info">
                <h3>Gemma Embeddings</h3>
                <p>768-dimensional embeddings with Ollama integration</p>
                <ul>
                  <li>Primary: embeddinggemma:latest</li>
                  <li>Fallback: embeddinggemma, nomic-embed-text</li>
                  <li>Batch processing with concurrency</li>
                </ul>
              </div>
            </div>

            <div class="hidden lg:flex items-center justify-center text-2xl text-blue-500">➡️</div>

            <div class="pipeline-step">
              <div class="step-icon">📊</div>
              <div class="step-info">
                <h3>PostgreSQL Storage</h3>
                <p>JSONB optimization with pgvector HNSW indexes</p>
                <ul>
                  <li>GIN indexes for metadata queries</li>
                  <li>Vector similarity search</li>
                  <li>Multi-factor RAG ranking</li>
                </ul>
              </div>
            </div>

            <div class="hidden lg:flex items-center justify-center text-2xl text-blue-500">➡️</div>

            <div class="pipeline-step">
              <div class="step-icon">🎓</div>
              <div class="step-info">
                <h3>QLoRA Training</h3>
                <p>Export in multiple formats for fine-tuning</p>
                <ul>
                  <li>JSONL, JSON, HuggingFace formats</li>
                  <li>Legal domain instruction templates</li>
                  <li>Token optimization</li>
                </ul>
              </div>
            </div>
          </div>

          <Separator class="my-6" />

          <Card.Root class="bg-gray-50">
            <Card.Header>
              <Card.Title class="flex items-center gap-2">
                🛠️ Technology Stack
              </Card.Title>
            </Card.Header>
            <Card.Content>
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                <Badge variant="outline" class="p-3 justify-start">
                  <strong class="mr-2">Frontend:</strong> SvelteKit 2 + TypeScript
                </Badge>
                <Badge variant="outline" class="p-3 justify-start">
                  <strong class="mr-2">Database:</strong> PostgreSQL 17 + pgvector
                </Badge>
                <Badge variant="outline" class="p-3 justify-start">
                  <strong class="mr-2">Scraping:</strong> Playwright + Chromium
                </Badge>
                <Badge variant="outline" class="p-3 justify-start">
                  <strong class="mr-2">AI:</strong> Ollama + Gemma models
                </Badge>
                <Badge variant="outline" class="p-3 justify-start">
                  <strong class="mr-2">Optimization:</strong> TensorRT-LLM
                </Badge>
                <Badge variant="outline" class="p-3 justify-start">
                  <strong class="mr-2">Cache:</strong> Redis
                </Badge>
              </div>
            </Card.Content>
          </Card.Root>
        </div>

      <Tabs.Content value="health" class="p-6">
        <div class="space-y-6">
          <h2 class="text-2xl font-bold text-gray-900 mb-6">🏥 System Health & Diagnostics</h2>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card.Root>
              <Card.Header>
                <Card.Title class="flex items-center gap-2">
                  🤖 Ollama Server Status
                </Card.Title>
              </Card.Header>
              <Card.Content class="space-y-3">
                <Badge variant={systemHealth.ollama ? 'default' : 'destructive'} class="w-fit">
                  {systemHealth.ollama ? '✅ Online' : '❌ Offline'}
                </Badge>
                <p class="text-sm text-gray-600">Hosts Gemma embedding and inference models</p>
                <code class="bg-gray-100 px-2 py-1 rounded text-sm">http://localhost:11434</code>
              </Card.Content>
            </Card.Root>

            <Card.Root>
              <Card.Header>
                <Card.Title class="flex items-center gap-2">
                  ⚡ TensorRT-LLM Engine
                </Card.Title>
              </Card.Header>
              <Card.Content class="space-y-3">
                <Badge variant={systemHealth.tensorrt ? 'default' : 'destructive'} class="w-fit">
                  {systemHealth.tensorrt ? '✅ Optimized' : '❌ Unavailable'}
                </Badge>
                <p class="text-sm text-gray-600">High-performance LLM inference with NVIDIA acceleration</p>
                <code class="bg-gray-100 px-2 py-1 rounded text-sm">http://localhost:8100</code>
              </Card.Content>
            </Card.Root>

            <Card.Root>
              <Card.Header>
                <Card.Title class="flex items-center gap-2">
                  📊 PostgreSQL + pgvector
                </Card.Title>
              </Card.Header>
              <Card.Content class="space-y-3">
                <Badge variant={systemHealth.postgresql ? 'default' : 'destructive'} class="w-fit">
                  {systemHealth.postgresql ? '✅ Connected' : '❌ Connection Failed'}
                </Badge>
                <p class="text-sm text-gray-600">Vector database with JSONB optimization</p>
                <code class="bg-gray-100 px-2 py-1 rounded text-sm">postgresql://localhost:5432/legal_ai_db</code>
              </Card.Content>
            </Card.Root>

            <Card.Root>
              <Card.Header>
                <Card.Title class="flex items-center gap-2">
                  🧠 Gemma Embeddings
                </Card.Title>
              </Card.Header>
              <Card.Content class="space-y-3">
                <Badge variant={systemHealth.gemma_embeddings ? 'default' : 'destructive'} class="w-fit">
                  {systemHealth.gemma_embeddings ? '✅ Available' : '❌ Missing Models'}
                </Badge>
                <p class="text-sm text-gray-600">Primary: embeddinggemma:latest</p>
                <p class="text-xs text-gray-500">Fallbacks: embeddinggemma, nomic-embed-text</p>
              </Card.Content>
            </Card.Root>
          </div>

          <Card.Root class="bg-gray-50">
            <Card.Header>
              <Card.Title class="flex items-center gap-2">
                📈 Expected Performance
              </Card.Title>
            </Card.Header>
            <Card.Content>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="flex justify-between items-center p-3 bg-white rounded border">
                  <span class="font-medium text-gray-700">Document Processing:</span>
                  <Badge variant="secondary">2-5 docs/second</Badge>
                </div>
                <div class="flex justify-between items-center p-3 bg-white rounded border">
                  <span class="font-medium text-gray-700">Semantic Search:</span>
                  <Badge variant="secondary">&lt;500ms queries</Badge>
                </div>
                <div class="flex justify-between items-center p-3 bg-white rounded border">
                  <span class="font-medium text-gray-700">Embedding Dimensions:</span>
                  <Badge variant="secondary">768 (Gemma)</Badge>
                </div>
                <div class="flex justify-between items-center p-3 bg-white rounded border">
                  <span class="font-medium text-gray-700">Vector Storage:</span>
                  <Badge variant="secondary">PostgreSQL HNSW</Badge>
                </div>
              </div>
            </Card.Content>
          </Card.Root>
        </div>

      <Tabs.Content value="fetcher" class="p-6">
        <div class="space-y-6">
          <h2 class="text-2xl font-bold text-gray-900 mb-6">🕷️ Document Fetcher Demo</h2>

          <Card.Root class="bg-gray-50">
            <Card.Header>
              <Card.Title>Configuration</Card.Title>
            </Card.Header>
            <Card.Content class="space-y-4">
              <div class="space-y-2">
                <Label for="maxDocs">Max Documents:</Label>
                <Input id="maxDocs" type="number" bind:value={demoConfig.maxDocuments} min="1" max="100" class="w-32" />
              </div>

              <div class="space-y-3">
                <Label>Sources:</Label>
                <div class="space-y-2">
                  <div class="flex items-center space-x-2">
                    <Checkbox id="cornell" bind:checked={demoConfig.cornellEnabled} />
                    <Label for="cornell" class="text-sm font-normal">Cornell Law Institute</Label>
                  </div>
                  <div class="flex items-center space-x-2">
                    <Checkbox id="justia" bind:checked={demoConfig.justiaEnabled} />
                    <Label for="justia" class="text-sm font-normal">Justia Legal Resources</Label>
                  </div>
                </div>
              </div>

              <div class="space-y-3">
                <div class="flex items-center space-x-2">
                  <Checkbox id="embeddings" bind:checked={demoConfig.includeEmbeddings} />
                  <Label for="embeddings" class="text-sm font-normal">Generate Embeddings</Label>
                </div>
                <div class="flex items-center space-x-2">
                  <Checkbox id="store" bind:checked={demoConfig.storeResults} />
                  <Label for="store" class="text-sm font-normal">Store in Database</Label>
                </div>
              </div>

              <Button onclick={runDocumentFetcher} disabled={isProcessing} class="w-full">
                {#if isProcessing}
                  🔄 Processing...
                {:else}
                  🚀 Start Document Fetching
                {/if}
              </Button>
            </Card.Content>
          </Card.Root>

          {#if jobProgress.percentage > 0}
            <Card.Root>
              <Card.Header>
                <Card.Title class="text-lg">Processing Progress</Card.Title>
              </Card.Header>
              <Card.Content class="space-y-3">
                <Progress value={jobProgress.percentage} class="w-full" />
                <p class="text-sm text-gray-600">{jobProgress.stage}: {jobProgress.completed}/{jobProgress.total} ({jobProgress.percentage}%)</p>
              </Card.Content>
            </Card.Root>
          {/if}
        </div>

      <Tabs.Content value="search" class="p-6">
        <div class="space-y-6">
          <h2 class="text-2xl font-bold text-gray-900 mb-6">🔍 Semantic Search Demo</h2>

          <Card.Root class="bg-gray-50">
            <Card.Header>
              <Card.Title>Search Configuration</Card.Title>
            </Card.Header>
            <Card.Content class="space-y-4">
              <div class="space-y-2">
                <Label for="searchQuery">Search Query:</Label>
                <Textarea id="searchQuery" bind:value={demoConfig.searchQuery} rows="3" placeholder="Enter your legal question..." />
              </div>

              <div class="space-y-2">
                <Label for="legalArea">Legal Area:</Label>
                <Select bind:value={demoConfig.legalArea}>
                  <SelectTrigger class="w-full">
                    <SelectValue placeholder="Select legal area" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contract-law">Contract Law</SelectItem>
                    <SelectItem value="tort-law">Tort Law</SelectItem>
                    <SelectItem value="constitutional-law">Constitutional Law</SelectItem>
                    <SelectItem value="criminal-law">Criminal Law</SelectItem>
                    <SelectItem value="business-law">Business Law</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button onclick={runSemanticSearch} disabled={isProcessing} class="w-full">
                {#if isProcessing}
                  🔄 Searching...
                {:else}
                  🔍 Semantic Search
                {/if}
              </Button>
            </Card.Content>
          </Card.Root>

          {#if searchResults.length > 0}
            <div class="space-y-4">
              <h3 class="text-xl font-semibold text-gray-900">🎯 Search Results ({searchResults.length})</h3>
              <ScrollArea class="h-96 w-full border rounded-md">
                <div class="p-4 space-y-4">
                  {#each searchResults.slice(0, 5) as result}
                    <Card.Root class="hover:shadow-md transition-shadow">
                      <Card.Header>
                        <div class="flex justify-between items-start">
                          <Card.Title class="text-lg">{result.title}</Card.Title>
                          <div class="flex gap-2">
                            <Badge variant="outline">Similarity: {(result.similarity_score * 100).toFixed(1)}%</Badge>
                            <Badge>Final: {(result.final_score * 100).toFixed(1)}%</Badge>
                          </div>
                        </div>
                      </Card.Header>
                      <Card.Content class="space-y-3">
                        <p class="text-gray-600 leading-relaxed">{result.snippet}</p>
                        <div class="flex flex-wrap gap-2">
                          <Badge variant="secondary" class="text-xs">{result.metadata.legal_area}</Badge>
                          <Badge variant="secondary" class="text-xs">{result.metadata.document_type}</Badge>
                          <Badge variant="outline" class="text-xs">Confidence: {result.confidence_level.toFixed(2)}</Badge>
                        </div>
                        <div class="text-sm text-gray-500 italic border-l-2 border-gray-200 pl-3">
                          {result.ranking_explanation}
                        </div>
                      </Card.Content>
                    </Card.Root>
                  {/each}
                </div>
              </ScrollArea>
            </div>
          {/if}
        </div>

      <Tabs.Content value="training" class="p-6">
        <div class="space-y-6">
          <h2 class="text-2xl font-bold text-gray-900 mb-6">🎓 QLoRA Training Data Export</h2>

          <Card.Root class="bg-gray-50">
            <Card.Header>
              <Card.Title>Export Configuration</Card.Title>
            </Card.Header>
            <Card.Content class="space-y-4">
              <div class="space-y-2">
                <Label for="exportFormat">Export Format:</Label>
                <Select bind:value={demoConfig.exportFormat}>
                  <SelectTrigger class="w-full">
                    <SelectValue placeholder="Select export format" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="jsonl">JSONL (Standard)</SelectItem>
                    <SelectItem value="json">JSON</SelectItem>
                    <SelectItem value="huggingface">HuggingFace</SelectItem>
                    <SelectItem value="alpaca">Alpaca</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button onclick={runQLoRAExport} disabled={isProcessing} class="w-full">
                {#if isProcessing}
                  🔄 Exporting...
                {:else}
                  📚 Export Training Data
                {/if}
              </Button>
            </Card.Content>
          </Card.Root>

          {#if trainingData.length > 0}
            <div class="space-y-4">
              <h3 class="text-xl font-semibold text-gray-900">📊 Export Results</h3>
              {#each trainingData as result}
                <Card.Root>
                  <Card.Header>
                    <Card.Title>Export Statistics</Card.Title>
                  </Card.Header>
                  <Card.Content class="space-y-4">
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div class="text-center p-3 bg-gray-50 rounded">
                        <div class="text-2xl font-bold text-blue-600">{result.statistics.total_examples}</div>
                        <div class="text-sm text-gray-600">Total Examples</div>
                      </div>
                      <div class="text-center p-3 bg-gray-50 rounded">
                        <div class="text-2xl font-bold text-green-600">{result.statistics.avg_token_count}</div>
                        <div class="text-sm text-gray-600">Average Tokens</div>
                      </div>
                      <div class="text-center p-3 bg-gray-50 rounded">
                        <div class="text-2xl font-bold text-purple-600">{result.statistics.file_size_mb}MB</div>
                        <div class="text-sm text-gray-600">File Size</div>
                      </div>
                      <div class="text-center p-3 bg-gray-50 rounded">
                        <div class="text-2xl font-bold text-orange-600">{result.format.toUpperCase()}</div>
                        <div class="text-sm text-gray-600">Format</div>
                      </div>
                    </div>

                    <Separator />

                    <div>
                      <h4 class="text-lg font-semibold mb-3 flex items-center gap-2">📋 Legal Area Distribution</h4>
                      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                        {#each Object.entries(result.statistics.by_legal_area) as [area, count]}
                          <div class="flex justify-between items-center p-2 bg-gray-50 rounded border">
                            <span class="text-sm font-medium">{area}</span>
                            <Badge variant="outline">{count}</Badge>
                          </div>
                        {/each}
                      </div>
                    </div>
                  </Card.Content>
                </Card.Root>
              {/each}
            </div>
          {/if}
        </div>

      <Tabs.Content value="workflow" class="p-6">
        <div class="space-y-6">
          <h2 class="text-2xl font-bold text-gray-900 mb-6">🎭 Full Pipeline Orchestration</h2>

          <Card.Root class="bg-gray-50">
            <Card.Header>
              <Card.Title>Complete Processing Pipeline</Card.Title>
              <Card.Description>
                This runs the complete pipeline: Fetch → Process → Vectorize → Store → Index
              </Card.Description>
            </Card.Header>
            <Card.Content>
              <Button onclick={runFullWorkflow} disabled={isProcessing} class="w-full">
                {#if isProcessing}
                  🔄 Running Pipeline...
                {:else}
                  🎭 Run Full Workflow
                {/if}
              </Button>
            </Card.Content>
          </Card.Root>

          {#if workflowStatus}
            <Card.Root>
              <Card.Header>
                <Card.Title class="flex items-center gap-2">
                  🎯 Workflow Status:
                  <Badge variant={workflowStatus.status === 'completed' ? 'default' : workflowStatus.status === 'failed' ? 'destructive' : 'secondary'}>
                    {workflowStatus.status}
                  </Badge>
                </Card.Title>
              </Card.Header>
              <Card.Content>
                {#if jobProgress.percentage > 0}
                  <div class="space-y-3">
                    <Progress value={jobProgress.percentage} class="w-full" />
                    <p class="text-sm text-gray-600">{jobProgress.stage}: {jobProgress.percentage}%</p>
                  </div>
                {/if}
              </Card.Content>
            </Card.Root>
          {/if}
        </div>
      </Tabs.Content>
    </Tabs.Root>
    </div>

  <Card.Root class="bg-gray-50 border-t">
    <Card.Header>
      <div class="flex justify-between items-center">
        <Card.Title class="flex items-center gap-2">
          📝 Processing Log
        </Card.Title>
        <Button onclick={clearLogs} size="sm" variant="outline">
          🧼 Clear
        </Button>
      </div>
    </Card.Header>
    <Card.Content>
      <ScrollArea class="h-48 w-full border rounded">
        <div class="bg-gray-900 p-4 font-mono text-sm space-y-1">
          {#each processingLogs as log}
            <div class="text-green-400">{log}</div>
          {/each}
          {#if processingLogs.length === 0}
            <div class="text-gray-500 italic">Ready to process...</div>
          {/if}
        </div>
      </ScrollArea>
    </Card.Content>
  </Card.Root>
  </Card.Root>
</div>

<style>
  /* Custom styles preserved for your UI library */
  .auto-solve-demo {
    min-height: 100vh;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    padding: 2rem;
  }

  .demo-header {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 2rem;
    margin-bottom: 2rem;
    align-items: start;
  }

  .hero-section {
    color: white;
  }

  .hero-section h1 {
    font-size: 2.5rem;
    font-weight: 700;
    margin: 0 0 1rem 0;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
  }

  .hero-subtitle {
    font-size: 1.2rem;
    margin: 0 0 1.5rem 0;
    opacity: 0.95;
    line-height: 1.4;
  }

  .hero-features {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .feature {
    background: rgba(255, 255, 255, 0.15);
    padding: 0.5rem 1rem;
    border-radius: 20px;
    font-size: 0.85rem;
    font-weight: 500;
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .health-panel {
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(10px);
    border-radius: 12px;
    padding: 1.5rem;
    color: white;
    border: 1px solid rgba(255, 255, 255, 0.2);
    min-width: 320px;
  }

  .health-panel h3 {
    margin: 0 0 1rem 0;
    font-size: 1.1rem;
  }

  .health-grid {
    display: grid;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .health-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
    opacity: 0.8;
  }

  .health-item.healthy {
    opacity: 1;
  }

  .demo-content {
    background: white;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
    display: grid;
    grid-template-rows: auto 1fr auto;
    min-height: 600px;
  }

  .service-nav {
    display: flex;
    background: #f8fafc;
    border-bottom: 1px solid #e2e8f0;
    overflow-x: auto;
  }

  .service-btn {
    background: none;
    border: none;
    padding: 1rem 1.5rem;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 500;
    color: #64748b;
    border-bottom: 3px solid transparent;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    white-space: nowrap;
  }

  .service-btn:hover {
    color: #3b82f6;
    background: rgba(59, 130, 246, 0.05);
  }

  .service-btn.active {
    color: #3b82f6;
    border-bottom-color: #3b82f6;
    background: white;
  }

  .service-content {
    padding: 2rem;
    overflow-y: auto;
  }

  .service-panel h2 {
    margin: 0 0 1.5rem 0;
    color: #1e293b;
  }

  /* Architecture Diagram Styles */
  .architecture-diagram {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 2rem;
    overflow-x: auto;
    padding: 1rem 0;
  }

  .pipeline-step {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 200px;
    text-align: center;
  }

  .step-icon {
    font-size: 2rem;
    margin-bottom: 0.5rem;
  }

  .step-info h3 {
    margin: 0 0 0.5rem 0;
    color: #1e293b;
    font-size: 1rem;
  }

  .step-info p {
    font-size: 0.85rem;
    color: #64748b;
    margin: 0 0 0.5rem 0;
    line-height: 1.3;
  }

  .step-info ul {
    font-size: 0.75rem;
    color: #6b7280;
    text-align: left;
    padding-left: 1rem;
    margin: 0;
  }

  .pipeline-arrow {
    font-size: 1.5rem;
    color: #3b82f6;
  }

  /* Tech Stack */
  .tech-stack {
    background: #f8fafc;
    border-radius: 8px;
    padding: 1.5rem;
  }

  .tech-stack h3 {
    margin: 0 0 1rem 0;
  }

  .tech-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 0.75rem;
  }

  .tech-item {
    background: white;
    padding: 0.75rem;
    border-radius: 6px;
    font-size: 0.85rem;
  }

  /* Diagnostic Cards */
  .diagnostics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 1rem;
    margin-bottom: 2rem;
  }

  .diagnostic-card {
    background: #f8fafc;
    border-radius: 8px;
    padding: 1.5rem;
    border: 1px solid #e2e8f0;
  }

  .diagnostic-card h3 {
    margin: 0 0 1rem 0;
    font-size: 1rem;
  }

  .status-indicator {
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-weight: 500;
    margin-bottom: 1rem;
    background: #fecaca;
    color: #dc2626;
  }

  .status-indicator.healthy {
    background: #dcfce7;
    color: #166534;
  }

  .performance-metrics {
    background: #f8fafc;
    border-radius: 8px;
    padding: 1.5rem;
  }

  .metrics-list {
    display: grid;
    gap: 0.75rem;
  }

  .metric {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    background: white;
    border-radius: 6px;
    font-size: 0.9rem;
  }

  .metric-label {
    font-weight: 500;
    color: #4b5563;
  }

  .metric-value {
    font-weight: 600;
    color: #1f2937;
  }

  /* Demo Controls */
  .demo-controls, .search-controls, .export-controls, .workflow-controls {
    background: #f8fafc;
    border-radius: 8px;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
  }

  .config-section h3 {
    margin: 0 0 1rem 0;
  }

  .form-group {
    margin-bottom: 1rem;
  }

  .form-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
    color: #374151;
  }

  .form-group input, .form-group select, .form-group textarea {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    font-size: 0.9rem;
  }

  .checkbox-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .checkbox-group label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0;
  }

  .checkbox-group input[type="checkbox"] {
    width: auto;
  }

  /* Progress Bar */
  .progress-section {
    margin: 1rem 0;
  }

  .progress-bar {
    width: 100%;
    height: 8px;
    background: #e5e7eb;
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 0.5rem;
  }

  .progress-fill {
    height: 100%;
    background: #3b82f6;
    transition: width 0.3s ease;
  }

  /* Results */
  .search-results {
    margin-top: 1.5rem;
  }

  .result-card {
    background: #f8fafc;
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1rem;
    border: 1px solid #e2e8f0;
  }

  .result-header {
    display: flex;
    justify-content: space-between;
    align-items: start;
    margin-bottom: 0.5rem;
  }

  .result-header h4 {
    margin: 0;
    color: #1e293b;
    font-size: 1rem;
  }

  .result-scores {
    display: flex;
    gap: 0.5rem;
    font-size: 0.8rem;
  }

  .similarity-score, .final-score {
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    background: #dbeafe;
    color: #1e40af;
  }

  .result-snippet {
    color: #4b5563;
    font-size: 0.9rem;
    line-height: 1.4;
    margin-bottom: 0.75rem;
  }

  .result-metadata {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
    flex-wrap: wrap;
  }

  .legal-area, .doc-type, .confidence {
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
    background: #f3f4f6;
    color: #374151;
  }

  .result-explanation {
    font-style: italic;
    color: #6b7280;
  }

  /* Export Results */
  .export-card {
    background: #f8fafc;
    border-radius: 8px;
    padding: 1.5rem;
    border: 1px solid #e2e8f0;
  }

  .export-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .stat {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .stat-label {
    font-size: 0.8rem;
    color: #6b7280;
  }

  .stat-value {
    font-weight: 600;
    color: #1f2937;
  }

  .breakdown-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 0.5rem;
  }

  .breakdown-item {
    display: flex;
    justify-content: space-between;
    padding: 0.5rem;
    background: white;
    border-radius: 4px;
    font-size: 0.85rem;
  }

  /* Buttons */
  .btn {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 8px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 0.9rem;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    background: #3b82f6;
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: #2563eb;
  }

  .btn-sm {
    padding: 0.5rem 1rem;
    font-size: 0.8rem;
  }

  /* Log Panel */
  .log-panel {
    background: #f8fafc;
    border-top: 1px solid #e2e8f0;
    padding: 1.5rem;
  }

  .log-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .log-header h3 {
    margin: 0;
  }

  .log-container {
    height: 200px;
    overflow-y: auto;
    background: #1f2937;
    border-radius: 6px;
    padding: 1rem;
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 0.8rem;
    line-height: 1.4;
  }

  .log-entry {
    color: #d1d5db;
    margin-bottom: 0.25rem;
  }

  .log-empty {
    color: #6b7280;
    font-style: italic;
  }

  @media (max-width: 1024px) {
    .demo-header {
      grid-template-columns: 1fr;
    }

    .health-panel {
      min-width: auto;
    }

    .architecture-diagram {
      flex-direction: column;
    }

    .pipeline-arrow {
      transform: rotate(90deg);
    }

    .diagnostics-grid {
      grid-template-columns: 1fr;
    }

    .service-nav {
      overflow-x: auto;
    }

    .hero-features {
      flex-direction: column;
      align-items: start;
    }
  }

  /* Hybrid: Keep UI components but preserve your custom styling where they coexist */
  .container {
    @apply mx-auto px-6;
  }
</style>


