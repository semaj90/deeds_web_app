<script lang="ts">

 let { evidence, open = false } = $props();
</script>

<div class="fixed right-0 top-0 h-full w-[28rem] bg-panel text-white p-5 nes-container with-title"
 class:translate-x-full={!open}
 style="transition:300ms;">
 <p class="title text-info/80">Evidence Inspector</p>

 <h2 class="text-warning/80 text-xl mb-2">{evidence.fileName}</h2>

 <p class="text-sm opacity-80">Case: {evidence.caseId}</p>
 <p class="text-sm opacity-80">Type: {evidence.type}</p>
 <p class="text-sm opacity-80">Uploaded: {evidence.createdAt}</p>

 <hr class="my-3 border-info/30"/>

 <h3 class="text-info mb-1">Extracted Text</h3>
 <pre class="text-xs bg-black p-2 rounded border border-sand/30 overflow-auto h-40">
{evidence.extractedText}
 </pre>

 <h3 class="text-info mt-4">Legal Flags</h3>
 {#each evidence.legalFlags as f}
 <span class="nes-badge my-1"><span class="is-success">{f}</span></span>
 {/each}
</div>


