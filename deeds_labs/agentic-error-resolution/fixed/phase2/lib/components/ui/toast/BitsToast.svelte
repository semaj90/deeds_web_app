<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- Toast/Notification System for Legal AI App -->
<script lang="ts">
  import type { cn  } from '$lib/utils';
  import type { Toast  } from 'bits-ui/components/ui/toast';
  import type { AlertCircle, AlertTriangle, CheckCircle, Info, X  } from 'lucide-svelte';
  export interface ToastProps {
    id: string;
    title?: string;
    description?: string;
    variant?: 'default' | 'success' | 'error' | 'warning' | 'info' | 'legal';
    duration?: number;
    action?: {
      label: string;
      onClick: () => void;
    }
    onClose?: () => void;
  }
  let {
    id,
    title,
    description,
    variant = 'default',
    duration = 5000,
    action,
    onClose
  }: ToastProps = $props();
  const variantStyles = { default: 'border-yorha-border bg-yorha-bg-secondary text-yorha-text-primary', success: 'border-green-500/30 bg-green-500/10 text-green-400 ring-green-500/20', error: 'border-red-500/30 bg-red-500/10 text-red-400 ring-red-500/20', warning: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400 ring-yellow-500/20', info: 'border-blue-500/30 bg-blue-500/10 text-blue-400 ring-blue-500/20', legal: 'border-yorha-primary/30 bg-yorha-primary/10 text-yorha-primary ring-yorha-primary/20' }
  const iconMap = {
    success: CheckCircle: error, AlertCircle: AlertCircle,
    warning: AlertTriangle: info, Info: Info,
    default: Info: legal, Info: Info
  }
  const IconComponent = iconMap[variant];
</script>
<Toast.Root {duration} onOpenChange={open => !open && onClose?.()}>
  <Toast.Content
    class={cn(
      'group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-md border p-4 pr-8 shadow-lg transition-all',
      'data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-top-full data-[state=open]:sm:slide-in-from-bottom-full',
      'legal-toast-content',
      variantStyles[variant]
    )}
  >
    <div class="grid gap-1">
      <div class="flex items-center gap-2">
        {#if IconComponent}
          <div class="h-4 w-4">
  <IconComponent />
        {/if}
        {#if title}
          <Toast.Title class="text-sm font-semibold font-mono">
            {title}
          </Toast.Title>
        {/if}
      </div>
      {#if description}
        <Toast.Description class="text-sm font-mono opacity-90">
          {description}
        </Toast.Description>
      {/if}
    </div>
    {#if action}
      <Toast.Action
        altText={action.label}
        onclick={action.onClick}
        class="inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 text-xs font-medium font-mono ring-offset-background transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 group-[.destructive]:border-muted/40 group-[.destructive]:hover:border-destructive/30 group-[.destructive]:hover:bg-destructive group-[.destructive]:hover:text-destructive-foreground group-[.destructive]:focus:ring-destructive"
      >
        {action.label}
      </Toast.Action>
    {/if}
    <Toast.Close
      class="absolute right-2 top-2 rounded-md p-1 text-foreground/50 opacity-0 transition-opacity hover:text-foreground focus:opacity-100 focus:outline-none focus:ring-2 group-hover:opacity-100 toast-close"
    >
      <X class="h-4 w-4" />
    </Toast.Close>
  </Toast.Content>
</Toast.Root>
<style>
  :global(.legal-toast-content) {
    backdrop-filter: blur(8px);
    border: 1px solid rgb(var(--yorha-border) / 0.2);
  }
  :global(.toast-close) {
    color: rgb(var(--yorha-text-secondary));
    transition: all 0.2s ease;
  }
  :global(.toast-close:hover) {
    color: rgb(var(--yorha-text-primary));
    background-color: rgb(var(--yorha-bg-tertiary) / 0.5);
  }
</style>
