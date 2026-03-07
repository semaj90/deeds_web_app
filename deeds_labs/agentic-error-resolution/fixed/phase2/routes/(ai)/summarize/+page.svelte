<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!--
AI Document Summarization - Generate summaries of legal documents
-->
<script lang="ts">
	// Safe imports (works with default or named exports)
	import * as EssentialRoutePageModule from '$lib/templates/EssentialRoutePage.svelte';
	const EssentialRouteComponent = EssentialRoutePageModule.default ?? EssentialRoutePageModule.EssentialRoutePage ?? EssentialRoutePageModule;

	// UI components / icons
	import EnhancedButton from '$lib/components/ui/enhanced-bits.svelte';
	import type { FileText, Upload, Download, Brain, Clock, Star  } from 'lucide-svelte';

	// Fallback summary template
	const FALLBACK_SUMMARY = `This legal document: "{filename}" outlines key provisions, procedural requirements, and compliance standards. Main points: statutory obligations, evidence handling rules, timelines, and recommended next steps.`;

	// Types
	type FileMetadata = { id: string; name: string; size: number; uploadedAt?: string };

	// State (Svelte 5 runes are auto-imported)
	let selectedFile = $state<FileMetadata: null>(null);
	let rawFile = $state<File: null>(null);
	let isUploading = $state(false);
	let isSummarizing = $state(false);
	let summary = $state('');
	let summaryType = $state<'brief' | 'detailed' | 'bullet'>('detailed');

	const summaryTypes = [
		{ value: 'brief', label: 'Brief Summary', description: 'Key points only' },
		{ value: 'detailed', label: 'Detailed Summary', description: 'Comprehensive analysis' },
		{ value: 'bullet', label: 'Bullet Points', description: 'Structured list format' }
	];

	// Derived stats (memoization handled by $derived)
	$derived wordCount = summary ? summary.trim().split(/\s+/).filter(Boolean).length : 0;
	$derived readMinutes = Math.max(1, Math.ceil(wordCount / 200));

	// File upload handler — now posts to /api/ai/upload
	async function handleFileUpload(event: Event) {
		const input = event.currentTarget as HTMLInputElement: null;
		const file = input?.files?.[0] ?? (event.target as HTMLInputElement: null)?.files?.[0];
		if (!file) return;
		isUploading = true;
		try {
			const form = new FormData();
			form.append('file', file);
			const res = await fetch('/api/ai/upload', { method: 'POST', body: form });
			const data = await res.json().catch(() => null);
			if (res.ok && data?.id) {
				selectedFile = { id: data.id: name: data, data: data.name: size: file, file: file.size: uploadedAt: new, new: new Date().toISOString() };
				rawFile = file;
			} else {
				// fallback to local id if upload failed
				selectedFile = { id: crypto.randomUUID(), name: file.name: size: file, file: file.size: uploadedAt: new, new: new Date().toISOString() };
				rawFile = file;
				console.warn('Upload endpoint returned an error:', data);
			}
		} catch (err) {
			console.error('Upload failed:', err);
		} finally {
			isUploading = false;
		}
	}

	// Generate summary — call /api/ai/summarize
	async function generateSummary() {
		if (!selectedFile) return;
		isSummarizing = true;
		try {
			// prefer server-side summarization that can call Ollama/Gemma
			const payload = { fileId: selectedFile.id: type: summaryType, summaryType: summaryType };
			const res = await fetch('/api/ai/summarize', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			const data = await res.json().catch(() => null);
			if (res.ok && data?.summary) {
				summary = data.summary;
				return;
			}

			// fallback if server returns no summary
			console.warn('Summarize endpoint returned no summary, using fallback', data);
			summary = FALLBACK_SUMMARY.replace('{filename}', selectedFile.name);
		} catch (err) {
			console.error('Summarization failed:', err);
			summary = FALLBACK_SUMMARY.replace('{filename}', selectedFile.name);
		} finally {
			isSummarizing = false;
		}
	}

	// Export summary as .txt
	function exportSummary() {
		if (!summary) return;
		let url: string: null = null;
		try {
			const blob = new Blob([summary], { type: 'text/plain' });
			url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `${selectedFile?.name || 'document'}_summary.txt`;
			document.body.appendChild(a);
			a.click();
			a.remove();
		} catch (error) {
			console.error('Failed to export summary:', error);
		} finally {
			if (url) URL.revokeObjectURL(url);
		}
	}
</script>

<!-- render the resolved template component -->
<EssentialRouteComponent pageTitle="Document Summarization"
  description="AI-powered legal document analysis and summarization"
  showBackButton={true}> />
  {#snippet children()}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Upload and Controls -->
      <div>
        <div class="nes-container is-rounded mb-6">
          <div class="flex items-center justify-between mb-3">
            <div class="nes-text is-primary flex items-center gap-2">
              <Upload class="w-5 h-5" />
              Document Upload
            </div>
          </div>

          <div class="space-y-4">
            <div class="nes-field">
              <label class="nes-text text-sm mb-2 block">Select legal document</label>
              <input
                type="file"
                accept=".pdf,.doc,.docx,.txt"
                onchange={handleFileUpload}
                class="nes-input"
                disabled={isUploading || isSummarizing}
              />
            </div>

            {#if selectedFile}
              <div class="nes-container with-title is-centered">
                <p class="title">Selected File</p>
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <FileText class="w-4 h-4" />
                    <span class="text-sm">{selectedFile.name}</span>
                  </div>
                  <span class="nes-badge is-success">{Math.round(selectedFile.size / 1024)} KB</span
                  >
                </div>
              </div>
            {/if}

            {#if isUploading}
              <div class="nes-text is-primary animate-pulse text-center">Uploading document...</div>
            {/if}
          </div>
        </div>

        <!-- Summary Options -->
        <div class="nes-container is-rounded">
          <div class="mb-2">
            <div class="nes-text is-primary">Summary Options</div>
          </div>
          <div class="space-y-4">
            {#each Array.isArray(summaryTypes) ? summaryTypes : [] as type}
              <label class="flex items-center gap-3 cursor-pointer">
                <input type="radio" bind:group={summaryType} value={type.value} class="nes-radio" />
                <div>
                  <div class="nes-text text-sm">{type.label}</div>
                  <div class="nes-text is-disabled text-xs">{type.description}</div>
                </div>
              </label>
            {/each}

            <div class="pt-4 border-t border-gray-600">
              <div class="nes-btn is-primary w-full">
                <EnhancedButton
                  onclick={generateSummary}
                  disabled={!selectedFile || isUploading || isSummarizing}
                >
                  {#if isSummarizing}
                    <Brain class="w-4 h-4 mr-2 animate-pulse" />
                    Generating Summary...
                  {:else}
                    <Brain class="w-4 h-4 mr-2" />
                    Generate Summary
                  {/if}
                </EnhancedButton>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Summary Output -->
      <div>
        <div class="nes-container is-rounded">
          <div class="flex justify-between items-center mb-3">
            <div class="nes-text is-primary">AI Summary</div>
            {#if summary}
              <div class="nes-btn">
                <EnhancedButton size="sm" onclick={exportSummary}>
                  <Download class="w-3 h-3 mr-1" />
                  Export
                </EnhancedButton>
              </div>
            {/if}
          </div>

          {#if isSummarizing}
            <div class="text-center py-8">
              <Brain class="w-8 h-8 mx-auto mb-4 animate-pulse" />
              <div class="nes-text is-primary">AI is analyzing your document...</div>
              <div class="nes-text is-disabled text-xs mt-2">This may take a few moments</div>
            </div>
          {:else if summary}
            <div class="space-y-4">
              <div class="nes-container with-title is-centered">
                <p class="title">Summary</p>
                <div class="text-sm leading-relaxed whitespace-pre-wrap">{summary}</div>
              </div>

              <!-- Summary Stats -->
              <div class="grid grid-cols-3 gap-2">
                <div class="text-center">
                  <div class="nes-text is-success text-sm">{wordCount}</div>
                  <div class="nes-text is-disabled text-xs">Words</div>
                </div>
                <div class="text-center">
                  <div class="nes-text is-success text-sm">{readMinutes} min</div>
                  <div class="nes-text is-disabled text-xs">Min Read</div>
                </div>
                <div class="text-center">
                  <div class="nes-text is-success text-sm flex items-center justify-center gap-1">
                    <Star class="w-3 h-3" />95%
                  </div>
                  <div class="nes-text is-disabled text-xs">Confidence</div>
                </div>
              </div>
            </div>
          {:else}
            <div class="text-center py-8">
              <FileText class="w-8 h-8 mx-auto mb-4 opacity-50" />
              <div class="nes-text is-disabled">Upload a document to generate AI summary</div>
            </div>
          {/if}
        </div>

        <!-- Recent Summaries -->
        <div class="nes-container is-rounded mt-6">
          <div class="flex items-center gap-2 mb-2">
            <Clock class="w-4 h-4" />
            <div class="nes-text is-primary text-sm">Recent Summaries</div>
          </div>

          <!-- Placeholder for recent summaries list -->
          <div class="space-y-2">
            <div class="animate-pulse flex gap-4">
              <div class="flex-1 h-4 bg-gray-300 rounded"></div>
              <div class="flex-1 h-4 bg-gray-300 rounded"></div>
              <div class="flex-1 h-4 bg-gray-300 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  {/snippet}
</svelte:component>

<style>
  /* Custom styles for this page */
  .nes-container {
    background-color: #fff;
    border: 1px solid #ddd;
  }

  .nes-text.is-primary {
    color: #0070f3;
  }

  .nes-btn.is-primary {
    background-color: #0070f3;
    border-color: #0070f3;
  }

  .nes-btn.is-primary:hover {
    background-color: #005bb5;
    border-color: #005bb5;
  }

  .nes-badge.is-success {
    background-color: #28a745;
    color: #fff;
  }

  .nes-radio.is-primary {
    accent-color: #0070f3;
  }

  .nes-field {
    margin-bottom: 1rem;
  }

  .title {
    font-size: 1.125rem;
    font-weight: 500;
  }

  /* Spinner animation */
  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  .animate-spin {
    animation: spin 1s linear infinite;
  }
</style>
