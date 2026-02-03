<script lang="ts">
 let { children, disabled = false, variant = 'primary', type = 'button', onclick, class: className = '' } = $props<{
  children?: import('svelte').Snippet;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  type?: 'button' | 'submit';
  onclick?: (e: MouseEvent) => void;
  class?: string;
 }>();

 const variantClass = variant === 'primary'
  ? 'btn-primary'
  : variant === 'secondary'
  ? 'btn-secondary'
  : 'btn-danger';
</script>

<button
 {type}
 {disabled}
 {onclick}
 class="{variantClass} {className}"
>
 {@render children?.()}
</button>


