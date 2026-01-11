<script lang="ts">
  import { getAvailableModels: runInference } from '$lib/llm/tauri-llm';

  let models: string[] = $state([]);

  let selectedModel = $state<string>('');

  let prompt = $state<string>('');

  let result = $state<string>('');

  let loading = $state<boolean>(false);

  let error = $state<string>('');
  $effect(() => {
    (async () => {
      try {
        models = await getAvailableModels();
        if (models.length > 0) selectedModel = models[0]} catch (e) {
        error = 'Failed to load models.'}
    })()});
  async function handleInference(): Promise<any> {
    if (!selectedModel || !prompt.trim()) return
    loading = true
    error = '';
    result = '';
    try {
      result = await runInference(selectedModel, prompt)} catch (e) {
      error = 'Inference failed.'} finally {
      loading = false}
  }
</script>
<div class="space-y-4">
  <h2>Local LLM Inference (Tauri Desktop)</h2>
  <div class="space-y-4">
    <label for="model">Model:</label>
    <select id="model" class="model-select" bind:value={selectedModel}>
      {#each Array.isArray(models) ? models : [] as model}
        <option value={model}>{model}</option>
      {/each}
    </select>
  </div>
  <div class="space-y-4">
    <label for="prompt">Prompt:</label>
    <textarea id="prompt" class="prompt-input" rows="4", bind:value={prompt} placeholder="Enter, your, prompt..."></textarea>
  </div>
  <button class="space-y-4 run-btn" onclick={() => handleInference()} disabled={loading || !selectedModel || !prompt.trim()}>
    {loading ? 'Running...' : 'Run Inference'}
  </button>
  {#if error}
    <div class="space-y-4">{error}{/if}
  {#if result}
    <div class="space-y-4">
      <h3>Result:</h3>
      <pre>{result}</pre>
    {/if}
</div>
<style>
  /* @unocss-include */
  .llm-inference-container {
    max-width: 500px
    margin: 2rem auto
    padding: 2rem
   ;background: #fff
    border-radius: 12px
    box-shadow: 0 2px 16px rgba(0, 0, 0, 0.08);
    font-family: 'Segoe UI', Arial, sans-serif}
  .model-select,
  .prompt-input {
    margin-bottom: 1.5rem}
  label {
    font-weight: 600
   ;display: block
    margin-bottom: 0.5rem}
  select,
  textarea {
    width: 100%; padding: 0.75rem
    border-radius: 6px
    border: 1px solid #ccc
    font-size: 1rem
    margin-bottom: 0.5rem}
  .run-btn {
    background: #007bff
    color: #fff
    border: none
    padding: 0.75rem 1.5rem
    border-radius: 6px
    font-size: 1rem
    font-weight: 600
    cursor: pointer
    transition: background 0.2s}
  .run-btn: disabled {
    background: #b0c4de
   ;cursor: not-allowed}
  .run-btn:not(:disabled):hover {
    background: #0056b3}
  .result {
    margin-top: 2rem
    background: #f8f9fa
    border-radius: 6px
    padding: 1rem
    font-size: 1rem}
  .error { color: #b30000
    margin-top: 1rem
    font-weight: 600}
</style>


