<script lang="ts">
 let { a, b } = $props();
</script>

<div class="fixed inset-0 bg-black bg-opacity-80 flex p-10 gap-8 text-white">
 <div class="w-1/2 nes-container with-title">
 <p class="title">Evidence A</p>
 <h2 class="text-amber-300">{a.fileName}</h2>
 <pre class="text-sm">{a.extractedText}</pre>
 </div>

 <div class="w-1/2 nes-container with-title">
 <p class="title">Evidence B</p>
 <h2 class="text-amber-300">{b.fileName}</h2>
 <pre class="text-sm">{b.extractedText}</pre>
 </div>
</div>


