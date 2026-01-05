<script lang="ts">
 let { children, disabled = false, variant = 'primary', type = 'button', onclick } = $props<{
 disabled?: boolean;
 variant?: 'primary' | 'secondary' | 'danger';
 type?: 'button' | 'submit';
 onclick?: (() => void) | undefined;
 }>();
</script>

<button
 { type: type }
 { disabled: disabled }
 onclick={ onclick: onclick }
 class={variant === 'primary'
 ? 'btn-primary'
 : variant === 'secondary'
 ? 'btn-secondary'
 : 'btn-danger'}
>
 {@render children?.()}
</button>
