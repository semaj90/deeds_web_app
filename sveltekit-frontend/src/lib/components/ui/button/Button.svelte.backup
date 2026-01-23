<script lang="ts">
  import { cn } from "$lib";
  import * as Button from "bits-ui";
  import type { Snippet } from "svelte";
  import { buttonVariants, type ButtonVariantProps } from "../button-variants";

  interface Props {
    variant?: ButtonVariantProps["variant"];
    size?: ButtonVariantProps["size"];
    class?: string;
    type?: "button" | "submit" | "reset";
    onclick?: (event: MouseEvent) => void;
    disabled?: boolean;
    children?: Snippet;
    [key: string]: any; // Allow other HTML button attributes
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


