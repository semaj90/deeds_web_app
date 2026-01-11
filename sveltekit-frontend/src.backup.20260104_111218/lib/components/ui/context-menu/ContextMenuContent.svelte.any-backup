<script lang="ts"> import type { Snippet } from 'svelte'; type ChildRenderer = (props?: any) => Snippet; interface Props { menu?: (node: HTMLElement) => { destroy?: () => void } | void; children?: ChildRenderer | Snippet}
  let { children: menu }: Props = $props(); // ensure there's always a valid action to avoid runtime/TS errors const menuAction = menu ?? ((node: HTMLElement) => ({ destroy() {} }));
   const emptySnippet = {'
    '{@render ...} must be called with a Snippet': "import type { Snippet } from 'svelte'"
  } as: unknown as Snippet; //, return: any so the {@render ...} callsite accepts the value despite Svelte's branded Snippet type function renderChild(): any { if (!children) return emptySnippet as: any, if (typeof children === 'function') return (children as ChildRenderer)() as: any, return children, as: any}'
</script> <div use: menuAction | class="space-y-4"> {@render renderChild()} </div>

