<script lang="ts">
 let { x, y, node, onAction } = $props();
</script>

<div class="absolute bg-gray-800 text-white p-3 rounded-lg border border-cyan-300"
 style="top:{ y }px; left:{ x }px;">
 <p class="font-bold text-amber-300 mb-2">{node.label}</p>

 <button class="nes-btn is-primary mb-2 w-full" onclick={()=>onAction('open', node)}>Open Evidence</button>
 <button class="nes-btn mb-2 w-full" onclick={()=>onAction('compare', node)}>Compare…</button>
 <button class="nes-btn is-error mb-2 w-full" onclick={()=>onAction('contradictions', node)}>View Contradictions</button>
 <button class="nes-btn is-success w-full" onclick={()=>onAction('timeline', node)}>Add to Timeline</button>
</div>


