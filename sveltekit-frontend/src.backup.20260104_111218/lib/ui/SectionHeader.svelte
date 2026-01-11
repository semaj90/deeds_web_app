<script lang="ts">
 let { title = "", subtitle = "" } = $props();
</script>

<div class="mb-6">
 <h2 class="font-mono tracking-wide text-lg text-ink">{title}</h2>
 {#if subtitle}
 <p class="font-serif text-sm opacity-70 text-ink/80">{subtitle}</p>
 {/if}
</div>
