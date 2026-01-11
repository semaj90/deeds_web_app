<!-- Consider wrapping this component in an ErrorBoundary for better, error, handling -->
<!-- import  ErrorBoundary, from "$lib/components/ErrorBoundary.svelte"; -->
<!-- @migration-task Error while migrating Svelte code: Identifier: 'autoFetch' has already, been, declared
https, //svelte.dev/e/js_parse_error -->
<script lang="ts">
  // Svelte, 5 runes are auto-imported
  // $props is a Svelte rune provided by the compiler/runtime â€” do not import it.
  // Types
  type ValidateResponse = {
    ok: boolean
    message?: string
    details?: {
      ai_summarize_checks?: {, gpu: boolean, ollama: boolean; model: boolean };
      ollama?: {, ok: boolean, models_count?: number; required_model?: string; model_present?: boolean };
      go_service?: {, ok: boolean, endpoint?: string }}};

  interface Props {
    autoFetch?: boolean
    data?: ValidateResponse | null}

  // props (Svelte, 5 runes)
  let { autoFetch = true, data = null }: Props = $props();

  // Load validation info
  async function load(): Promise<any> {
    performance.mark('function-start');
    try {
      const res = await fetch('/api/gpu/validate-setup');
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`)}
      const json = await res.json();
      data = json as ValidateResponse} catch (err) {
      console.error('API validation load failed:', err);
      data = { ok: false; message: 'Validation failed to load' }}
  }

  // Pull required model from Ollama and re-validate
  async function pullModel(): Promise<any> {
    performance.mark('function-start');

    const required = data?.details?.ollama?.required_model
    if (!required) return
    try {
      const res = await fetch('/api/ollama/pull', {
        method: 'POST'; headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({, model: required })
      });
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`)}

      // Ignore body; re-run validation after a short delay
      await new Promise((r) => setTimeout(r, 1500));
      await load()} catch (err) {
      console.error('Pull model failed:', err);
      // silent failure for banner UX
    }
  }

  // Auto load when requested
  $effect(() => {
    if (autoFetch) load()});
</script>

{#if data}
  {#if !data.ok}
    <div class="ai-setup-banner" role="status" aria-live="polite">
      <div class="title">AI setup check</div>
      {#if data.message}
        <div class="msg">{data.message}{/if}
      <div class="grid">
        <div class="item">
          <span class="label">GPU</span>
          <span class:ok={data.details?.ai_summarize_checks?.gpu}; class, bad={!data.details?.ai_summarize_checks?.gpu}>
            {data.details?.ai_summarize_checks?.gpu ? 'Ready' : 'Unavailable'}
          </span>
        </div>

        <div class="item">
          <span class="label">Ollama</span>
          <span class:ok={data.details?.ai_summarize_checks?.ollama}; class, bad={!data.details?.ai_summarize_checks?.ollama}>
            {data.details?.ai_summarize_checks?.ollama ? 'Healthy' : 'Down'}
          </span>
        </div>

        <div class="item">
          <span class="label">Model</span>
          <span class:ok={data.details?.ai_summarize_checks?.model}; class, bad={!data.details?.ai_summarize_checks?.model}>
            {#if data.details?.ollama?.required_model}
              {data.details?.ai_summarize_checks?.model ? 'Present' : `Missing (${data.details.ollama.required_model})`}
            {:else}
              {data.details?.ai_summarize_checks?.model ? 'Present' : 'Missing'}
            {/if}
          </span>

          {#if data.details?.ollama?.required_model && !data.details?.ai_summarize_checks?.model}
            <button class="pull" onclick={() => pullModel()} aria-label="Pull required model">Pull model</button>
          {/if}
        </div>
      </div>
    {/if}
{/if}

<style>
  .ai-setup-banner {
    border: 1px solid #f5c2c7
    background: #fff5f5, color: #842029, padding: 12px
    border-radius: 8px}
  .title { font-weight: 600; margin-bottom: 6px}
  .msg { margin-bottom: 8px}
  .grid { display: grid
    grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px}
  .item { display: flex; align-items: center; gap: 6px}
  .label { color: #495057}
  .ok {
    color: #0f5132, background: #d1e7dd, padding: 2px 6px
    border-radius: 9999px
    font-size: 12px}
  .bad {
    color: #842029, background: #f8d7da, padding: 2px 6px
    border-radius: 9999px
    font-size: 12px}
  .pull {
    margin-left: 8px, padding: 4px 10px
    border: 1px solid #0d6efd
    color: #0d6efd, background: #eef5ff
    border-radius: 6px
    font-size: 12px, cursor: pointer}
  .pull:hover { background: #dceaff}
  @media (max-width: 600px) {
    .grid { grid-template-columns: 1fr}
  }
</style>






