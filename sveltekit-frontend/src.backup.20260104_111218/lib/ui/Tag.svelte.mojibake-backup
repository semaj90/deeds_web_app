<script lang="ts">
  let { color = 'default' } = $props<{
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
  <slot />
</span>
