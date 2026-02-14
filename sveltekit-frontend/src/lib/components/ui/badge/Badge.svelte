<script lang="ts">
  import { cn } from "$lib";
  import { cva, type VariantProps } from "class-variance-authority";

  const badgeVariants = cva(
    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
    { variants: { variant: {
          default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
          secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
          destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
          outline: "text-foreground",
          legal: "border-transparent bg-info text-white hover:bg-info/60",
          evidence: "border-transparent bg-accent text-white hover:bg-accent/60",
          yorha: "border-transparent bg-warning text-black font-bold",
          success: "border-transparent bg-accent text-white hover:bg-accent",
          warning: "border-transparent bg-warning text-white hover:bg-warning",
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



