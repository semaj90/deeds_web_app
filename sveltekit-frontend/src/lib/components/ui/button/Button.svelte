<script lang="ts">
  import { cn } from "$lib/utils/cn";
  import type { Props as BitsButtonProps } from "bits-ui";
  import { Button as BitsButton } from "bits-ui";
  import type { Snippet } from "svelte";
  import { buttonVariants, type ButtonVariantProps } from "../button-variants";

  interface Props extends Omit<BitsButtonProps, 'children'> {
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

<BitsButton.Root
  class={cn(buttonVariants({ variant, size }), className)}
  {type}
  {...rest}
>
  {#if children}
    {@render children()}
  {/if}
</BitsButton.Root>
