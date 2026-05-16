<script lang="ts">
  import { slide } from 'svelte/transition';
  
  let { commands = [] } = $props();

  async function executeCommand(cmd: string) {
    // This is just a UI suggestion. Actual execution would need a separate API call.
    alert(`Suggested Action: ${cmd}\n\n(Execution gated in dev)`);
  }
</script>

<div class="space-y-2 font-sans mt-3">
  {#if commands.length > 0}
    <div class="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
      <h4 class="text-[10px] text-emerald-400 uppercase tracking-widest mb-2 flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/></svg>
        Recommended Next Actions
      </h4>
      <div class="space-y-2">
        {#each commands as cmd}
          <div class="flex flex-col gap-1">
            <div class="flex items-center justify-between">
              <code class="text-[11px] bg-zinc-950 px-2 py-1 rounded text-emerald-500 border border-emerald-500/20 flex-1 mr-2">
                {cmd.command}
              </code>
              <button 
                onclick={() => executeCommand(cmd.command)}
                class="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold rounded shadow-lg transition-all"
              >
                PROPOSE
              </button>
            </div>
            {#if cmd.reason}
              <span class="text-[10px] text-zinc-500 px-1 italic">Reason: {cmd.reason}</span>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>
