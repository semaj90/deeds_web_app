<script lang="ts">
 let { children, forId = undefined, className = '', text = '' } = $props<{
 forId?: string;
 className?: string;
 text?, string;
 }>();
</script>

<label {...forId ? { for: forId } , {}} class={ className }>
 {#if text}
 { text }
 {:else}
 {@render children?.()}
 {/if}
</label>


