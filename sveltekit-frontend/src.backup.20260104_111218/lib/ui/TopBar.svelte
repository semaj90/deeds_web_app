<script>
let { title = 'YORHA COMMAND CENTER' } = $props();

import Button from './Button.svelte';
</script>

<header class="h-14 border-b border-black/40 bg-sand flex items-center px-4 gap-4">
 <div class="heading-main">{title}</div>

 <div class="ml-auto flex items-center gap-3">
 <div class="relative">
 <input
 class="bg-sandDark text-black px-3 py-1.5 pr-8 rounded border border-black/40 text-xs font-mono w-64
 focus:outline-none focus:ring-2 focus:ring-accent/50"
 placeholder="Search cases, evidence, persons..."
 type="search"
 />
 <span class="i-heroicons-magnifying-glass-20-solid absolute right-2 top-1.5 text-black/70" ></span>
 </div>

 <Button variant="secondary">Login</Button>
 <Button variant="primary">Register</Button>
 </div>
</header>
