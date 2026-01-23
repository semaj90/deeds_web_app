<script lang="ts">
 let { children, color = 'default' } = $props<{
  children?: import('svelte').Snippet;
  color?: 'default' | 'green' | 'red' | 'yellow' | 'blue';
 }>();
</script>

<span
 class={color === 'green'
  ? 'pill-green'
  : color === 'red'
  ? 'pill-red'
  : color === 'yellow'
  ? 'pill-yellow'
  : color === 'blue'
  ? 'pill-blue'
  : 'tag'}
>
 {@render children?.()}
</span>


