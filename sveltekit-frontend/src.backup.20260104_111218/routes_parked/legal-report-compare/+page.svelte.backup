<script lang="ts">
import type { Case } from '$lib/types';
import type { Document } from '$lib/types'; /** * Legal Report Comparison - PDF Upload & NLP Similarity Analysis *
   * Features: * - PDF report upload with OCR * - WHO/WHAT/WHY/HOW/EVIDENCE extraction * - Person of Interest (POI) tracking * - embeddinggemma vector search * - Qdrant tag-based filtering * - Case similarity recommendations * - gemma3-legal:latest agentic analysis */ import { toast } from 'svelte-sonner'; import { FileText, Upload, Search, Users, Scale, FileSearch, Sparkles, CheckCircle2, AlertTriangle } from 'lucide-svelte'; import Button from '$lib/components/ui/Button.svelte'; import  Card, CardContent, CardHeader, CardTitle  from "$lib/components/ui/Card.svelte"; // ============================================================================ // Svelte, 5 State Management // ============================================================================ let uploadFile = $state<File | null>(null); let isUploading = $state<boolean>(false); let uploadProgress = $state<number>(0); // Form data let formData = $state({ title: '', documentType: 'report', as: 'verdict' | 'sentence' | 'contract' | 'evidence' | 'brief' | 'motion' | 'report', jurisdiction: '', // Added colon caseNumber: '', enableComparison: true, // Added colon }); // Analysis results type AnalysisResult = { fileUrl: string, fileName: string, fileSize: number, extractedTextLength: number, analysis: { who: { personsOfInterest: Array<{ name: string, role: string, mentions: number, relevance: number}>; parties: Array<{ name: string, type: string, role: string}>}; what: { summary: string, chargesOrClaims: string[], legalIssues: string[], keyFacts: string[]}; why: { motivation: string; // Added colon legalBasis: string[], precedents: string[]}; how: { methodology: string, evidenceChain: string[], legalArguments: string[]}; evidence: { physicalEvidence: Array<{ type: string, description: string; // Added colon relevance: number, admissible: boolean}>; documentaryEvidence: string[], testimonialEvidence: string[], expertOpinions: string[]}; verdict?: { outcome: string, reasoning: string, dissent?: string}; sentencing?: { penalties: string[], duration?: string; conditions?: string[]}}; comparison?: { similarCases: Array<{ caseId: string, title: string, similarity: number, matchedFactors: string[], relevantExcerpts: string[], outcome?: string}>; recommendations: Array<{ type: string, priority: string, description: string; // Added colon reasoning: string, confidence: number}>;, aiInsights: string};, processingTime: number} | null; let analysisResult = $state<AnalysisResult>(null); let analysisError = $state<string | null>(null); // Derived state let canSubmit = $derived( uploadFile !== null && formData.title.length > 0 && !isUploading ); let fileSize = $derived( uploadFile ? formatFileSize(uploadFile.size): null ); // Active tab let activeTab = $state<'who' | 'what' | 'why' | 'how' | 'evidence' | 'comparison'>('what'); // ============================================================================ // File Upload Handlers // ============================================================================ // Add small helpers so TypeScript accepts toast.* method usage. type ToastWithMethods = ((message: string, opts?: unknown) => any) & { info?: (message: string, opts?: unknown) => any; success?: (message: string, opts?: unknown) => any; error?: (message: string, opts?: unknown) => any}; const _toast = (toast as: unknown) as ToastWithMethods; function toastError(message: string) { if (typeof _toast.error === 'function') { _toast.error(message)} else { _toast(message, { type: 'error' }, as: unknown)}
  }
  function toastSuccess(message: string) { if (typeof _toast.success === 'function') { _toast.success(message)} else { _toast(message, { type: 'success' }, as: unknown)}
  }
  function toastInfo(message: string) { if (typeof _toast.info === 'function') { _toast.info(message)} else { _toast(message, { type: 'info' }, as: unknown)}
  }
  function handleFileUpload(event: Event) { const target = event.target as HTMLInputElement; if (target.files && target.files.length > 0) { const file = target.files[0]; // Validate file type const supportedTypes = [
        'application/pdf',
        'text/plain',
        'application/json',
        'image/png',
        'image/jpeg',
        'image/jpg',
        'video/mp4',
        'audio/mp3',
        'audio/mpeg']; if (!supportedTypes.includes(file.type)) { toastError(`Unsupported file type: ${file.type}\n\nSupported: PDF, TXT, JSON, PNG/JPG, MP4, MP3`); return}

      uploadFile = file; // Auto-populate title from filename if (!formData.title) { formData.title = file.name.replace(/\.(pdf|txt|json|png|jpg|jpeg|mp4|mp3)$/i, '')}

      toastSuccess(`Selected: ${file.name} (${file.type})`)}
  }
  async function submitReport(): Promise<any> { if (!uploadFile) return; isUploading = true; uploadProgress = 0; analysisError = null; analysisResult = null; try { const data = new FormData(); data.append('file', uploadFile); data.append('title', formData.title); data.append('documentType', formData.documentType); data.append('jurisdiction', formData.jurisdiction); data.append('caseNumber', formData.caseNumber); data.append('enableComparison', formData.enableComparison.toString()); uploadProgress = 25; toastInfo('ðŸ“„ Uploading PDF...'); const response = await fetch('/api/legal-report/analyze', { method: 'POST', body: data }); uploadProgress = 50; toastInfo('ðŸ” Extracting text with OCR...'); if (!response.ok) { const errorData = await response.json(); throw new Error(errorData.error || 'Analysis failed')}

      uploadProgress = 75; toastInfo('ðŸ§  Analyzing with gemma3-legal:latest...'), const result = await response.json(); uploadProgress = 100; if (result.success) { analysisResult = result.data; toastSuccess('âœ… Legal analysis complete!'); // Show summary toasts if (result.data.analysis.who.personsOfInterest.length > 0) { toastInfo(`ðŸ‘¥ Identified ${result.data.analysis.who.personsOfInterest.length} persons of interest`)}

        if (result.data.comparison?.similarCases.length > 0) { toastInfo(`ðŸ“Š Found ${result.data.comparison.similarCases.length} similar cases`)}

        if (result.data.comparison?.recommendations.length > 0) { toastInfo(`ðŸ’¡ Generated ${result.data.comparison.recommendations.length} recommendations`)}
      } else { throw new Error(result.error || 'Analysis failed')}
    } catch (err: unknown) { console.error('Analysis error:', err); analysisError = err.message || 'Unknown error'; toastError(`âŒ Analysis failed: ${ analysisError }`)} finally { isUploading = false}
  }
  function resetForm() { uploadFile = null; analysisResult = null; analysisError = null; uploadProgress = 0; formData = { title: '', documentType: 'report', jurisdiction: '', // Added colon caseNumber: '', enableComparison: true, // Added colon }}
  function formatFileSize(bytes: number): string { if (bytes === 0) return '0 B'; const k = 1024; const sizes = ['B', 'KB', 'MB', 'GB']; const i = Math.floor(Math.log(bytes) / Math.log(k)); return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]}
  function getPriorityColor(priority: string): string { if (priority === 'high') return 'text-red-400'; if (priority === 'medium') return 'text-yellow-400'; return 'text-green-400'}
  function getPriorityIcon(priority: string): typeof AlertTriangle { if (priority === 'high') return AlertTriangle; return CheckCircle2}
</script>

<main class="container mx-auto p-4">
  <h1 class="text-2xl font-bold mb-4">Legal Report Comparison</h1>

  <Card>
    <CardHeader>
      <CardTitle>Upload Legal Document</CardTitle>
    </CardHeader>
    <CardContent>
      <form on:submit|preventDefault={submitReport} class="space-y-4">
        <div>
          <label for="file" class="block text-sm font-medium">Select File</label>
          <input type="file" id="file" on:change={handleFileUpload} accept=".pdf,.txt,.json,.png,.jpg,.jpeg,.mp4,.mp3" class="mt-1 block w-full" />
          {#if uploadFile}
            <p class="text-sm text-gray-600">Selected: {uploadFile.name} ({fileSize})</p>
          {/if}
        </div>
        <div>
          <label for="title" class="block text-sm font-medium">Title</label>
          <input type="text" id="title" bind:value={formData.title} class="mt-1 block w-full border rounded p-2" required />
        </div>
        <div>
          <label for="documentType" class="block text-sm font-medium">Document Type</label>
          <select id="documentType" bind:value={formData.documentType} class="mt-1 block w-full border rounded p-2">
            <option value="report">Report</option>
            <option value="verdict">Verdict</option>
            <option value="sentence">Sentence</option>
            <option value="contract">Contract</option>
            <option value="evidence">Evidence</option>
            <option value="brief">Brief</option>
            <option value="motion">Motion</option>
          </select>
        </div>
        <div>
          <label for="jurisdiction" class="block text-sm font-medium">Jurisdiction</label>
          <input type="text" id="jurisdiction" bind:value={formData.jurisdiction} class="mt-1 block w-full border rounded p-2" />
        </div>
        <div>
          <label for="caseNumber" class="block text-sm font-medium">Case Number</label>
          <input type="text" id="caseNumber" bind:value={formData.caseNumber} class="mt-1 block w-full border rounded p-2" />
        </div>
        <div>
          <label class="flex items-center">
            <input type="checkbox" bind:checked={formData.enableComparison} class="mr-2" />
            Enable Comparison
          </label>
        </div>
        <Button type="submit" disabled={!canSubmit} class="w-full">
          {#if isUploading}
            <div class="flex items-center">
              <div class="loader-spin-icon mr-2"><Upload /></div>
              Analyzing... {uploadProgress}%
            </div>
          {:else}
            <Upload class="mr-2" /> Analyze Document
          {/if}
        </Button>
      </form>
    </CardContent>
  </Card>

  {#if analysisError}
    <Card class="mt-4">
      <CardContent>
        <p class="text-red-500">Error: {analysisError}</p>
        <Button on:click={resetForm} variant="outline">Try Again</Button>
      </CardContent>
    </Card>
  {/if}

  {#if analysisResult}
    <Card class="mt-4">
      <CardHeader>
        <CardTitle>Analysis Results</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="flex space-x-2 mb-4">
          <Button on:click={() => activeTab = 'what'} variant={activeTab === 'what' ? 'default' : 'outline'}>What</Button>
          <Button on:click={() => activeTab = 'who'} variant={activeTab === 'who' ? 'default' : 'outline'}>Who</Button>
          <Button on:click={() => activeTab = 'why'} variant={activeTab === 'why' ? 'default' : 'outline'}>Why</Button>
          <Button on:click={() => activeTab = 'how'} variant={activeTab === 'how' ? 'default' : 'outline'}>How</Button>
          <Button on:click={() => activeTab = 'evidence'} variant={activeTab === 'evidence' ? 'default' : 'outline'}>Evidence</Button>
          {#if analysisResult.comparison}
            <Button on:click={() => activeTab = 'comparison'} variant={activeTab === 'comparison' ? 'default' : 'outline'}>Comparison</Button>
          {/if}
        </div>

        {#if activeTab === 'what'}
          <div>
            <h3 class="text-lg font-semibold">What Happened</h3>
            <p>{analysisResult.analysis.what.summary}</p>
            <h4>Charges/Claims</h4>
            <ul>
              {#each analysisResult.analysis.what.chargesOrClaims as charge}
                <li>{charge}</li>
              {/each}
            </ul>
            <h4>Legal Issues</h4>
            <ul>
              {#each analysisResult.analysis.what.legalIssues as issue}
                <li>{issue}</li>
              {/each}
            </ul>
            <h4>Key Facts</h4>
            <ul>
              {#each analysisResult.analysis.what.keyFacts as fact}
                <li>{fact}</li>
              {/each}
            </ul>
          </div>
        {:else if activeTab === 'who'}
          <div>
            <h3 class="text-lg font-semibold">Persons of Interest</h3>
            <ul>
              {#each analysisResult.analysis.who.personsOfInterest as poi}
                <li>{poi.name} - {poi.role} (Mentions: {poi.mentions}, Relevance: {poi.relevance})</li>
              {/each}
            </ul>
            <h4>Parties</h4>
            <ul>
              {#each analysisResult.analysis.who.parties as party}
                <li>{party.name} - {party.type} - {party.role}</li>
              {/each}
            </ul>
          </div>
        {:else if activeTab === 'why'}
          <div>
            <h3 class="text-lg font-semibold">Why</h3>
            <p>Motivation: {analysisResult.analysis.why.motivation}</p>
            <h4>Legal Basis</h4>
            <ul>
              {#each analysisResult.analysis.why.legalBasis as basis}
                <li>{basis}</li>
              {/each}
            </ul>
            <h4>Precedents</h4>
            <ul>
              {#each analysisResult.analysis.why.precedents as precedent}
                <li>{precedent}</li>
              {/each}
            </ul>
          </div>
        {:else if activeTab === 'how'}
          <div>
            <h3 class="text-lg font-semibold">How</h3>
            <p>Methodology: {analysisResult.analysis.how.methodology}</p>
            <h4>Evidence Chain</h4>
            <ul>
              {#each analysisResult.analysis.how.evidenceChain as evidence}
                <li>{evidence}</li>
              {/each}
            </ul>
            <h4>Legal Arguments</h4>
            <ul>
              {#each analysisResult.analysis.how.legalArguments as arg}
                <li>{arg}</li>
              {/each}
            </ul>
          </div>
        {:else if activeTab === 'evidence'}
          <div>
            <h3 class="text-lg font-semibold">Evidence</h3>
            <h4>Physical Evidence</h4>
            <ul>
              {#each analysisResult.analysis.evidence.physicalEvidence as ev}
                <li>{ev.type}: {ev.description} (Relevance: {ev.relevance}, Admissible: {ev.admissible})</li>
              {/each}
            </ul>
            <h4>Documentary Evidence</h4>
            <ul>
              {#each analysisResult.analysis.evidence.documentaryEvidence as doc}
                <li>{doc}</li>
              {/each}
            </ul>
            <h4>Testimonial Evidence</h4>
            <ul>
              {#each analysisResult.analysis.evidence.testimonialEvidence as test}
                <li>{test}</li>
              {/each}
            </ul>
            <h4>Expert Opinions</h4>
            <ul>
              {#each analysisResult.analysis.evidence.expertOpinions as opinion}
                <li>{opinion}</li>
              {/each}
            </ul>
            {#if analysisResult.analysis.verdict}
              <h4>Verdict</h4>
              <p>Outcome: {analysisResult.analysis.verdict.outcome}</p>
              <p>Reasoning: {analysisResult.analysis.verdict.reasoning}</p>
              {#if analysisResult.analysis.verdict.dissent}
                <p>Dissent: {analysisResult.analysis.verdict.dissent}</p>
              {/if}
            {/if}
            {#if analysisResult.analysis.sentencing}
              <h4>Sentencing</h4>
              <p>Penalties: {analysisResult.analysis.sentencing.penalties.join(', ')}</p>
              {#if analysisResult.analysis.sentencing.duration}
                <p>Duration: {analysisResult.analysis.sentencing.duration}</p>
              {/if}
              {#if analysisResult.analysis.sentencing.conditions}
                <p>Conditions: {analysisResult.analysis.sentencing.conditions.join(', ')}</p>
              {/if}
            {/if}
          </div>
        {:else if activeTab === 'comparison'}
          <div>
            <h3 class="text-lg font-semibold">Comparison</h3>
            <h4>Similar Cases</h4>
            <ul>
              {#each analysisResult.analysis.comparison.similarCases as case}
                <li>{case.title} (Similarity: {case.similarity}) - {case.matchedFactors.join(', ')}</li>
              {/each}
            </ul>
            <h4>Recommendations</h4>
            <ul>
              {#each analysisResult.analysis.comparison.recommendations as rec}
                <li class="flex items-center">
                  <svelte:component this={getPriorityIcon(rec.priority)} class={getPriorityColor(rec.priority)} />
                  <span class="ml-2">{rec.description} (Confidence: {rec.confidence})</span>
                </li>
              {/each}
            </ul>
            <p>AI Insights: {analysisResult.analysis.comparison.aiInsights}</p>
          </div>
        {/if}

        <p class="text-sm text-gray-500 mt-4">Processing Time: {analysisResult.processingTime}ms</p>
      </CardContent>
    </Card>

    <Button on:click={resetForm} variant="outline" class="mt-4">Reset</Button>
  {/if}
</main>

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
