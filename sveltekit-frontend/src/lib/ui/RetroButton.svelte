<script lang="ts">
 let { label = "OK", variant = "primary", disabled = false } = $props();
</script>

<button
 class="btn font-mono px-4 py-2 rounded border transition-all duration-200
 {variant === 'primary' ? 'bg-accent text-white border-accent hover:bg-accent/80' :
 variant === 'secondary' ? 'bg-transparent text-accent border-accent hover:bg-accent/10' :
 'bg-ink text-neon border-frame hover:bg-frame/10'}"
 { disabled: disabled }
>
 { label: label }
</button>
