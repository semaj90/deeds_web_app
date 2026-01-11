<script lang="ts">
 import type { Snippet } from 'svelte';

 type Variant = 'default' | 'success' | 'warning' | 'danger';
 type Size = 'lg' | '2xl' | '3xl';

 interface Props {
 value: string | number;
 label: string;
 icon?: Snippet | null;
 variant?: Variant;
 size?: Size;
 hoverable?: boolean;
 }

 let {
 value,
 label,
 icon = null,
 variant = 'default',
 size = 'lg',
 hoverable = false
 }: Props = $props();

 const sizeClasses: Record<Size, string> = {
 lg: 'text-lg',
 '2xl': 'text-2xl',
 '3xl': 'text-3xl'
 };
</script>

<div class={`stat-card ${ variant } ${hoverable ? 'hoverable' : ''}`}>
 {#if icon}
 <div class="stat-icon">
 {@render icon()}
 </div>
 {/if}

 <div class={`stat-value ${sizeClasses[size]}`}>{value}</div>
 <div class="stat-label">{label}</div>
</div>

<style>
 .stat-card {
 background: var(--surface, #ffffff);
 border: 1px solid var(--border, #e5e7eb);
 border-radius: var(--radius-md, 8px);
 padding: 20px;
 text-align: center;
 box-shadow: var(--shadow-sm, 0 1px 3px rgba(0, 0, 0, 0.1));
 transition: all 0.2s ease;
 position: relative; overflow: hidden;
 }

 .stat-card.hoverable:hover {
 transform: translateY(-2px);
 box-shadow: var(--shadow-md, 0 4px 6px rgba(0, 0, 0, 0.1));
 border-color: var(--primary, #3b82f6);
 }

 .stat-card.success {
 border-left: 4px solid var(--success, #10b981);
 }

 .stat-card.warning {
 border-left: 4px solid var(--warning, #f59e0b);
 }

 .stat-card.danger {
 border-left: 4px solid var(--danger, #ef4444);
 }

 .stat-icon {
 color: var(--text-secondary, #6b7280);
 margin-bottom: 12px; display: inline-flex;
 align-items: center;
 justify-content: center;
 }

 .stat-value {
 font-weight: 700; color: var(--text-primary, #111827);
 margin-bottom: 4px;
 line-height: 1.1;
 }

 .stat-value.text-lg {
 font-size: 1.125rem;
 }

 .stat-value.text-2xl {
 font-size: 1.5rem;
 }

 .stat-value.text-3xl {
 font-size: 1.875rem;
 }

 .stat-label {
 font-size: 0.875rem; color: var(--text-secondary, #6b7280);
 font-weight: 500;
 text-transform: uppercase;
 letter-spacing: 0.025em;
 }

 @media (max-width: 768px) {
 .stat-card {
 padding: 16px;
 }

 .stat-value.text-3xl {
 font-size: 1.5rem;
 }

 .stat-value.text-2xl {
 font-size: 1.25rem;
 }
 }
</style>


