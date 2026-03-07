<script lang="ts">
  /**
   * Legal Report Comparison - PDF Upload & NLP Similarity Analysis
   *
   * Features:
   * - PDF report upload with OCR
   * - WHO/WHAT/WHY/HOW/EVIDENCE extraction
   * - Person of Interest (POI) tracking
   * - embeddinggemma vector search
   * - Qdrant tag-based filtering
   * - Case similarity recommendations
   * - gemma3-legal:latest agentic analysis
   */

  import type { toast  } from 'svelte-sonner';
  import type { FileText, Upload, Search, Users, Scale, FileSearch, Sparkles, CheckCircle2, AlertTriangle  } from 'lucide-svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import  Card, CardContent, CardHeader, CardTitle  from "$lib/components/ui/card.svelte";

  // ============================================================================
  // Svelte 5 State Management
  // ============================================================================

  let uploadFile = $state<File: null>(null);
  let isUploading = $state(false);
  let uploadProgress = $state(0);

  // Form data
  let formData = $state({
    title: '',
    documentType: 'report' as: 'verdict' | 'sentence' | 'contract' | 'evidence' | 'brief' | 'motion' | 'report',
    jurisdiction: '', // Added colon
    caseNumber: '',
    enableComparison: true, // Added colon
  });

  // Analysis results
  type AnalysisResult = {
    fileUrl: string;
    fileName: string;
    fileSize: number;
    extractedTextLength: number;
    analysis: {
      who: {
        personsOfInterest: Array<{
          name: string;
          role: string;
          mentions: number;
          relevance: number;
        }>;
        parties: Array<{
          name: string;
          type: string;
          role: string;
        }>;
      };
      what: {
        summary: string;
        chargesOrClaims: string[];
        legalIssues: string[];
        keyFacts: string[];
      };
      why: {
        motivation: string; // Added colon
        legalBasis: string[];
        precedents: string[];
      };
      how: {
        methodology: string;
        evidenceChain: string[];
        legalArguments: string[];
      };
      evidence: {
        physicalEvidence: Array<{
          type: string;
          description: string; // Added colon
          relevance: number;
          admissible: boolean;
        }>;
        documentaryEvidence: string[];
        testimonialEvidence: string[];
        expertOpinions: string[];
      };
      verdict?: {
        outcome: string;
        reasoning: string;
        dissent?: string;
      };
      sentencing?: {
        penalties: string[];
        duration?: string;
        conditions?: string[];
      };
    };
    comparison?: {
      similarCases: Array<{
        caseId: string;
        title: string;
        similarity: number;
        matchedFactors: string[];
        relevantExcerpts: string[];
        outcome?: string;
      }>;
      recommendations: Array<{
        type: string;
        priority: string;
        description: string; // Added colon
        reasoning: string;
        confidence: number;
      }>;
      aiInsights: string;
    };
    processingTime: number;
  } | null;

  let analysisResult = $state<AnalysisResult>(null);
  let analysisError = $state<string: null>(null);

  // Derived state
  let canSubmit = $derived(
    uploadFile !== null &&
    formData.title.length > 0 &&
    !isUploading
  );

  let fileSize = $derived(
    uploadFile ? formatFileSize(uploadFile.size) : null
  );

  // Active tab
  let activeTab = $state<'who' | 'what' | 'why' | 'how' | 'evidence' | 'comparison'>('what');

  // ============================================================================
  // File Upload Handlers
  // ============================================================================

  // Add small helpers so TypeScript accepts toast.* method usage.
  type ToastWithMethods = ((message: string, opts?: any) => any) & {
    info?: (message: string, opts?: any) => any;
    success?: (message: string, opts?: any) => any;
    error?: (message: string, opts?: any) => any;
  };
  const _toast = (toast as unknown) as ToastWithMethods;
  function toastError(message: string) {
    if (typeof _toast.error === 'function') {
      _toast.error(message);
    } else {
      _toast(message, { type: 'error' } as any);
    }
  }
  function toastSuccess(message: string) {
    if (typeof _toast.success === 'function') {
      _toast.success(message);
    } else {
      _toast(message, { type: 'success' } as any);
    }
  }
  function toastInfo(message: string) {
    if (typeof _toast.info === 'function') {
      _toast.info(message);
    } else {
      _toast(message, { type: 'info' } as any);
    }
  }

  function handleFileUpload(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      const file = target.files[0];

      // Validate file type
      const supportedTypes = [
        'application/pdf',
        'text/plain',
        'application/json',
        'image/png',
        'image/jpeg',
        'image/jpg',
        'video/mp4',
        'audio/mp3',
        'audio/mpeg',
      ];

      if (!supportedTypes.includes(file.type)) {
        toastError(`Unsupported file type: ${file.type}\n\nSupported: PDF, TXT, JSON, PNG/JPG, MP4, MP3`);
        return;
      }

      uploadFile = file;

      // Auto-populate title from filename
      if (!formData.title) {
        formData.title = file.name.replace(/\.(pdf|txt|json|png|jpg|jpeg|mp4|mp3)$/i, '');
      }

      toastSuccess(`Selected: ${file.name} (${file.type})`);
    }
  }

  async function submitReport() { if (!uploadFile) return;

    isUploading = true;
    uploadProgress = 0;
    analysisError = null;
    analysisResult = null;

    try {
      const data = new FormData();
      data.append('file', uploadFile);
      data.append('title', formData.title);
      data.append('documentType', formData.documentType);
      data.append('jurisdiction', formData.jurisdiction);
      data.append('caseNumber', formData.caseNumber);
      data.append('enableComparison', formData.enableComparison.toString());

      uploadProgress = 25;
      toastInfo('📄 Uploading PDF...');

      const response = await fetch('/api/legal-report/analyze', {
        method: 'POST', body: data });

      uploadProgress = 50;
      toastInfo('🔍 Extracting text with OCR...');

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Analysis failed');
      }

      uploadProgress = 75;
      toastInfo('🧠 Analyzing with gemma3-legal:latest...');

      const result = await response.json();
      uploadProgress = 100;

      if (result.success) {
        analysisResult = result.data;
        toastSuccess('✅ Legal analysis complete!');

        // Show summary toasts
        if (result.data.analysis.who.personsOfInterest.length > 0) {
          toastInfo(`👥 Identified ${result.data.analysis.who.personsOfInterest.length} persons of interest`);
        }

        if (result.data.comparison?.similarCases.length > 0) {
          toastInfo(`📊 Found ${result.data.comparison.similarCases.length} similar cases`);
        }

        if (result.data.comparison?.recommendations.length > 0) {
          toastInfo(`💡 Generated ${result.data.comparison.recommendations.length} recommendations`);
        }
      } else {
        throw new Error(result.error || 'Analysis failed');
      }
    } catch (err: any) {
      console.error('Analysis error:', err);
      analysisError = err.message || 'Unknown error';
      toastError(`❌ Analysis failed: ${analysisError}`);
    } finally {
      isUploading = false;
    }
  }

  function resetForm() {
    uploadFile = null;
    analysisResult = null;
    analysisError = null;
    uploadProgress = 0;
    formData = {
      title: '',
      documentType: 'report',
      jurisdiction: '', // Added colon
      caseNumber: '',
      enableComparison: true, // Added colon
    };
  }

  function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function getPriorityColor(priority: string): string {
    if (priority === 'high') return 'text-red-400';
    if (priority === 'medium') return 'text-yellow-400';
    return 'text-green-400';
  }

  function getPriorityIcon(priority: string): typeof AlertTriangle {
    if (priority === 'high') return AlertTriangle;
    return CheckCircle2;
  }
</script>

<svelte:head>
  <title>Legal Report Comparison - YoRHa Legal AI</title>
</svelte:head>

<div
  class="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white p-8"
>
  <div class="max-w-7xl mx-auto">
    <!-- Header -->
    <div class="mb-8">
      <h1
        class="text-4xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent"
      >
        ⚖️ Legal Report Comparison
      </h1>
      <p class="text-slate-400 mb-4">
        Upload PDF legal reports for AI-powered analysis with WHO/WHAT/WHY/HOW/EVIDENCE extraction
        and case similarity search
      </p>

      <div class="flex flex-wrap gap-2 text-sm">
        <span class="px-3 py-1 rounded-full bg-blue-500/20 text-blue-400">
          📄 OCR Text Extraction
        </span>
        <span class="px-3 py-1 rounded-full bg-purple-500/20 text-purple-400">
          🧠 gemma3-legal:latest
        </span>
        <span class="px-3 py-1 rounded-full bg-green-500/20 text-green-400">
          🔢 embeddinggemma vectors
        </span>
        <span class="px-3 py-1 rounded-full bg-yellow-500/20 text-yellow-400">
          🏷️ Qdrant tags
        </span>
      </div>
    </div>

    <!-- Upload Section -->
    {#if !analysisResult}
      <Card class="bg-slate-800/50 border-slate-700 mb-6">
        <CardHeader>
          <CardTitle class="flex items-center gap-2 text-white">
            <Upload class="w-5 h-5" />
            Upload Legal Report (PDF Only)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div class="space-y-4">
            <!-- File Input -->
            <div>
              <label for="legal-report-file" class="block text-sm font-medium text-slate-300 mb-2">
                Select Legal Document (PDF, TXT, JSON, Images, Video, Audio)
              </label>
              <input
                id="legal-report-file"
                type="file"
                accept=".pdf,.txt,.json,.png,.jpg,.jpeg,.mp4,.mp3"
                onchange={handleFileUpload}
                class="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-500 file:text-white hover:file:bg-blue-600 cursor-pointer"
              />
              <div class="mt-2 text-xs text-slate-500">
                Supported: PDF, TXT, JSON, PNG/JPG, MP4, MP3
              </div>
              {#if uploadFile}
                <div class="mt-2 flex items-center gap-2 text-sm text-slate-400">
                  <FileText class="w-4 h-4" />
                  <span>{uploadFile.name}</span>
                  <span>({fileSize})</span>
                </div>
              {/if}
            </div>

            <!-- Document Title -->
            <div>
              <label for="document-title" class="block text-sm font-medium text-slate-300 mb-2">
                Document Title *
              </label>
              <input
                id="document-title"
                type="text"
                bind:value={formData.title}
                placeholder="e.g., Smith v. Jones Verdict 2024"
                class="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <!-- Document Type -->
            <div>
              <label for="document-type" class="block text-sm font-medium text-slate-300 mb-2">
                Document Type
              </label>
              <select
                id="document-type"
                bind:value={formData.documentType}
                class="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="report">Report</option>
                <option value="verdict">Verdict</option>
                <option value="sentence">Sentencing Order</option>
                <option value="contract">Contract</option>
                <option value="evidence">Evidence Document</option>
                <option value="brief">Legal Brief</option>
                <option value="motion">Motion</option>
              </select>
            </div>

            <!-- Jurisdiction & Case Number -->
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label for="jurisdiction" class="block text-sm font-medium text-slate-300 mb-2">
                  Jurisdiction
                </label>
                <input
                  id="jurisdiction"
                  type="text"
                  bind:value={formData.jurisdiction}
                  placeholder="e.g., California"
                  class="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label for="case-number" class="block text-sm font-medium text-slate-300 mb-2">
                  Case Number
                </label>
                <input
                  id="case-number"
                  type="text"
                  bind:value={formData.caseNumber}
                  placeholder="e.g., 2024-CV-12345"
                  class="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <!-- Enable Comparison -->
            <div class="flex items-center gap-2">
              <input
                type="checkbox"
                bind:checked={formData.enableComparison}
                id="enableComparison"
                class="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500"
              />
              <label for="enableComparison" class="text-sm text-slate-300">
                Enable case similarity search and recommendations (using embeddinggemma + Qdrant
                tags)
              </label>
            </div>

            <!-- Submit Button -->
            <Button
              onclick={submitReport}
              disabled={!canSubmit}
              class="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {#if isUploading}
                <span class="flex items-center gap-2 justify-center">
                  <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle
                      class="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      stroke-width="4"
                      fill="none"
                    ></circle>
                    <path
                      class="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Analyzing... {uploadProgress}%
                </span>
              {:else}
                <span class="flex items-center gap-2 justify-center">
                  <Sparkles class="w-5 h-5" />
                  Analyze with AI
                </span>
              {/if}
            </Button>

            <!-- Progress Bar -->
            {#if isUploading}
              <div class="w-full bg-slate-700 rounded-full h-2">
                <div
                  class="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style="width: {uploadProgress}%"
                ></div>
              </div>
            {/if}
          </div>
        </CardContent>
      </Card>
    {/if}

    <!-- Analysis Results -->
    {#if analysisResult}
      <div class="space-y-6">
        <!-- Results Header -->
        <Card class="bg-slate-800/50 border-slate-700">
          <CardContent class="pt-6">
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-2xl font-bold text-white">Analysis Results</h2>
              <Button
                onclick={resetForm}
                class="bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 rounded-lg"
              >
                Upload New Report
              </Button>
            </div>

            <div class="grid grid-cols-4 gap-4 text-center">
              <div class="bg-slate-700/50 rounded-lg p-4">
                <div class="text-3xl font-bold text-blue-400">
                  {analysisResult.analysis.who.personsOfInterest.length}
                </div>
                <div class="text-sm text-slate-400 mt-1">Persons of Interest</div>
              </div>

              <div class="bg-slate-700/50 rounded-lg p-4">
                <div class="text-3xl font-bold text-purple-400">
                  {analysisResult.analysis.what.legalIssues.length}
                </div>
                <div class="text-sm text-slate-400 mt-1">Legal Issues</div>
              </div>

              <div class="bg-slate-700/50 rounded-lg p-4">
                <div class="text-3xl font-bold text-green-400">
                  {analysisResult.analysis.evidence.physicalEvidence.length +
                    analysisResult.analysis.evidence.documentaryEvidence.length}
                </div>
                <div class="text-sm text-slate-400 mt-1">Evidence Items</div>
              </div>

              <div class="bg-slate-700/50 rounded-lg p-4">
                <div class="text-3xl font-bold text-yellow-400">
                  {analysisResult.comparison?.similarCases.length || 0}
                </div>
                <div class="text-sm text-slate-400 mt-1">Similar Cases</div>
              </div>
            </div>

            <div class="mt-4 text-sm text-slate-400">
              Processing time: {(analysisResult.processingTime / 1000).toFixed(2)}s | Text
              extracted: {analysisResult.extractedTextLength.toLocaleString()}
              characters
            </div>
          </CardContent>
        </Card>

        <!-- Analysis Tabs -->
        <div class="flex gap-2 flex-wrap">
          {#each Array.isArray( ['who', 'what', 'why', 'how', 'evidence', 'comparison'] ) ? ['who', 'what', 'why', 'how', 'evidence', 'comparison'] : [] as tab}
            <button
              onclick={() => (activeTab = tab as typeof activeTab)}
              class={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {#if tab === 'who'}
                <Users class="w-4 h-4 inline mr-1" />
                WHO
              {:else if tab === 'what'}
                <FileText class="w-4 h-4 inline mr-1" />
                WHAT
              {:else if tab === 'why'}
                <Scale class="w-4 h-4 inline mr-1" />
                WHY
              {:else if tab === 'how'}
                <FileSearch class="w-4 h-4 inline mr-1" />
                HOW
              {:else if tab === 'evidence'}
                <Search class="w-4 h-4 inline mr-1" />
                EVIDENCE
              {:else if tab === 'comparison'}
                <Sparkles class="w-4 h-4 inline mr-1" />
                COMPARISON
              {/if}
            </button>
          {/each}
        </div>

        <!-- Tab Content -->
        <Card class="bg-slate-800/50 border-slate-700">
          <CardContent class="pt-6">
            {#if activeTab === 'who'}
              <!-- WHO Section -->
              <h3 class="text-xl font-bold text-white mb-4">👥 Persons of Interest</h3>

              <div class="space-y-4">
                {#each Array.isArray(analysisResult.analysis.who.personsOfInterest) ? analysisResult.analysis.who.personsOfInterest : [] as poi}
                  <div class="bg-slate-700/50 rounded-lg p-4">
                    <div class="flex items-center justify-between mb-2">
                      <h4 class="text-lg font-semibold text-blue-400">{poi.name}</h4>
                      <span class="px-3 py-1 rounded-full text-sm bg-purple-500/20 text-purple-400">
                        {poi.role}
                      </span>
                    </div>
                    <div class="text-sm text-slate-400">
                      Mentions: {poi.mentions} | Relevance: {(poi.relevance * 100).toFixed(0)}%
                    </div>
                  </div>
                {/each}

                {#if analysisResult.analysis.who.personsOfInterest.length === 0}
                  <div class="text-center text-slate-400 py-8">
                    No persons of interest identified
                  </div>
                {/if}
              </div>
            {:else if activeTab === 'what'}
              <!-- WHAT Section -->
              <h3 class="text-xl font-bold text-white mb-4">📄 Case Summary</h3>

              <div class="space-y-6">
                <div>
                  <h4 class="text-sm font-semibold text-slate-400 mb-2">Summary</h4>
                  <p class="text-white bg-slate-700/50 rounded-lg p-4">
                    {analysisResult.analysis.what.summary}
                  </p>
                </div>

                {#if analysisResult.analysis.what.chargesOrClaims.length > 0}
                  <div>
                    <h4 class="text-sm font-semibold text-slate-400 mb-2">Charges/Claims</h4>
                    <ul class="list-disc list-inside space-y-1 text-slate-300">
                      {#each Array.isArray(analysisResult.analysis.what.chargesOrClaims) ? analysisResult.analysis.what.chargesOrClaims : [] as charge}
                        <li>{charge}</li>
                      {/each}
                    </ul>
                  </div>
                {/if}

                {#if analysisResult.analysis.what.legalIssues.length > 0}
                  <div>
                    <h4 class="text-sm font-semibold text-slate-400 mb-2">Legal Issues</h4>
                    <ul class="list-disc list-inside space-y-1 text-slate-300">
                      {#each Array.isArray(analysisResult.analysis.what.legalIssues) ? analysisResult.analysis.what.legalIssues : [] as issue}
                        <li>{issue}</li>
                      {/each}
                    </ul>
                  </div>
                {/if}

                {#if analysisResult.analysis.what.keyFacts.length > 0}
                  <div>
                    <h4 class="text-sm font-semibold text-slate-400 mb-2">Key Facts</h4>
                    <ul class="list-disc list-inside space-y-1 text-slate-300">
                      {#each Array.isArray(analysisResult.analysis.what.keyFacts) ? analysisResult.analysis.what.keyFacts : [] as fact}
                        <li>{fact}</li>
                      {/each}
                    </ul>
                  </div>
                {/if}
              </div>
            {:else if activeTab === 'why'}
              <!-- WHY Section -->
              <h3 class="text-xl font-bold text-white mb-4">⚖️ Legal Basis & Motivation</h3>

              <div class="space-y-6">
                <div>
                  <h4 class="text-sm font-semibold text-slate-400 mb-2">Motivation</h4>
                  <p class="text-white bg-slate-700/50 rounded-lg p-4">
                    {analysisResult.analysis.why.motivation}
                  </p>
                </div>

                {#if analysisResult.analysis.why.legalBasis.length > 0}
                  <div>
                    <h4 class="text-sm font-semibold text-slate-400 mb-2">Legal Basis</h4>
                    <ul class="list-disc list-inside space-y-1 text-slate-300">
                      {#each Array.isArray(analysisResult.analysis.why.legalBasis) ? analysisResult.analysis.why.legalBasis : [] as basis}
                        <li>{basis}</li>
                      {/each}
                    </ul>
                  </div>
                {/if}

                {#if analysisResult.analysis.why.precedents.length > 0}
                  <div>
                    <h4 class="text-sm font-semibold text-slate-400 mb-2">Precedents</h4>
                    <ul class="list-disc list-inside space-y-1 text-slate-300">
                      {#each Array.isArray(analysisResult.analysis.why.precedents) ? analysisResult.analysis.why.precedents : [] as precedent}
                        <li>{precedent}</li>
                      {/each}
                    </ul>
                  </div>
                {/if}
              </div>
            {:else if activeTab === 'how'}
              <!-- HOW Section -->
              <h3 class="text-xl font-bold text-white mb-4">🔍 Methodology & Arguments</h3>

              <div class="space-y-6">
                <div>
                  <h4 class="text-sm font-semibold text-slate-400 mb-2">Methodology</h4>
                  <p class="text-white bg-slate-700/50 rounded-lg p-4">
                    {analysisResult.analysis.how.methodology}
                  </p>
                </div>

                {#if analysisResult.analysis.how.evidenceChain.length > 0}
                  <div>
                    <h4 class="text-sm font-semibold text-slate-400 mb-2">Evidence Chain</h4>
                    <ul class="list-disc list-inside space-y-1 text-slate-300">
                      {#each Array.isArray(analysisResult.analysis.how.evidenceChain) ? analysisResult.analysis.how.evidenceChain : [] as item}
                        <li>{item}</li>
                      {/each}
                    </ul>
                  </div>
                {/if}

                {#if analysisResult.analysis.how.legalArguments.length > 0}
                  <div>
                    <h4 class="text-sm font-semibold text-slate-400 mb-2">Legal Arguments</h4>
                    <ul class="list-disc list-inside space-y-1 text-slate-300">
                      {#each Array.isArray(analysisResult.analysis.how.legalArguments) ? analysisResult.analysis.how.legalArguments : [] as argument}
                        <li>{argument}</li>
                      {/each}
                    </ul>
                  </div>
                {/if}
              </div>
            {:else if activeTab === 'evidence'}
              <!-- EVIDENCE Section -->
              <h3 class="text-xl font-bold text-white mb-4">🔬 Evidence Analysis</h3>

              <div class="space-y-6">
                {#if analysisResult.analysis.evidence.physicalEvidence.length > 0}
                  <div>
                    <h4 class="text-sm font-semibold text-slate-400 mb-2">Physical Evidence</h4>
                    <div class="space-y-2">
                      {#each Array.isArray(analysisResult.analysis.evidence.physicalEvidence) ? analysisResult.analysis.evidence.physicalEvidence : [] as evidence}
                        <div class="bg-slate-700/50 rounded-lg p-3">
                          <div class="flex items-center justify-between mb-1">
                            <span class="text-white font-medium">{evidence.description}</span>
                            <span
                              class={`px-2 py-1 rounded text-xs ${evidence.admissible ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}
                            >
                              {evidence.admissible ? 'Admissible' : 'Excluded'}
                            </span>
                          </div>
                          <div class="text-sm text-slate-400">
                            Relevance: {(evidence.relevance * 100).toFixed(0)}%
                          </div>
                        </div>
                      {/each}
                    </div>
                  </div>
                {/if}

                {#if analysisResult.analysis.evidence.documentaryEvidence.length > 0}
                  <div>
                    <h4 class="text-sm font-semibold text-slate-400 mb-2">Documentary Evidence</h4>
                    <ul class="list-disc list-inside space-y-1 text-slate-300">
                      {#each Array.isArray(analysisResult.analysis.evidence.documentaryEvidence) ? analysisResult.analysis.evidence.documentaryEvidence : [] as doc}
                        <li>{doc}</li>
                      {/each}
                    </ul>
                  </div>
                {/if}

                {#if analysisResult.analysis.evidence.testimonialEvidence.length > 0}
                  <div>
                    <h4 class="text-sm font-semibold text-slate-400 mb-2">Testimonial Evidence</h4>
                    <ul class="list-disc list-inside space-y-1 text-slate-300">
                      {#each Array.isArray(analysisResult.analysis.evidence.testimonialEvidence) ? analysisResult.analysis.evidence.testimonialEvidence : [] as testimony}
                        <li>{testimony}</li>
                      {/each}
                    </ul>
                  </div>
                {/if}

                {#if analysisResult.analysis.evidence.expertOpinions.length > 0}
                  <div>
                    <h4 class="text-sm font-semibold text-slate-400 mb-2">Expert Opinions</h4>
                    <ul class="list-disc list-inside space-y-1 text-slate-300">
                      {#each Array.isArray(analysisResult.analysis.evidence.expertOpinions) ? analysisResult.analysis.evidence.expertOpinions : [] as opinion}
                        <li>{opinion}</li>
                      {/each}
                    </ul>
                  </div>
                {/if}
              </div>
            {:else if activeTab === 'comparison'}
              <!-- COMPARISON Section -->
              <h3 class="text-xl font-bold text-white mb-4">
                📊 Case Similarity & Recommendations
              </h3>

              {#if analysisResult.comparison}
                <div class="space-y-6">
                  <!-- Similar Cases -->
                  {#if analysisResult.comparison.similarCases.length > 0}
                    <div>
                      <h4 class="text-sm font-semibold text-slate-400 mb-3">
                        Similar Cases (embeddinggemma + Qdrant tags)
                      </h4>
                      <div class="space-y-3">
                        {#each Array.isArray(analysisResult.comparison.similarCases) ? analysisResult.comparison.similarCases : [] as similarCase}
                          <div class="bg-slate-700/50 rounded-lg p-4">
                            <div class="flex items-center justify-between mb-2">
                              <h5 class="text-lg font-semibold text-blue-400">
                                {similarCase.title}
                              </h5>
                              <span
                                class="px-3 py-1 rounded-full text-sm bg-green-500/20 text-green-400"
                              >
                                {(similarCase.similarity * 100).toFixed(0)}% match
                              </span>
                            </div>

                            {#if similarCase.matchedFactors.length > 0}
                              <div class="mb-2">
                                <span class="text-sm text-slate-400">Matched factors:</span>
                                <div class="flex flex-wrap gap-1 mt-1">
                                  {#each Array.isArray(similarCase.matchedFactors) ? similarCase.matchedFactors : [] as factor}
                                    <span
                                      class="px-2 py-1 rounded text-xs bg-purple-500/20 text-purple-400"
                                    >
                                      {factor}
                                    </span>
                                  {/each}
                                </div>
                              </div>
                            {/if}

                            {#if similarCase.outcome}
                              <div class="text-sm text-slate-400">
                                Outcome: <span class="text-white">{similarCase.outcome}</span>
                              </div>
                            {/if}

                            {#if similarCase.relevantExcerpts.length > 0}
                              <p class="text-sm text-slate-300 mt-2 italic">
                                "{similarCase.relevantExcerpts[0]}..."
                              </p>
                            {/if}
                          </div>
                        {/each}
                      </div>
                    </div>
                  {/if}

                  <!-- AI Recommendations -->
                  {#if analysisResult.comparison.recommendations.length > 0}
                    <div>
                      <h4 class="text-sm font-semibold text-slate-400 mb-3">
                        AI Recommendations (gemma3-legal:latest)
                      </h4>
                      <div class="space-y-3">
                        {#each Array.isArray(analysisResult.comparison.recommendations) ? analysisResult.comparison.recommendations : [] as rec}
                          <div class="bg-slate-700/50 rounded-lg p-4">
                            <div class="flex items-center gap-2 mb-2">
                              <getPriorityIcon(rec.priority) class={`w-5 h-5 ${getPriorityColor(rec.priority)}`}
                              / />
                              <h5 class={`text-lg font-semibold ${getPriorityColor(rec.priority)}`}>
                                {rec.type.toUpperCase()}: {rec.description}
                              </h5>
                            </div>

                            <p class="text-sm text-slate-300 mb-2">
                              {rec.reasoning}
                            </p>

                            <div class="flex items-center gap-4 text-xs text-slate-400">
                              <span>Priority: {rec.priority}</span>
                              <span>Confidence: {(rec.confidence * 100).toFixed(0)}%</span>
                            </div>
                          </div>
                        {/each}
                      </div>
                    </div>
                  {/if}

                  <!-- AI Insights -->
                  {#if analysisResult.comparison.aiInsights}
                    <div>
                      <h4 class="text-sm font-semibold text-slate-400 mb-2">AI Insights</h4>
                      <div
                        class="bg-slate-700/50 rounded-lg p-4 text-slate-300 whitespace-pre-wrap"
                      >
                        {analysisResult.comparison.aiInsights}
                      </div>
                    </div>
                  {/if}
                </div>
              {:else}
                <div class="text-center text-slate-400 py-8">
                  Comparison was not enabled for this analysis
                </div>
              {/if}
            {/if}
          </CardContent>
        </Card>
      </div>
    {/if}

    <!-- Error Display -->
    {#if analysisError}
      <Card class="bg-red-900/20 border-red-500/50 mt-6">
        <CardContent class="pt-6">
          <div class="flex items-center gap-2 text-red-400">
            <AlertTriangle class="w-5 h-5" />
            <span class="font-semibold">Analysis Error</span>
          </div>
          <p class="text-red-300 mt-2">{analysisError}</p>
        </CardContent>
      </Card>
    {/if}
  </div>
</div>

<style>
  :global(.loader-spin-icon) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
</style>
