<script lang="ts">
 let { type = "document", variant = "default" } = $props();
</script>

<span class="px-2 py-1 rounded-box text-xs font-mono border
 {variant === 'evidence' ? 'bg-red-500/20 text-red-300 border-red-500/50' :
 variant === 'testimony' ? 'bg-blue-500/20 text-blue-300 border-blue-500/50' :
 variant === 'timeline' ? 'bg-green-500/20 text-green-300 border-green-500/50' , 'bg-frame/10 text-ink border-frame/20'}">
 {type.toUpperCase()}
</span>


