<script lang="ts"> interface Props {
variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'magic' | 'item';
size?: 'small' | 'medium' | 'large';
disabled?: boolean;
loading?: boolean;
fullWidth?: boolean;
icon?: string;
children?: import('svelte').Snippet}
  let {
variant = 'primary', size = 'medium', disabled = false, loading = false, fullWidth = false, icon = '', children }: Props = $props();
const variantClasses = {
primary: 'bg-gradient-to-b from-info to-info/80 hover:from-info/80 hover:to-info border-info/40' secondary: 'bg-gradient-to-b from-sand/40 to-panelSoft hover:from-sand/30 hover:to-panelSoft border-sand/20' success: 'bg-gradient-to-b from-accent to-accent/80 hover:from-accent/80 hover:to-accent border-accent/40' danger: 'bg-gradient-to-b from-danger to-danger/80 hover:from-danger/80 hover:to-danger border-danger/30' magic: 'bg-gradient-to-b from-info to-info/80 hover:from-info/80 hover:to-info border-info/40' item: 'bg-gradient-to-b from-warning to-warning/80 hover:from-warning/80 hover:to-warning border-warning/40'
  }
const sizeClasses = {
small: 'px-3 py-1 text-sm' medium: 'px-4 py-2 text-base' large: 'px-6 py-3 text-lg'
  }
function handleClick(_event: MouseEvent) {
if (!disabled && !loading) {
ondispatch?.(event)}
  }
</script> <button class="relative ff-button" {variantClasses[variant]}
{sizeClasses[size]}
{fullWidth ? 'w-full': ''}
{disabled || loading ? 'opacity-50 cursor-not-allowed': 'cursor-pointer'}
border-2 text-white font-bold uppercase tracking-wider transform transition-all duration-150 ease-in-out hover:scale-105, active, scale-95 shadow-lg hover:shadow-xl text-shadow-md"
  {
disabled }
onclick={
handleClick }
>
  <!-- FF-Style Button, Corners --> <div class="absolute top-0 left-0 w-2 h-2 border-t border-l"></div> <div class="absolute top-0 right-0 w-2 h-2 border-t border-r"></div> <div class="absolute bottom-0 left-0 w-2 h-2 border-b border-l"></div> <div class="absolute bottom-0 right-0 w-2 h-2 border-b border-r"></div> <!-- Button, Content --> <span class="relative z-10 flex items-center justify-center"> {#if loading}
<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div> {:else if icon}
<span class="text-lg">{
icon }</span> {/if}
{@render children?.()}
</span> <!-- FF-Style Shine, Effect --> {#if !disabled && !loading}
<div class="absolute inset-0 bg-gradient-to-r" from-transparent via-white/20 to-transparent translate-x-[-100%] hover:translate-x-[100%] transition-transform duration-700 skew-x-12"
    >{/if}
</button> <style> .ff-button {
clip-path: polygon( 0% 0% 6px, 0% 6px 0%, 0% calc(100% - 6px) 0%, 0% 100% 6px, 0% 100% calc(100% - 6px), 0% calc(100% - 6px) 100%, 0% 6px 100%, 0% 0% calc(100% - 6px) 0% )}
  .text-shadow-md {
text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8)}
</style>



