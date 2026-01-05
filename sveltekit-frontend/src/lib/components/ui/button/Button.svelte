<script lang="ts">
  import { Button as BitsButton } from "bits-ui";
  import type { Props as BitsButtonProps } from "bits-ui";
  import { buttonVariants, type ButtonVariantProps } from "../button-variants";
  import { cn } from "$lib/utils/cn";

  interface Props extends BitsButtonProps {
    variant?: ButtonVariantProps["variant"];
    size?: ButtonVariantProps["size"];
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
