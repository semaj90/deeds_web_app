<script lang="ts">
  let { clickable = false, onclick } = $props<{
    clickable?: boolean;
    onclick?: (() => void) | undefined;
  }>();
</script>

<div
  class="panel-soft p-4 {clickable ? 'cursor-pointer hover:bg-panel' : ''}"
  role={clickable ? 'button' : undefined}
  tabindex={clickable ? 0 : undefined}
  onclick={onclick}
  onkeydown={(e) => {
    if (clickable && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onclick?.();
    }
  }}
>
  <slot />
</div>
