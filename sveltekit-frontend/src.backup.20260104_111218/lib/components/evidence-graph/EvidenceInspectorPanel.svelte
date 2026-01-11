<script lang="ts">
 let { evidence, open = false } = $props();
</script>

<div class="fixed right-0 top-0 h-full w-[28rem] bg-gray-950 text-white p-5 nes-container with-title"
 class:translate-x-full={!open}
 style="transition: 300ms;">
 <p class="title text-cyan-300">Evidence Inspector</p>

 <h2 class="text-amber-300 text-xl mb-2">{evidence.fileName}</h2>

 <p class="text-sm opacity-80">Case: {evidence.caseId}</p>
 <p class="text-sm opacity-80">Type: {evidence.type}</p>
 <p class="text-sm opacity-80">Uploaded: {evidence.createdAt}</p>

 <hr class="my-3 border-cyan-800"/>

 <h3 class="text-cyan-400 mb-1">Extracted Text</h3>
 <pre class="text-xs bg-black p-2 rounded border border-gray-600 overflow-auto h-40">
{evidence.extractedText}
 </pre>

 <h3 class="text-cyan-400 mt-4">Legal Flags</h3>
 {#each evidence.legalFlags as f}
 <span class="nes-badge my-1"><span class="is-success">{f}</span></span>
 {/each}
</div>
