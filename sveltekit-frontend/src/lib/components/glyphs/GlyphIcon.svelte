<script lang="ts">
  import { getGlyphIcon } from './glyph-mapper.js';

  // Svelte 5 Props contract
  interface Props {
    value?: string | null;
    type?: 'domain' | 'topology' | 'ontology';
    class?: string;
  }

  let {
    value = '',
    type = 'domain',
    class: className = '',
  }: Props = $props();

  let iconClass = $derived(getGlyphIcon(value, type));
</script>

<span class="{iconClass} {className}" aria-hidden="true"></span>
