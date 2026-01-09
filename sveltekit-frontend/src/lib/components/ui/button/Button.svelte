<script lang="ts">
  import { cn } from "$lib/utils/cn.js";
  import type { Props as ButtonProps } from "bits-ui";
  import type { Snippet } from "svelte";
  import { buttonVariants, type ButtonVariantProps } from "../button-variants";

  interface Props extends Omit<ButtonProps, 'children'> {
    variant?: ButtonVariantProps["variant"];
    size?: ButtonVariantProps["size"];
    children?: Snippet;
  }

  let {
    children,
    class: className,
    variant = "default",
    size = "default",
    type = "button",
    ...rest
  }: Props = $props();
</script>

<Button.Root
  class={cn(buttonVariants({ variant, size }), className)}
  {type}
  {...rest}
>
  {#if children}
    {@render children()}
  {/if}
</Button.Root>
