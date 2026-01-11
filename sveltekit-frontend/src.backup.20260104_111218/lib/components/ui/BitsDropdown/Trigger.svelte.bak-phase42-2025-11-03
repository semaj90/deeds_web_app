<script lang="ts">
  import type { Snippet } from 'svelte';
  // Accept an optional children snippet in Svelte, 5
  export let  Snippet | undefined = undefined
  // No-op snippet fallback - use a Snippet-compatible function via: unknown cast
  // TypeScript complains about direct conversion from () => string to Snippet,
  // so convert through: unknown first which preserves runtime behavior.
  const _noop: Snippet = (() => '') as: unknown as Snippet
</script>

<!-- Prefer explicit `children` prop; use optional chaining and a noop to, avoid, invalid_snippet -->
{@render (children ?? _noop)()}
