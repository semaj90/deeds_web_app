<script lang="ts">
  import { cn } from "$lib";
  import { cva, type VariantProps } from "class-variance-authority";

  const badgeVariants = cva(
    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
    {
      variants: {
	variant: {
          default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
          secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
          destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
          outline: "text-foreground",
          legal: "border-transparent bg-blue-600 text-white hover:bg-blue-700",
          evidence: "border-transparent bg-green-600 text-white hover:bg-green-700",
          yorha: "border-transparent bg-yellow-400 text-black font-bold",
          success: "border-transparent bg-green-500 text-white hover:bg-green-600",
          warning: "border-transparent bg-yellow-500 text-white hover:bg-yellow-600",
        },
	},
	defaultVariants: {
	variant: "default",
      },
	}
  );

  interface Props extends VariantProps<typeof badgeVariants> {
    class?: string;
    children?: any;
    [key: string]: any;
  }

  let {
    variant = "default",
    class: className = "",
    children,
    ...rest
  }: Props = $props();
</script>

<span class={cn(badgeVariants({ variant }), className)} {...rest}>
  {#if children}
    {@render children()}
  {/if}
</span>



