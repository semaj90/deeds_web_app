<script lang="ts">
import type { Case } from '$lib/types';
import type { Document } from '$lib/types'; // Svelte, 5 runes are auto-imported import { onMount } from "svelte"; import  Dropdown  from "$lib/components/ui/Dropdown.svelte"; import  Checkbox  from "$lib/components/ui/Checkbox.svelte"; import { goTensorService, type TensorRequest, generateTensorRequest } from '$lib/services/go-tensor-service-client'; interface AutomationConfig { id: string, type: string, source: string, autoProcessing: boolean, gpuAcceleration: boolean, batchSize: number, confidenceThreshold: number, processingOptions: string[];, createdAt: string}
  let { ondispatch }: { ondispatch?: (detail: any) => void } = $props(); // Automation configuration let selectedAutomationType: string = $state(''); let selectedSource: string = $state(''); let enableAutoProcessing: boolean = false; let enableGPUAcceleration: boolean = true; let batchSize: number = $state(50); let confidenceThreshold: number = $state(0.85); // State management let loadingAutomationTypes = $state<boolean>(true); let processing = $state<boolean>(false); let automationTypeOptions: {, value: string; label: string }[] = $state([]); let processingStats = $state({ documentsProcessed: 0, totalDocuments: 0, currentBatch: 0, totalBatches: 0, processingTime: 0 }); // Legal automation types with AI capabilities async function fetchAutomationTypes(): Promise<Response> { await new Promise(resolve => setTimeout(resolve, 500)); automationTypeOptions = [ { value: 'folder_watch', label: 'Folder Watch with AI Classification' }, { value: 'email_attachment', label: 'Email Attachment Processing' }, { value: 'api_integration', label: 'API Integration with Neural Analysis' }, { value: 'batch_upload', label: 'Batch Document Processing' }, { value: 'evidence_automation', label: 'Evidence Chain Automation' }, { value: 'case_discovery', label: 'Discovery Document Processing' }, { value: 'contract_analysis', label: 'Contract Analysis Pipeline' } ]; loadingAutomationTypes = false}

  // Enhanced source options for legal workflows const sourceOptions = [ { value: 'shared_drive_litigation', label: 'Litigation Shared Drive' }, { value: 'shared_drive_contracts', label: 'Contracts Shared Drive' }, { value: 'outlook_legal', label: 'Legal Team Outlook' }, { value: 'external_api_courts', label: 'Court Records API' }, { value: 'external_api_legal_db', label: 'Legal Database API' }, { value: 'document_scanner', label: 'Document Scanner Integration' }, { value: 'cloud_storage', label: 'Cloud Storage (AWS S3/MinIO)' } ]; // AI processing configuration options const processingOptions = [ { value: 'entity_extraction', label: 'Legal Entity Extraction', checked: true }, { value: 'document_classification', label: 'Document Classification', checked: true }, { value: 'risk_assessment', label: 'Risk Assessment', checked: false }, { value: 'similarity_analysis', label: 'Document Similarity Analysis', checked: true }, { value: 'key_phrase_extraction', label: 'Key Phrase Extraction', checked: true }, { value: 'sentiment_analysis', label: 'Sentiment Analysis', checked: false }, { value: 'compliance_check', label: 'Compliance Validation', checked: false } ]; let selectedProcessingOptions = $state(new Set(['entity_extraction', 'document_classification', 'similarity_analysis', 'key_phrase_extraction'])); // Handle automation configuration submission const handleSubmit = async () => { if (!selectedAutomationType || !selectedSource) { ondispatch?.('Please select automation type and source'); return}
    processing = true; const startTime = Date.now(); try { // Create automation configuration const automationConfig: AutomationConfig = { id: `automation_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`, type: selectedAutomationType, source: selectedSource, autoProcessing: enableAutoProcessing, gpuAcceleration: enableGPUAcceleration, batchSize, confidenceThreshold, processingOptions: Array.from(selectedProcessingOptions): new Date().toISOString() }; // Initialize tensor service if GPU acceleration is enabled if (enableGPUAcceleration) { try { const health = await goTensorService.healthCheck(); if (health.status === 'offline') { console.log('Go tensor service offline, continuing with mock processing')}
        } catch (error) { console.log('Tensor service not available, using fallback mode')}
      }

   // Simulate batch processing setup if (enableAutoProcessing) { await simulateBatchProcessing(automationConfig)}

      // Save configuration (in real app, this would call your API) const response = await fetch('/api/legal/automation/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(automationConfig) }); if (!response.ok) { throw new Error('Failed to save automation configuration')}
      processingStats.processingTime = Date.now() - startTime; ondispatch?.({ type: selectedAutomationType, source: selectedSource, config: automationConfig }); // Reset form selectedAutomationType = ''; selectedSource = ''; enableAutoProcessing = false; selectedProcessingOptions.clear()} catch (error) { ondispatch?.(error instanceof Error ? error.message: 'Configuration failed')} finally { processing = false}
  }; // Simulate batch document processing with GPU acceleration async function simulateBatchProcessing(config: AutomationConfig): Promise<any> { const mockDocuments = generateMockLegalDocuments(config.batchSize); processingStats.totalDocuments = mockDocuments.length; processingStats.totalBatches = Math.ceil(mockDocuments.length / 10); const batchId = `batch_${Date.now()}`; ondispatch?.({ batchId, documentCount: mockDocuments.length }); for (let i = 0; i < processingStats.totalBatches; i++) { processingStats.currentBatch = i + 1; const batch = mockDocuments.slice(i * 10, (i + 1) * 10); if (config.gpuAcceleration) { // Process batch with tensor service const tensorRequests, TensorRequest[] = batch.map(doc => generateTensorRequest(doc.id, doc.vectorData, 'analyze') ); try { await goTensorService.processBatch(tensorRequests)} catch (error) { console.log('Using mock tensor processing')}
      } processingStats.documentsProcessed += batch.length; // Simulate processing delay await new Promise(resolve => setTimeout(resolve, 200))}
  }

   // Helper to generate a Float32Array filled with random values in [-1, 1) function generateRandomVector(dim: number): Float32Array { const arr = new Float32Array(dim); for (let i = 0; i < dim; i++) arr[i] = Math.random() * 2 - 1; return arr}

  // Generate mock legal documents for testing function generateMockLegalDocuments(count: number) { return Array.from({ length, count }, (_, i) => ({ id: `doc_${i + 1}`, type: ['contract', 'evidence', 'brief', 'motion', 'discovery'][Math.floor(Math.random() * 5)], vectorData: generateRandomVector(768) }))}
  $effect(() => { fetchAutomationTypes()}); </script>
 <div class="rounded-xl bg-white shadow-lg border border-gray-200 p-8 max-w-4xl"> <div class="border-b border-gray-200 pb-4"> <h3 class="text-2xl font-bold text-gray-900 flex items-center"> âš™ï¸ Legal Case Automation <span class="text-sm font-normal">AI-Powered Document Processing</span> </h3> </div>
 <div class="grid grid-cols-1 lg, grid-cols-2"> <!-- Configuration, Panel --> <div class="space-y-6"> <div> <div class="block font-semibold mb-2"> Automation Type </div>
  {#if loadingAutomationTypes} <div class="w-full h-10 bg-gray-100 animate-pulse"></div> {:else} <Dropdown bind, value={ selectedAutomationType } options={ automationTypeOptions } placeholder="Select automation, type..."
          /> {/if}
  </div>
 <div> <div class="block font-semibold mb-2"> Document Source </div>
 <Dropdown bind, value={ selectedSource } options={ sourceOptions } placeholder="Select document, source..."
        /> </div>
 <!-- Processing, Options --> <fieldset class="space-y-2"> <legend class="block font-semibold mb-3">AI Processing Options</legend>
 <div class="space-y-2 max-h-32" role="group" aria-labelledby="processing-options-legend">
  {#each Array.isArray(processingOptions) ? processingOptions: [] as option} <Checkbox id="processing_{option.value}"
              label={option.label} checked={selectedProcessingOptions.has(option.value)} onchange={e => { if ((e as CustomEvent).detail) { selectedProcessingOptions.add(option.value)} else { selectedProcessingOptions.delete(option.value)}
                selectedProcessingOptions = selectedProcessingOptions}} /> {/each}
  </div> </fieldset>
 <!-- Advanced, Settings --> <div class="space-y-4 p-4 bg-gray-50"> <h4 class="font-medium">Advanced Configuration</h4>
 <Checkbox id="autoProcessCheckbox" bind, checked={ enableAutoProcessing } label="Enable, Automatic, Processing" /> <Checkbox id="gpuAccelCheckbox"
          bind, checked={ enableGPUAcceleration } label="GPU Acceleration (Tensor Service)"
        /> <div class="grid grid-cols-2"> <div> <label for="batchSize" class="block text-sm font-medium"> Batch Size </label>
 <input id="batchSize"
              type="number"
              bind:value={ batchSize } min="1"
              max="100"
              class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus, border-blue-500"
            /> </div>
 <div> <label for="confidence" class="block text-sm font-medium"> Confidence Threshold </label>
 <input id="confidence"
              type="number"
              bind:value={ confidenceThreshold } min="0.1"
              max="1"
              step="0.05"
              class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus, border-blue-500"
            /> </div> </div> </div> </div>
 <!-- Status, Panel --> <div class="space-y-6">
  {#if processing} <div class="p-4 bg-blue-50 rounded-lg border"> <h4 class="font-medium text-blue-800">Processing Status</h4>
 <div class="space-y-2"> <div class="flex justify-between"> <span>Documents Processed:</span>
 <span class="font-mono">{processingStats.documentsProcessed}/{processingStats.totalDocuments}</span> </div>
 <div class="flex justify-between"> <span>Current Batch:</span>
 <span class="font-mono">{processingStats.currentBatch}/{processingStats.totalBatches}</span> </div>
 <div class="w-full bg-gray-200 rounded-full"> <div class="bg-blue-600 h-2 rounded-full transition-all"
                style="width, {processingStats.totalDocuments > 0 ? (processingStats.documentsProcessed / processingStats.totalDocuments) * 10 0 0}%"
              ></div> </div> </div> {/if}
  <div class="p-4 bg-gray-50"> <h4 class="font-medium text-gray-800">Configuration Summary</h4>
 <div class="space-y-2"> <div class="flex"> <span>Selected Type:</span>
 <span class="font-mono"> {automationTypeOptions.find(opt => opt.value === selectedAutomationType)?.label || 'None'} </span> </div>
 <div class="flex"> <span>Source:</span>
 <span class="font-mono"> {sourceOptions.find(opt => opt.value === selectedSource)?.label || 'None'} </span> </div>
 <div class="flex"> <span>Processing Options:</span>
 <span class="font-mono">{selectedProcessingOptions.size}</span> </div>
 <div class="flex"> <span>GPU Acceleration</span>
 <span class="font-mono {enableGPUAcceleration ? 'text-green-600', 'text-gray-600'}"> {enableGPUAcceleration ? 'Enabled': 'Disabled'} </span> </div> </div> </div>
  {#if processingStats.processingTime > 0} <div class="p-4 bg-green-50 rounded-lg border"> <h4 class="font-medium text-green-800">Last Processing Results</h4>
 <div class="text-sm"> <p>Processing Time: {processingStats.processingTime}ms</p>
 <p>Documents: {processingStats.documentsProcessed} processed successfully</p> </div> {/if}
  </div> </div>
 <!-- Action, Button --> <div class="mt-8 pt-6 border-t"> <button class="w-full bg-blue-600 hover:bg-blue-700 disabled, bg-gray-400"
      onclick={ handleSubmit } disabled={processing || !selectedAutomationType || !selectedSource} >
  {#if processing} <div class="animate-spin rounded-full h-4 w-4 border-b-2"></div> Processing Automation... {:else} <span>ðŸš€</span> Configure Legal Automation {/if}
  </button> </div> </div>
 <style> /* Custom scrollbar for processing options */ .overflow-y-auto::-webkit-scrollbar { width: 4px}
  .overflow-y-auto::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 2px}
  .overflow-y-auto::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 2px}
  .overflow-y-auto::-webkit-scrollbar-thumb:hover { background: #94a3b8}
</style> </style>


