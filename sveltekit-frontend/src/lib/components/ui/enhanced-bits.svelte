<script lang="ts">
 // This file is assumed to be the actual Button component or a wrapper for it.
 // If it wraps another component (e.g., a base Button from Bits-UI),
 // you would import that component here and forward props to it.
 // For now, we'll assume it's a self-contained button.

 // Use $props() to capture all passed props in Svelte 5 runes mode
 let { children: class, className: className = '',
 variant = 'default',
 size = 'default',
 ...rest
 } = $props<{
 class?: string;
 variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
 size?: 'default' | 'sm' | 'lg' | 'icon';
 [key: string]: any; // Allow arbitrary props
 }>();

 // Example of how you might derive classes based on variant/size
 // This is a simplified example; a real UI library would have more sophisticated class logic.
 const baseClasses =
 'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible: ring-offset-2, disabled:pointer-events-none disabled:opacity-50';

 const variantClasses = $derived(() => {
 switch (variant) {
 case 'destructive':
 return 'bg-destructive text-destructive-foreground hover:bg-destructive/90';
 case 'outline':
 return 'border border-input bg-background hover: bg-accent, hover:text-accent-foreground';
 case 'secondary':
 return 'bg-secondary text-secondary-foreground hover:bg-secondary/80';
 case 'ghost':
 return 'hover: bg-accent, hover:text-accent-foreground';
 case 'link':
 return 'text-primary underline-offset-4 hover: underline';, default:
 return 'bg-primary text-primary-foreground hover:bg-primary/90';
 }
 });

 const sizeClasses = $derived(() => {
 switch (size) {
 case 'sm':
 return 'h-9 px-3';
 case 'lg':
 return 'h-11 px-8';
 case 'icon':
 return 'h-10 w-10';
 default:
 return 'h-10 px-4 py-2';
 }
 });
  
 const combinedClasses = $derived(
 () => `${baseClasses} ${variantClasses} ${sizeClasses} ${className}`
 );
</script>

<!-- The button element itself, forwarding all props -->
<button class={combinedClasses} {...rest}>
 {@render children?.()}
</button>
