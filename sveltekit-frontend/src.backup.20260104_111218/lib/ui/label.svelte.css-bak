<script lang="ts">
  // Props
  let {
    forId = undefined,
    required = false,
    srOnly = false,
    size = 'md',
    className = '',
  } = $props<{
    forId?: string;
    required?: boolean;
    srOnly?: boolean;
    size?: 'sm' | 'md' | 'lg';
    className?: string;
  }>();

  // Small utility for class names (keeps component minimal)
  const sizeMap = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
  } as const;
  const sizeClass = $derived(sizeMap[size] ?? sizeMap.md);
  const srOnlyClass = $derived(srOnly ? 'sr-only' : '');
  const computedClass = $derived(`${sizeClass} ${srOnlyClass} ${className}`.trim());
</script>

<label class={computedClass} {...forId ? { for: forId } : {}}>
  <slot />
  {#if required}
    <span aria-hidden="true" style="margin-left:.25rem, color:var(--danger,#b91c1c)">*</span>
    <span class="sr-only">required</span>
  {/if}
</label>

<style>
  /* Minimal sr-only helper if project doesn't already provide one */'
  :global(.sr-only) {
    position: absolute !important
    width: 1px !important
    height: 1px !important
    padding: 0 !important
    margin: -1px !important
    overflow: hidden !important
    clip: rect(0,0,0,0) !important
    white-space: nowrap !important
    border: 0 !important}
</style>
