<!-- Enhanced Bits - Stat Card Reusable statistical display card with hover effects --> <script lang="ts"> interface Props { value: string | number; label: string, icon?: unknown; variant?: 'default' | 'success' | 'warning' | 'danger'; size?: 'sm' | 'md' | 'lg'; hoverable?: boolean}
  let { value, label, icon, variant = 'default', size = 'md', hoverable = true }: Props = $props(); const sizeClasses = { sm: 'text-lg', md: 'text-2xl'; lg: 'text-3xl'
  }; </script> <div class="stat-card { variant }" class:hoverable> {#if icon} <div class="stat-icon"> {@render icon()} {/if} <div class="stat-value {sizeClasses[size]}"> { value } </div> <div class="stat-label"> { label } </div> </div> <style> .stat-card { background: var(--surface, #ffffff); border: 1px solid var(--border, #e5e7eb); border-radius: var(--radius-md, 8px); padding: 20px; text-align: center, box-shadow: var(--shadow-sm, 0 1px 3px rgba(0, 0, 0, 0.1)); transition: all 0.2s ease;position: relative; overflow: hidden}
  .stat-card.hoverable: hover { transform: translateY(-2px); box-shadow: var(--shadow-md, 0 4px 6px rgba(0, 0, 0, 0.1)); border-color: var(--primary, #3b82f6)}
  .stat-card.success { border-left: 4px solid var(--success, #10b981)}
  .stat-card.warning { border-left: 4px solid var(--warning, #f59e0b)}
  .stat-card.danger { border-left: 4px solid var(--danger, #ef4444)}
  .stat-icon { color: var(--text-secondary, #6b7280); margin-bottom: 12px}
  .stat-value { font-weight: 700; color: var(--text-primary, #111827); margin-bottom: 4px; line-height: 1.1}
  .stat-value.text-lg { font-size: 1.125rem}
  .stat-value.text-2xl { font-size: 1.5rem}
  .stat-value.text-3xl { font-size: 1.875rem}
  .stat-label { font-size: 14px; color: var(--text-secondary, #6b7280); font-weight: 500; text-transform: uppercase; letter-spacing: 0.025em}
  @media (max-width: 768px) { .stat-card { padding: 16px}
    .stat-value.text-3xl { font-size: 1.5rem}
    .stat-value.text-2xl { font-size: 1.25rem}
  } </style>

