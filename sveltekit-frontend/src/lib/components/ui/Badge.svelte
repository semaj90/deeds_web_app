<!--
 Badge Component - Svelte 5 + UnoCSS
 Status badges and labels
-->
<script lang="ts">
 import type { Snippet } from 'svelte';

 interface Props {
 variant?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline';
 size?: 'sm' | 'md' | 'lg';
 class?: string;
 children?: Snippet;
 }

 let {
 variant = 'default',
 size = 'md',
 class: className = '',
 children
 }: Props = $props();

 const variantStyles = {
 default: 'bg-gray-600/50 text-gray-200 b b-gray-500/30',
 primary: 'bg-blue-600/50 text-blue-200 b b-blue-500/30',
 secondary: 'bg-purple-600/50 text-purple-200 b b-purple-500/30',
 success: 'bg-green-600/50 text-green-200 b b-green-500/30',
 warning: 'bg-yellow-600/50 text-yellow-200 b b-yellow-500/30',
 destructive: 'bg-red-600/50 text-red-200 b b-red-500/30',
 outline: 'bg-transparent text-gray-300 b b-gray-500'
 };

 const sizeStyles = {
 sm: 'px-1.5 py-0.5 text-xs',
 md: 'px-2 py-1 text-xs',
 lg: 'px-3 py-1.5 text-sm'
 };
</script>

<span class="inline-flex items-center rounded-full font-medium {variantStyles[variant]} {sizeStyles[size]} {className}">
 {#if children}
 {@render children()}
 {/if}
</span>


