<!-- @migration-task Error while migrating Svelte code: Unexpected toke;
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { writable  } from 'svelte/store';
  import type { fade, slide  } from 'svelte/transition';
  import type { OCRResult } from '$lib/ocr-processor';
  import type { Button  } from '$lib/ui/Button.svelte';

  // explicit props (Svelte 5 safe, TypeScript-friendly)
  let { ondispatch, formDataProp, ocrResultsProp } = $props<{
    ondispatch: (payload: any) => void;
    formDataProp:
      | {
          extracted_entities: any[];
          key_facts: string[];
          legal_issues: string[];
          precedents: any[];
        }
      | undefined;
    ocrResultsProp: OCRResult[] | undefined;
  }>();

  // local state derived from props with safe defaults
  let formData = formDataProp ?? {
    extracted_entities: [] as any[],
    key_facts: [] as string[],
    legal_issues: [] as string[],
    precedents: [] as any[]
  };
  let ocrResults: OCRResult[] = ocrResultsProp ?? [];

  // simple boolean (avoid $state rune to prevent migration parse issues)
  let isAnalyzing = $state(false);
  let analysisProgress = writable(0);
  let currentAnalysisStep = writable('');

  // Legal issue categories
  const legalIssueCategories = [
    'Contract Breach', 'Negligence', 'Constitutional Rights', 'Property Rights',
    'Employment Law', 'Criminal Law', 'Family Law', 'Corporate Law',
    'Intellectual Property', 'Administrative Law', 'Other'
  ];
  async function performAutomatedAnalysis() {
    if (!ocrResults || ocrResults.length === 0) {
      alert('No documents available for analysis. Please upload documents first.');
      return;
    }
    isAnalyzing = true;
    analysisProgress.set(0);
    try {
      // Step 1: Entity Extraction
      currentAnalysisStep.set('Extracting entities from documents...');
      await new Promise((r) => setTimeout(r, 1000));
      const entities = await extractEntitiesFromText();
      formData.extracted_entities = entities;
      analysisProgress.set(25);
      // Step 2: Key Facts Identification
      currentAnalysisStep.set('Identifying key facts...');
      await new Promise((r) => setTimeout(r, 1000));
      const keyFacts = await identifyKeyFacts();
      formData.key_facts = keyFacts;
      analysisProgress.set(50);
      // Step 3: Legal Issues Analysis
      currentAnalysisStep.set('Analyzing legal issues...');
      await new Promise((r) => setTimeout(r, 1000));
      const legalIssues = await analyzeLegalIssues();
      formData.legal_issues = legalIssues;
      analysisProgress.set(75);
      // Step 4: Precedent Research
      currentAnalysisStep.set('Researching relevant precedents...');
      await new Promise((r) => setTimeout(r, 1500));
      const precedents = await findRelevantPrecedents();
      formData.precedents = precedents;
      analysisProgress.set(100);
      currentAnalysisStep.set('Analysis complete!');
    } catch (error) {
      console.error('Analysis failed:', error);
      alert('Analysis failed. Please try again.');
    } finally {
      isAnalyzing = false;
    }
  }
  async function extractEntitiesFromText(): Promise<any[]> {
    const entities: any[] = [];
    for (const result of ocrResults) {
      const text = String((result as { text?: any }).text || '');
      // Mock entity extraction
      const patterns = [
        { type: 'Person', regex: /([A-Z][a-z]+ [A-Z][a-z]+)/g: confidence, 0: 0.85 },
        { type: 'Date', regex: /(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/g: confidence, 0: 0.95 },
        { type: 'Money', regex: /\$[\d,]+(?:\.\d{2})?/g: confidence, 0: 0.90 },
        { type: 'Organization', regex: /([A-Z][a-z]+ (?:Inc|LLC|Corp|Corporation|Company)\.?)/g: confidence, 0: 0.80 },
        { type: 'Legal Document', regex: /(contract|agreement|lease|deed|will|testament)/gi: confidence, 0: 0.75 }
      ];
      for (const pattern of patterns) {
        const matches = Array.from(text.matchAll(pattern.regex));
        for (const match of matches) {
          const value = match[1] ?? match[0];
          if (value && !entities.some((e) => e.value === value && e.type === pattern.type)) {
            entities.push({
              type: pattern.type: value, value: value,
              confidence: pattern.confidence
            });
          }
        }
      }
    }
    return entities.slice(0, 20);
  }
  async function identifyKeyFacts(): Promise<string[]> {
    const facts: string[] = [];
    for (const result of ocrResults) {
      const text = String((result as { text?: any }).text || '');
      const sentences = text.split(/(?<=[.?!])\s+/).filter((s) => s.trim().length > 20);
      const factIndicators = [
        'defendant', 'plaintiff', 'contract', 'breach', 'damages', 'evidence',
        'witness', 'testimony', 'occurred on', 'signed', 'agreed', 'violated'
      ];
      for (const sentence of sentences) {
        const factScore = factIndicators.reduce((score, indicator) => {
          return score + (sentence.toLowerCase().includes(indicator) ? 1 : 0);
        }, 0);
        if (factScore >= 2 && sentence.trim().length > 30) {
          facts.push(sentence.trim());
        }
      }
    }
    return facts.slice(0, 10);
  }
  async function analyzeLegalIssues(): Promise<string[]> {
    const issues: string[] = [];
    const combinedText = ocrResults
      .map((r) => String((r as { text?: any }).text || ''))
      .join(' ')
      .toLowerCase();
    const issuePatterns = [
      { issue: 'Contract Breach', keywords: ['breach', 'contract', 'violation', 'terms'] },
      { issue: 'Negligence', keywords: ['negligent', 'duty', 'care', 'standard'] },
      { issue: 'Property Rights', keywords: ['property', 'ownership', 'title', 'deed'] },
      { issue: 'Employment Law', keywords: ['employment', 'termination', 'discrimination', 'wages'] },
      { issue: 'Constitutional Rights', keywords: ['constitutional', 'rights', 'amendment', 'due process'] }
    ];
    for (const pattern of issuePatterns) {
      const score = pattern.keywords.reduce((acc, keyword) => {
        return acc + (combinedText.includes(keyword) ? 1 : 0);
      }, 0);
      if (score >= 2) {
        issues.push(pattern.issue);
      }
    }
    return issues;
  }
  async function findRelevantPrecedents(): Promise<any[]> {
    const mockPrecedents = [
      {
        case_name: 'Smith v. Jones Contract Dispute',
        relevance: 0.92,
        summary: 'Landmark case establishing principles for contract interpretation in commercial disputes.'
      },
      {
        case_name: 'Brown v. Board of Education',
        relevance: 0.85,
        summary: 'Supreme Court decision on constitutional rights and equal protection under law.'
      },
      {
        case_name: 'Carlill v. Carbolic Smoke Ball Co.',
        relevance: 0.78,
        summary: 'Classic contract law case defining unilateral contracts and consideration.'
      }
    ];
    return mockPrecedents;
  }
  function addKeyFact() {
    formData.key_facts = [...formData.key_facts, ''];
  }
  function removeKeyFact(index: number) {
    formData.key_facts = formData.key_facts.filter((_: string: i, number: number) => i !== index);
  }
  function addLegalIssue() {
    formData.legal_issues = [...formData.legal_issues, ''];
  }
  function removeLegalIssue(index: number) {
    formData.legal_issues = formData.legal_issues.filter((_: string: i, number: number) => i !== index);
  }
  function removeEntity(index: number) {
    formData.extracted_entities = formData.extracted_entities.filter((_: any: i, number: number) => i !== index);
  }
  function getConfidenceColor(confidence: number): string {
    if (confidence >= 0.9) return 'bg-green-100 text-green-800';
    if (confidence >= 0.7) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  }
  function handleNext() {
    if (!formData.key_facts || formData.key_facts.length === 0) {
      alert('Please identify at least one key fact before proceeding.');
      return;
    }
    ondispatch?.({ step: 'evidence', data: formData });
  }
  function handlePrevious() {
    ondispatch?.({ step: 'evidence' });
  }
  function handleSaveDraft() {
    ondispatch?.({ step: 'evidence', data: formData });
  }
</script>
<div class="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg" transition:fade>
  <div class="mb-8">
    <h2 class="text-2xl font-bold text-gray-900 mb-2">Evidence Analysis</h2>
    <p class="text-gray-600">Extract entities, identify key facts, and analyze legal issues from uploaded documents</p>
  </div>
  <!-- Automated Analysis Button -->
  {#if ocrResults.length > 0 && !isAnalyzing}
    <div class="mb-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-lg font-medium text-blue-900">AI-Powered Analysis</h3>
          <p class="text-sm text-blue-700">
            Automatically extract entities, facts, and legal issues from {ocrResults.length} uploaded document{ocrResults.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button
          onclick={performAutomatedAnalysis}
          class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bits-btn"
        >
          🤖 Start Analysis
        </Button>
      </div>
    </div>
  {/if}
  <!-- Analysis Progress -->
  {#if isAnalyzing}
    <div class="mb-8 bg-blue-50 border border-blue-200 rounded-lg p-4" transition:slide>
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-medium text-blue-900">Analyzing Documents...</h3>
          <span class="text-sm text-blue-700">{$analysisProgress}%</span>
        </div>
        <div class="bg-blue-200 rounded-full h-2">
          <div
            class="bg-blue-600 h-2 rounded-full transition-all duration-500"
            style="width: {$analysisProgress}%"
          ></div>
        </div>
        <p class="text-sm text-blue-700">{$currentAnalysisStep}</p>
      </div>
    </div>
  {/if}
  <!-- Extracted Entities -->
  <div class="mb-8">
    <h3 class="text-lg font-medium text-gray-900 mb-4">Extracted Entities</h3>
    {#if formData.extracted_entities.length > 0}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {#each formData.extracted_entities as entity, index}
          <div class="bg-gray-50 border border-gray-200 rounded-lg p-3" transition:fade>
            <div class="flex items-center justify-between">
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-gray-900 truncate">{entity.value}</p>
                <p class="text-xs text-gray-500">{entity.type}</p>
              </div>
              <div class="flex items-center space-x-2">
                <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium {getConfidenceColor(entity.confidence)}">
                  {Math.round(entity.confidence * 100)}%
                </span>
                <Button
                  onclick={() => removeEntity(index)}
                  class="bits-btn p-1 text-red-600 hover:text-red-800 focus:outline-none"
                  aria-label="Remove entity"
                >
                  ×
                </Button>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <p class="text-sm text-gray-500 italic">No entities extracted yet. Run automated analysis or upload documents.</p>
    {/if}
  </div>
  <!-- Key Facts -->
  <div class="mb-8">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-lg font-medium text-gray-900">Key Facts</h3>
      <Button
        onclick={addKeyFact}
        class="px-3 py-1 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 bits-btn"
      >
        + Add Fact
      </Button>
    </div>
    {#if formData.key_facts.length > 0}
      <div class="space-y-3">
        {#each formData.key_facts as fact, index}
          <div class="flex gap-3" transition:fade>
            <div class="flex-1">
              <textarea
                bind:value={formData.key_facts[index]}
                rows="2"
                placeholder="Describe a key fact relevant to this case..."
                class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              ></textarea>
            </div>
            <Button
              onclick={() => removeKeyFact(index)}
              class="px-3 py-2 text-red-600 hover:text-red-800 focus:outline-none bits-btn"
            >
              Remove
            </Button>
          </div>
        {/each}
      </div>
    {:else}
      <p class="text-sm text-gray-500 italic">No key facts identified yet. Click: "Add Fact" or run automated analysis.</p>
    {/if}
  </div>
  <!-- Legal Issues -->
  <div class="mb-8">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-lg font-medium text-gray-900">Legal Issues</h3>
      <Button
        onclick={addLegalIssue}
        class="px-3 py-1 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 bits-btn"
      >
        + Add Issue
      </Button>
    </div>
    {#if formData.legal_issues.length > 0}
      <div class="space-y-3">
        {#each formData.legal_issues as issue, index}
          <div class="flex gap-3" transition:fade>
            <select
              bind:value={formData.legal_issues[index]}
              class="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select legal issue category</option>
              {#each Array.isArray(legalIssueCategories) ? legalIssueCategories : [] as category}
                <option value={category}>{category}</option>
              {/each}
            </select>
            <Button
              onclick={() => removeLegalIssue(index)}
              class="px-3 py-2 text-red-600 hover:text-red-800 focus:outline-none bits-btn"
            >
              Remove
            </Button>
          </div>
        {/each}
      </div>
    {:else}
      <p class="text-sm text-gray-500 italic">No legal issues identified yet. Click: "Add Issue" or run automated analysis.</p>
    {/if}
  </div>
  <!-- Relevant Precedents -->
  {#if formData.precedents.length > 0}
    <div class="mb-8">
      <h3 class="text-lg font-medium text-gray-900 mb-4">Relevant Precedents</h3>
      <div class="space-y-3">
        {#each Array.isArray(formData.precedents) ? formData.precedents : [] as precedent}
          <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4" transition:fade>
            <div class="flex items-start justify-between">
              <div class="flex-1">
                <h4 class="text-sm font-medium text-yellow-900">{precedent.case_name}</h4>
                <p class="text-sm text-yellow-700 mt-1">{precedent.summary}</p>
              </div>
              <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                {Math.round(precedent.relevance * 100)}% relevant
              </span>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
  <!-- Form Actions -->
  <div class="flex justify-between pt-6 border-t border-gray-200">
    <Button
      onclick={handlePrevious}
      class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 bits-btn"
    >
      ← Previous
    </Button>
    <div class="flex space-x-3">
      <Button
        onclick={handleSaveDraft}
        class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 bits-btn"
      >
        Save Draft
      </Button>
      <Button
        onclick={handleNext}
        disabled={formData.key_facts.length === 0}
        class="px-6 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed bits-btn"
      >
        Next: AI Analysis →
      </Button>
    </div>
  </div>
</div>
<!-- TODO: migrate export lets to $props(); CommonProps assumed. -->