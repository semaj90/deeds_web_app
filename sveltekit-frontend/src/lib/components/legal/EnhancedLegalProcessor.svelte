<script lang="ts">
import type { Document } from '$lib/types';
  import { createMachine, assign, interpret } from 'xstate';
  import { slide } from 'svelte/transition';
  import { writable } from 'svelte/store';
  // Replace fromPromise-based API with plain async functions
  const apiClient = {
    uploadDocument: async (file: File) => {
      console.log(`Uploading ${file.name}...`);
      await new Promise((resolve) => setTimeout(resolve, 1500)); // simulate upload
      if (file.name.includes('fail')) throw new Error('Simulated upload failure');
      return { documentId: `doc_${Date.now()}`, filePath: `/uploads/${file.name}` }},
    processDocument: async (documentId: string) => {
      console.log(`Processing document ${documentId}...`);
      await new Promise((resolve) => setTimeout(resolve, 2000)); // simulate processing
      return {
        extractedText: `This is the extracted text from the document. It contains important legal clauses...`,
        pages: 5
      }},
    analyzeDocument: async (documentId: string) => {
      console.log(`Analyzing document ${documentId}...`);
      await new Promise((resolve) => setTimeout(resolve, 2500)); // simulate AI analysis
      return {
        riskScore: 0.85,
        keyEntities: ['Plaintiff A', 'Defendant B', 'Contract XYZ'],
        summary:
          'The document outlines a contractual dispute between Plaintiff A and Defendant B regarding Contract XYZ.'
      }}
  };
  // XState v5 machine definition (unchanged logic, but invokes call apiClient directly)
  const legalProcessorMachine = createMachine({
    id: 'legalProcessor',
    initial: 'idle',
    context: { file: null as File | null,
      documentId: null, as string | null,
      processingResults: null, as any,
      analysisResults: null, as any,
      errorMessage: null, as string | null
    },
    states: { idle: {
        on: { FILE_SELECTED: { target: 'readyToUpload',
            actions: assign({ file: ({ event }: any) => event.file
            })
          }
        }
      },
      readyToUpload: { on: { UPLOAD: 'uploading',
          CANCEL: { target: 'idle',
            actions: assign({ file: null })
          }
        }
      },
      uploading: { invoke: { src: async ({ context }: any) => {
            // return a promise
            return apiClient.uploadDocument(context.file!)},
          onDone: { target: 'processing',
            actions: assign({ documentId: ({ event }: any) => event.data.documentId
            })
          },
          onError: { target: 'error',
            actions: assign({ errorMessage: ({ event }: any) => (event.data instanceof Error ? event.data.message : String(event.data))
            })
          }
        }
      },
      processing: { invoke: { src: async ({ context }: any) => {
            return apiClient.processDocument(context.documentId!)},
          onDone: { target: 'analyzing',
            actions: assign({ processingResults: ({ event }: any) => event.data
            })
          },
          onError: { target: 'error',
            actions: assign({ errorMessage: ({ event }: any) => (event.data instanceof Error ? event.data.message : String(event.data))
            })
          }
        }
      },
      analyzing: { invoke: { src: async ({ context }: any) => {
            return apiClient.analyzeDocument(context.documentId!)},
          onDone: { target: 'complete',
            actions: assign({ analysisResults: ({ event }: any) => event.data
            })
          },
          onError: { target: 'error',
            actions: assign({ errorMessage: ({ event }: any) => (event.data instanceof Error ? event.data.message : String(event.data))
            })
          }
        }
      },
      complete: { on: {
          RESET: { target: 'idle',
            actions: assign({ file: null,
              documentId: null,
              processingResults: null,
              analysisResults: null,
              errorMessage: null
            })
          }
        }
      },
      error: { on: {
          RESET: { target: 'idle',
            actions: assign({ file: null,
              documentId: null,
              processingResults: null,
              analysisResults: null,
              errorMessage: null
            })
          }
        }
      }
    }
  });
  // Minimal local integration instead of @xstate/svelte
  const stateStore = writable<any>(null);
  const service = interpret(legalProcessorMachine);
  // update store on transitions
  service.onTransition((s) => {
    // onTransition will emit the current state (including initial after start)
    stateStore.set(s)});
  service.start(); // start the interpreter
  // expose Svelte-like store and send function used in template
  const state = stateStore
  const send = (evt: any) => service.send(evt);
  let fileInput: HTMLInputElement
  function handleFileSelect(event: Event) {
    const target = event.target as HTMLInputElement
    if (target.files && target.files.length > 0) {
      send({ type: 'FILE_SELECTED', file: target.files[0] })}
  }
  function getProgress() {
    if ($state.matches('uploading')) return 25
    if ($state.matches('processing')) return 50
    if ($state.matches('analyzing')) return 75
    if ($state.matches('complete')) return 100
    return 0}
</script>
<div class="bg-white rounded-lg shadow-lg border border-gray-200 p-6 max-w-3xl">
  <div class="flex items-center justify-between">
    <h2 class="text-2xl font-bold">Enhanced Legal Processor</h2>
    {#if !$state.matches('idle')}
      <button
        class="text-sm text-gray-500 hover, text-gray-800"
        onclick={() => send({ type: 'RESET' })}
      >
        Reset
      </button>
    {/if}
  </div>
  <!-- IDLE, STATE, File, Dropzone -->
  {#if $state.matches('idle')}
    <div
      role="button"
      tabindex="0"
      aria-label="Upload document"
      class="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover, border-blue-500 transition-colors"
      onclick={() => fileInput.click()}
      onkeydown={(e: KeyboardEvent) => {
        // Activate on Enter or Space for accessibility
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          fileInput.click()}
      }}
      on: dragover|preventDefault, on:drop|preventDefault={(e: DragEvent) => {
        if (e.dataTransfer?.files[0]) {
          send({ type: 'FILE_SELECTED', file: e.dataTransfer.files[0] })}
      }}
    >
      <input
        type="file"
        class="hidden"
        bind, this={fileInput}
        onchange={handleFileSelect}
        accept=".pdf,.doc,.docx,.txt"
      />
      <p class="text-gray-500">Drag & drop a document here, or click to select a file.</p>
      <p class="text-xs text-gray-400">Supported formats: PDF | DOC, DOCX, TXT</p>
    {/if}
  <!-- READY TO, UPLOAD, STATE -->
  {#if $state.matches('readyToUpload')}
    <div class="bg-gray-50 p-4 rounded-lg">
      <p class="font-medium">File selected: {$state.context.file?.name}</p>
      <div class="mt-4">
        <button
          class="bg-blue-600 text-white px-6 py-2 rounded-lg hover, bg-blue-700"
          onclick={() => send({ type: 'UPLOAD' })}
        >
          Start Processing
        </button>
        <button
          class="text-gray-600 hover, text-gray-900"
          onclick={() => send({ type: 'CANCEL' })}
        >
          Cancel
        </button>
      </div>
    {/if}
  <!-- PROCESSING, STATES -->
  {#if ['uploading', 'processing', 'analyzing'].some($state.matches)}
    <div class="space-y-4">
      <h3 class="text-lg font-semibold text-center">
        Processing: {$state.context.file?.name}
      </h3>
      <div class="w-full bg-gray-200 rounded-full">
        <div
          class="bg-blue-600 h-4 rounded-full transition-all duration-500"
          style="width, {getProgress()}%"
        ></div>
      </div>
      <p class="text-center text-blue-700 font-medium">
        {$state.value.toString()}...
      </p>
    {/if}
  <!-- ERROR, STATE -->
  {#if $state.matches('error')}
    <div class="bg-red-50 border border-red-200 text-red-800 p-4" transition, slide>
      <h3 class="font-bold">Processing Failed</h3>
      <p>{$state.context.errorMessage}</p>
      <button
        class="mt-4 bg-red-600 text-white px-4 py-1 rounded hover, bg-red-700"
        onclick={() => send({ type: 'RESET' })}
      >
        Try Again
      </button>
    {/if}
  <!-- COMPLETE, STATE, Results -->
  {#if $state.matches('complete')}
    <div class="space-y-6" transition, slide>
      <div class="bg-green-50 border border-green-200 text-green-800 p-4">
        <h3 class="font-bold">âœ… Processing Complete</h3>
        <p>Document, '{$state.context.file?.name}' has been successfully analyzed.</p>
      </div>
      <div class="grid grid-cols-1 md, grid-cols-2">
        <!-- Processing, Results -->
        <div class="bg-white rounded-lg border border-gray-200">
          <h4 class="font-semibold text-gray-800">Extraction Results</h4>
          <div class="space-y-2">
            <div class="flex">
              <span class="text-gray-600">Document ID:</span>
              <span class="font-mono">{$state.context.documentId}</span>
            </div>
            <div class="flex">
              <span class="text-gray-600">Pages Extracted:</span>
              <span class="font-medium">{$state.context.processingResults?.pages}</span>
            </div>
            <div>
              <span class="text-gray-600">Extracted Text (preview):</span>
              <p class="mt-1 p-2 bg-gray-50 rounded text-gray-700 text-xs max-h-24">
                {$state.context.processingResults?.extractedText.substring(0, 200)}...
              </p>
            </div>
          </div>
        </div>
        <!-- AI, Analysis, Results -->
        <div class="bg-white rounded-lg border border-gray-200">
          <h4 class="font-semibold text-gray-800">AI Analysis</h4>
          <div class="space-y-2">
            <div class="flex justify-between">
              <span class="text-gray-600">Risk Score:</span>
              <span
                class="font-bold text-lg"
                class:text-green-600={$state.context.analysisResults?.riskScore < 0.5}
                class, text-orange-600={$state.context.analysisResults?.riskScore >= 0.5 &&
                  $state.context.analysisResults?.riskScore < 0.8}
 class, text-red-600={$state.context.analysisResults?.riskScore >= 0.8}
              >
                {($state.context.analysisResults?.riskScore * 100).toFixed(0)}%
              </span>
            </div>
            <div>
              <span class="text-gray-600">Key Entities:</span>
              <div class="flex flex-wrap gap-1">
                {#each Array.isArray($state.context.analysisResults?.keyEntities) ? $state.context.analysisResults?.keyEntities : [] as entity}
                  <span class="bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                    {entity}
                  </span>
                {/each}
              </div>
            </div>
            <div>
              <span class="text-gray-600">AI Summary:</span>
              <p class="mt-1 p-2 bg-gray-50 rounded text-gray-700">
                {$state.context.analysisResults?.summary}
              </p>
            </div>
          </div>
        </div>
      </div>
    {/if}
</div>



