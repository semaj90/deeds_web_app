<script lang="ts">
 let { children, disabled = false, variant = 'primary', type = 'button', onclick } = $props<{
  children?: import('svelte').Snippet;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  type?: 'button' | 'submit';
  onclick?: (e: MouseEvent) => void;
 }>();
</script>

<button
 { type }
 { disabled }
 { onclick }
 class={variant === 'primary'
 ? 'btn-primary'
 : variant === 'secondary'
 ? 'btn-secondary'
 : 'btn-danger'}
>
 {@render children?.()}
</button>


