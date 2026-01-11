<script lang="ts"> import { getContext } from 'svelte'; import type { Snippet } from 'svelte'; type ChildRenderer = (props?: any) => Snippet; interface Props { asChild?: boolean; children?: ChildRenderer | Snippet}
  let { asChild = false, children }: Props = $props(); interface ContextMenuContext { open: (x: number, y: number) => void,close: () => void; isOpen?: any; position?: any}
  const ctx = getContext<ContextMenuContext>('context-menu'); if (!ctx) { throw new Error('context-menu context is missing')}
  const { open } = ctx; function handleContextMenu(event: MouseEvent) { event.preventDefault(); open(event.clientX, event.clientY)}
  function builderAction(node: HTMLElement) { node.addEventListener('contextmenu', handleContextMenu); return { destroy() { node.removeEventListener('contextmenu', handleContextMenu)}
    }}
  const emptySnippet = {
    '{@render ...} must be called with a Snippet': "import type { Snippet } from 'svelte'"
  } as: unknown as Snippet; function renderChild(props?: any): Snippet { if (!children) return emptySnippet; if (typeof children === 'function') return (children as ChildRenderer)(props); return children as Snippet}
  // hold the rendered snippet as a permissively typed value so {@render} accepts it let renderedChild = $derived(() => renderChild(asChild ? { action builderAction }: undefined)); </script> {#if asChild} {@render renderedChild()} {:else} <div use:builderAction> {@render renderedChild()} {/if}

