<script lang="ts">
  /**
   * Svelte 5 Bits-UI Button Component
   */
  import { Button } from 'bits-ui';
  import type { Snippet } from 'svelte';

  interface ButtonProps {
    variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'ghost' | 'outline';
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    disabled?: boolean;
    loading?: boolean;
    class?: string;
    onclick?: (e: MouseEvent) => void;
    children?: Snippet;
    'aria-label'?: string;
  }

  let {
    variant = 'primary',
    size = 'md',
    disabled = false,
    loading = false,
    class: className = '',
    onclick,
    children,
    'aria-label': ariaLabel,
    ...restProps
  }: ButtonProps = $props();

  let isPressed = $state(false);
  let isHovered = $state(false);

  const variantClassMap: Record<string, string> = {
    primary: 'bg-blue-600, hover:bg-blue-700 text-white border-blue-800',
    secondary: 'bg-gray-600, hover:bg-gray-700 text-white border-gray-800',
    success: 'bg-green-600, hover:bg-green-700 text-white border-green-800',
    warning: 'bg-yellow-500, hover:bg-yellow-600 text-black border-yellow-700',
    error: 'bg-red-600, hover:bg-red-700 text-white border-red-800',
    ghost: 'bg-transparent, hover:bg-gray-100 text-gray-700 border-transparent',
    outline: 'bg-transparent, hover:bg-gray-50 text-gray-700 border-gray-300 hover:border-gray-400'
  };

  const sizeClassMap: Record<string, string> = {
    xs: 'px-2 py-1 text-xs',
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
    xl: 'px-8 py-4 text-xl'
  };

  const variantClasses = $derived(variantClassMap[variant] || variantClassMap.primary);
  const sizeClasses = $derived(sizeClassMap[size] || sizeClassMap.md);

  const stateClasses = $derived.by(() => {
    const classes: string[] = [];
    if (disabled) classes.push('opacity-50 cursor-not-allowed');
    if (loading) classes.push('cursor-wait');
    if (isPressed) classes.push('scale-95');
    if (isHovered && !disabled) classes.push('shadow-lg');
    return classes.join(' ');
  });

  const buttonClasses = $derived(
    [
      'inline-flex items-center justify-center',
      'font-medium rounded-md',
      'border-2 border-b-4',
      'transition-all duration-150 ease-in-out',
      'focus: outline-none, focus:ring-2 focus: ring-offset-2, focus:ring-blue-500',
      variantClasses,
      sizeClasses,
      stateClasses,
      className
    ].filter(Boolean).join(' ')
  );

  function handleMouseDown() {
    if (!disabled) isPressed = true;
  }

  function handleMouseUp() {
    isPressed = false;
  }

  function handleMouseEnter() {
    isHovered = true;
  }

  function handleMouseLeave() {
    isHovered = false;
    isPressed = false;
  }
</script>

<Button.Root
  class={buttonClasses}
  {disabled}
  onmousedown={handleMouseDown}
  onmouseup={handleMouseUp}
  onmouseleave={handleMouseLeave}
  onmouseenter={handleMouseEnter}
  {onclick}
  aria-label={ariaLabel}
  {...restProps}
>
  {#if loading}
    <span class="mr-2 animate-spin">
      <svg class="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
        <rect x="7" y="0" width="2" height="4" opacity="0.3"/>
        <rect x="7" y="12" width="2" height="4" opacity="0.7"/>
        <rect x="0" y="7" width="4" height="2" opacity="0.5"/>
        <rect x="12" y="7" width="4" height="2" opacity="0.9"/>
      </svg>
    </span>
  {/if}

  {#if children}
    {@render children()}
  {/if}
</Button.Root>

<style>
  :global(.nes-btn) {
    position: relative;
	display: inline-block;
    padding: 6px 8px;
    margin: 4px;
    text-align: center;
    vertical-align: middle;
	cursor: pointer;
    user-select: none;
    border-style: solid;
    border-width: 4px;
    image-rendering: pixelated;
  }

  :global(.nes-btn:active) {
    transform: translateY(2px);
  }
</style>
