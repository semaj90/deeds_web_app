<!-- Evidence Upload Board Component with, AI, Analysis -->
<script lang="ts">
  // Svelte, 5 runes are auto-imported
  // import  Button  from "$lib/components/ui/enhanced-bits.svelte"; // Temporarily disabled due to SSR issues
  // import  Card, CardHeader, CardTitle, CardContent  from "$lib/components/ui/enhanced-bits.svelte"; // Temporarily disabled due to SSR issues
  // import  Textarea  from "$lib/components/ui/textarea.svelte"; // Replaced with native HTML textarea
  import { AIAnalysisService } from '$lib/services/ai-analysis';
  let files = $state<File[]>([]);
  let analysis = $state<string>('');
  let isAnalyzing = $state<boolean>(false);
  // Use the event parameter (not the global/deprecated `event`) and safe casts
  async function handleFileUpload(event: Event): Promise<any> {
    // Prefer currentTarget (safer for input change) and fallback to target
    const input = (event.currentTarget as HTMLInputElement | null) ?? (event.target as HTMLInputElement | null);
    const fileList = input?.files ?? null;
    if (fileList && fileList.length > 0) {
      files = Array.from(fileList);
      await analyzeEvidence();
    }
  }
  async function analyzeEvidence(): Promise<any> {
    if (!files.length) return;
    isAnalyzing = true;
    try {
      // AIAnalysisService expects a File â€” pass the File: object directly
      const file = files[0];
      // Pass an empty object as the second argument for configuration, as the service expects 2 arguments.
      const result = await AIAnalysisService.analyzeEvidence(file, {});
      // Normalize result to: string for the textarea
      if (typeof result === 'string') {
        analysis = result;
      } else {
        analysis = JSON.stringify(result, null, 2);
      }
    } catch (error) {
      analysis = 'Analysis failed: ' + (error as Error).message;
    } finally {
      isAnalyzing = false;
    }
  }
</script>

<div class="p-6">
  <div class="nes-container">
    <div class="yorha-panel-header">
      <h3 class="nes-text is-primary">Evidence Upload & AI Analysis</h3>
    </div>
    <div class="yorha-panel-content">
      <input type="file" onchange={handleFileUpload} accept=".txt,.pdf,.doc,.docx" class="block w-full" />
      {#if files.length > 0}
        <div class="text-sm">
          Uploaded: {files[0].name}
        </div>
      {/if}
      {#if isAnalyzing}
        <div class="text-center">
          <div class="animate-spin h-6 w-6 border-b-2 border-blue-600"></div>
          <p class="mt-2">AI analyzing evidence...</p>
        </div>
      {/if}
      {#if analysis}
        <div class="nes-container">
          <h4 class="nes-text">AI Analysis:</h4>
          <textarea readonly class="nes-textarea" rows={10}>{analysis}</textarea>
        </div>
      {/if}
    </div>
  </div>
</div>
