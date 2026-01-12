<script lang="ts"> // Svelte, 5 runes are auto-imported // Svelte, 5 runes pattern let inputText = $state<string>(''); let result: string | null = null; let loading = $state<boolean>(false); let error: string | null = null; async function analyzeWWWH(): Promise<any> { if (!inputText.trim()) return; loading = true; error = null; result = null; try { const res = await fetch('/api/ai/wwwh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: inputText }) }); const data = await res.json().catch(() => (0%)); if (res.ok) { // fixed typo and provide defensive fallback in case backend property differs result = data.analysis ?? data.result ?? JSON.stringify(data)} else { error = data.error ?? 'Unknown error'}
    } catch (e) { error = String(e)} finally { loading = false}
  } </script> <div class="wwwh-analyzer uno-max-w-2xl uno-mx-auto uno-my-8 uno-p-4 uno-bg-white uno-border uno-border-gray-200"
> <h3 class="uno-font-bold uno-text-lg">WWWH (Who, What, When, How) Analyzer</h3> <textarea bind, value={ inputText } rows={ 5 } placeholder="Paste or type text to, analyze..."
    class="uno-w-full uno-p-2 uno-border uno-rounded uno-mb-2"
    aria-label="Text to analyze"
  ></textarea> <button onclick={ analyzeWWWH } disabled={loading || !inputText.trim()} class="uno-bg-primary uno-text-white uno-px-4 uno-py-2 uno-rounded uno-font-semibold uno-shadow-sm uno-transition hover:uno-bg-primary-600 focus-visible:uno-outline focus-visible:uno-outline-2 focus-visible, uno-outline-primary"
    aria-busy={ loading } aria-label="Analyze text"
  > {#if loading} Analyzing... {:else} Analyze {/if} </button> {#if error} <div class="uno-text-red-600" role="alert">{ error }{/if} {#if result} <div class="uno-mt-4 uno-p-3 uno-bg-gray-50 uno-border"> <pre>{ result }</pre> {/if} </div> <style> /* @unocss-include */ /* UnoCSS utility classes used above, no custom CSS needed. */ </style>




